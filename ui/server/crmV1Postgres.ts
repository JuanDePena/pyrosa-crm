import type pg from "pg";
import type { CrmServerConfig } from "./config.js";
import { withPostgresTransaction } from "./db.js";
import { CrmV1Error, defaultTenantConfiguration, deriveLifecycleFields, opaqueId, resolveIndustryProfile } from "./crmV1Domain.js";
import { commandPatch, reportCatalog, type CrmCommand, type CrmV1Store } from "./crmV1Store.js";
import type {
  CrmAccessContext,
  CrmJob,
  CrmListQuery,
  CrmMutationContext,
  CrmPage,
  CrmRecord,
  CrmResource,
  DashboardSummary,
  ImportBatch,
  IndustryProfile,
  ReportDefinition,
  TenantConfiguration
} from "./crmV1Types.js";

type RecordRow = {
  id: string;
  status: string;
  owner_id: string | null;
  record_json: Record<string, unknown>;
  sensitive_json?: Record<string, unknown>;
  completed_at?: Date | string | null;
  version: string | number;
  created_at: Date | string;
  updated_at: Date | string;
  archived_at: Date | string | null;
};

type IdempotencyRow = { request_checksum: string; response_json: unknown };

const tables: Record<CrmResource, string> = {
  accounts: "crm_accounts",
  contacts: "crm_contacts",
  cases: "crm_cases",
  activities: "crm_activities",
  appointments: "crm_appointments",
  opportunities: "crm_opportunities"
};

const sortExpressions: Record<CrmResource, Record<string, string>> = {
  accounts: { name: "record_json->>'name'", status: "status", ownerId: "owner_id", createdAt: "created_at", updatedAt: "updated_at" },
  contacts: { displayName: "record_json->>'displayName'", status: "status", role: "contact_role", createdAt: "created_at", updatedAt: "updated_at" },
  cases: { subject: "record_json->>'subject'", status: "status", priority: "priority", slaDueAt: "sla_due_at", createdAt: "created_at", updatedAt: "updated_at" },
  activities: { subject: "record_json->>'subject'", status: "status", type: "activity_type", dueAt: "due_at", createdAt: "created_at", updatedAt: "updated_at" },
  appointments: { status: "status", startAt: "start_at", createdAt: "created_at", updatedAt: "updated_at" },
  opportunities: { name: "record_json->>'name'", status: "status", amountMinor: "amount_minor", probability: "probability", createdAt: "created_at", updatedAt: "updated_at" }
};

const filterExpressions: Record<CrmResource, Record<string, string>> = {
  accounts: { status: "status", type: "account_type", ownerId: "owner_id", tag: "record_json->'tags' ?" },
  contacts: { status: "status", role: "contact_role", accountId: "primary_account_id", consentStatus: "record_json->>'consentStatus'" },
  cases: { status: "status", priority: "priority", queueId: "queue_id", ownerId: "owner_id", accountId: "account_id", contactId: "contact_id" },
  activities: { status: "status", type: "activity_type", ownerId: "owner_id", caseId: "case_id", accountId: "account_id", contactId: "contact_id" },
  appointments: { status: "status", resourceId: "resource_id", caseId: "case_id", accountId: "account_id", contactId: "contact_id" },
  opportunities: { status: "status", pipelineId: "pipeline_id", stageId: "stage_id", ownerId: "owner_id", accountId: "account_id", primaryContactId: "primary_contact_id" }
};

type PhysicalField = { column: string; value: unknown; cast?: "jsonb" };

export class PostgresCrmV1Store implements CrmV1Store {
  constructor(private readonly config: CrmServerConfig) {}

  async list(access: CrmAccessContext, resource: CrmResource, query: CrmListQuery): Promise<CrmPage> {
    const schema = schemaIdent(access);
    const table = tables[resource];
    const filter = listFilterSql(resource, query.filters);
    const values: unknown[] = [...filter.values];
    const predicates = ["archived_at IS NULL"];
    predicates.push(...filter.predicates);
    if (query.q) {
      values.push(`%${escapeLike(query.q)}%`);
      predicates.push(`search_text ILIKE $${values.length} ESCAPE '\\'`);
    }
    const offset = decodeCursor(query.cursor);
    values.push(query.limit, offset);
    const order = sortExpressions[resource][query.sort];
    const result = await this.query<RecordRow & { full_count: string | number }>(
      `SELECT ${recordProjection(resource)},
              count(*) OVER() AS full_count
         FROM ${schema}.${table}
        WHERE ${predicates.join(" AND ")}
        ORDER BY ${order} ${query.direction.toUpperCase()} NULLS LAST, id ASC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    const data = result.rows.map((row) => project(rowToRecord(access, row), access));
    const total = Number(result.rows[0]?.full_count ?? 0);
    return { data, total, nextCursor: offset + data.length < total ? encodeCursor(offset + data.length) : null };
  }

  async get(access: CrmAccessContext, resource: CrmResource, id: string): Promise<CrmRecord | null> {
    const result = await this.query<RecordRow>(
      `SELECT ${recordProjection(resource)}
         FROM ${schemaIdent(access)}.${tables[resource]} WHERE id = $1 AND archived_at IS NULL LIMIT 1`,
      [id]
    );
    return result.rows[0] ? project(rowToRecord(access, result.rows[0]), access) : null;
  }

  async create(resource: CrmResource, input: Record<string, unknown>, mutation: CrmMutationContext): Promise<{ record: CrmRecord; replayed: boolean }> {
    return this.mutate(mutation, `${resource}:create`, async (client, schema) => {
      const persisted = deriveLifecycleFields(
        resource,
        withPersistenceDefaults(resource, input, mutation.access),
        new Date().toISOString()
      );
      if (resource === "opportunities") await ensureDefaultPipeline(client, schema);
      await validateReferences(client, schema, persisted);
      if (resource === "appointments") await assertAppointmentAvailable(client, schema, persisted);
      const id = opaqueId(resource.slice(0, -1));
      const record = await insertResourceRecord(client, schema, resource, id, persisted, mutation.access);
      await appendAuditAndOutbox(client, schema, mutation, `${resource}.created`, resource, id, { id, resource, version: record.version, status: record.status ?? null });
      return { record: project(record, mutation.access), replayed: false };
    });
  }

  async update(resource: CrmResource, id: string, input: Record<string, unknown>, expectedVersion: number, mutation: CrmMutationContext): Promise<{ record: CrmRecord; replayed: boolean }> {
    return this.mutate(mutation, `${resource}:${id}:update`, async (client, schema) => {
      const current = await lockRecord(client, mutation.access, schema, resource, id);
      assertVersion(current, expectedVersion);
      const merged = deriveLifecycleFields(resource, { ...current, ...input }, new Date().toISOString());
      if (resource === "opportunities") await ensureDefaultPipeline(client, schema);
      await validateReferences(client, schema, merged);
      if (resource === "appointments") await assertAppointmentAvailable(client, schema, merged, id);
      const fields = recordPersistenceFields(resource, merged);
      const values: unknown[] = [id, String(merged.status ?? current.status), optional(merged.ownerId), searchText(merged), JSON.stringify(stripBase(resource, merged)), ...fields.map((field) => field.value)];
      const physicalAssignments = fields.map((field, index) => `${field.column} = $${index + 6}${field.cast === "jsonb" ? "::jsonb" : ""}`);
      const result = await client.query<RecordRow>(
        `UPDATE ${schema}.${tables[resource]}
            SET status = $2, owner_id = $3, search_text = $4, record_json = $5::jsonb,
                ${physicalAssignments.join(", ")},
                version = version + 1, updated_at = NOW()
          WHERE id = $1
          RETURNING ${recordProjection(resource)}`,
        values
      );
      const record = rowToRecord(mutation.access, result.rows[0]);
      await appendAuditAndOutbox(client, schema, mutation, `${resource}.updated`, resource, id, { id, version: record.version });
      return { record: project(record, mutation.access), replayed: false };
    });
  }

  async command(resource: CrmResource, id: string, command: CrmCommand, mutation: CrmMutationContext): Promise<{ record: CrmRecord; replayed: boolean }> {
    try {
      return await this.mutate(mutation, `${resource}:${id}:${command.name}`, async (client, schema) => {
        const current = await lockRecord(client, mutation.access, schema, resource, id);
        assertVersion(current, command.expectedVersion);
        const patch = commandPatch(resource, current, command);
        const merged = deriveLifecycleFields(resource, { ...current, ...patch }, new Date().toISOString());
        if (resource === "opportunities") await ensureDefaultPipeline(client, schema);
        await validateReferences(client, schema, merged);
        if (resource === "appointments") await assertAppointmentAvailable(client, schema, merged, id);
        const fields = recordPersistenceFields(resource, merged);
        const values: unknown[] = [id, String(merged.status), optional(merged.ownerId), searchText(merged), JSON.stringify(stripBase(resource, merged)), ...fields.map((field) => field.value)];
        const physicalAssignments = fields.map((field, index) => `${field.column} = $${index + 6}${field.cast === "jsonb" ? "::jsonb" : ""}`);
        const result = await client.query<RecordRow>(
          `UPDATE ${schema}.${tables[resource]}
              SET status = $2, owner_id = $3, search_text = $4, record_json = $5::jsonb,
                  ${physicalAssignments.join(", ")},
                  version = version + 1, updated_at = NOW()
            WHERE id = $1
            RETURNING ${recordProjection(resource)}`,
          values
        );
        const record = rowToRecord(mutation.access, result.rows[0]);
        await appendAuditAndOutbox(client, schema, mutation, `${resource}.${command.name}`, resource, id, { id, reasonCode: patch.reasonCode ?? null, status: record.status, version: record.version });
        return { record: project(record, mutation.access), replayed: false };
      });
    } catch (error) {
      if (error instanceof CrmV1Error) {
        try {
          await withPostgresTransaction(this.config, async (client) => {
            await appendRejectedAudit(client, schemaIdent(mutation.access), mutation, `${resource}.${command.name}`, resource, id, error.code);
          });
        } catch {
          // Preserve the original domain rejection even when audit persistence is unavailable.
        }
      }
      throw error;
    }
  }

  async dashboard(access: CrmAccessContext, period: { from: string; to: string }): Promise<DashboardSummary> {
    const schema = schemaIdent(access);
    const profile = await this.effectiveProfile(access);
    const effectiveAccess = { ...access, profileKey: profile.key, profileVersion: profile.version };
    const result = await this.query<{
      accounts: string; contacts: string; cases: string; cases_open: string; cases_overdue: string;
      activities: string; activities_open: string; appointments: string; appointments_stock: string; appointment_exceptions: string;
      opportunities: string; opportunities_open: string; stock_total: string;
    }>(`SELECT
      (SELECT count(*) FROM ${schema}.crm_accounts WHERE archived_at IS NULL AND updated_at >= $1::timestamptz AND updated_at < $2::timestamptz)::text AS accounts,
      (SELECT count(*) FROM ${schema}.crm_contacts WHERE archived_at IS NULL AND updated_at >= $1::timestamptz AND updated_at < $2::timestamptz)::text AS contacts,
      (SELECT count(*) FROM ${schema}.crm_cases WHERE archived_at IS NULL AND updated_at >= $1::timestamptz AND updated_at < $2::timestamptz)::text AS cases,
      (SELECT count(*) FROM ${schema}.crm_cases WHERE archived_at IS NULL AND status NOT IN ('closed','cancelled'))::text AS cases_open,
      (SELECT count(*) FROM ${schema}.crm_cases WHERE archived_at IS NULL AND status NOT IN ('resolved','closed','cancelled') AND sla_due_at < NOW())::text AS cases_overdue,
      (SELECT count(*) FROM ${schema}.crm_activities WHERE archived_at IS NULL AND updated_at >= $1::timestamptz AND updated_at < $2::timestamptz)::text AS activities,
      (SELECT count(*) FROM ${schema}.crm_activities WHERE archived_at IS NULL AND status IN ('open','in_progress'))::text AS activities_open,
      (SELECT count(*) FROM ${schema}.crm_appointments WHERE archived_at IS NULL AND updated_at >= $1::timestamptz AND updated_at < $2::timestamptz)::text AS appointments,
      (SELECT count(*) FROM ${schema}.crm_appointments WHERE archived_at IS NULL)::text AS appointments_stock,
      (SELECT count(*) FROM ${schema}.crm_appointments WHERE archived_at IS NULL AND status IN ('sync_failed','no_show'))::text AS appointment_exceptions,
      (SELECT count(*) FROM ${schema}.crm_opportunities WHERE archived_at IS NULL AND updated_at >= $1::timestamptz AND updated_at < $2::timestamptz)::text AS opportunities,
      (SELECT count(*) FROM ${schema}.crm_opportunities WHERE archived_at IS NULL AND stage_id NOT IN ('won','lost'))::text AS opportunities_open,
      ((SELECT count(*) FROM ${schema}.crm_accounts WHERE archived_at IS NULL)
       + (SELECT count(*) FROM ${schema}.crm_contacts WHERE archived_at IS NULL)
       + (SELECT count(*) FROM ${schema}.crm_cases WHERE archived_at IS NULL)
       + (SELECT count(*) FROM ${schema}.crm_activities WHERE archived_at IS NULL)
       + (SELECT count(*) FROM ${schema}.crm_appointments WHERE archived_at IS NULL)
       + (SELECT count(*) FROM ${schema}.crm_opportunities WHERE archived_at IS NULL))::text AS stock_total`,
      [period.from, period.to]
    );
    return dashboardFromCounts(effectiveAccess, period, Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)])));
  }

  async profiles(): Promise<IndustryProfile[]> { return [resolveIndustryProfile("core", "1"), resolveIndustryProfile("healthcare-call-center", "1")]; }

  async effectiveProfile(access: CrmAccessContext): Promise<IndustryProfile> {
    const config = await this.getConfiguration(access);
    return resolveIndustryProfile(config.profileKey, config.profileVersion);
  }

  async getConfiguration(access: CrmAccessContext): Promise<TenantConfiguration> {
    const result = await this.query<{ configuration_json: TenantConfiguration; version: string | number; updated_at: Date | string }>(
      `SELECT configuration_json, version, updated_at FROM ${schemaIdent(access)}.crm_tenant_configuration WHERE singleton_key = 'effective' LIMIT 1`
    );
    if (!result.rows[0]) return { ...defaultTenantConfiguration(access.profileKey, access.profileVersion), timezone: access.timezone, locale: access.locale };
    return { ...result.rows[0].configuration_json, version: Number(result.rows[0].version), updatedAt: isoDate(result.rows[0].updated_at) };
  }

  async updateConfiguration(input: Partial<TenantConfiguration>, expectedVersion: number, mutation: CrmMutationContext): Promise<TenantConfiguration> {
    const result = await this.mutate(mutation, "configuration:update", async (client, schema) => {
      const result = await client.query<{ configuration_json: TenantConfiguration; version: string | number }>(
        `SELECT configuration_json, version FROM ${schema}.crm_tenant_configuration WHERE singleton_key = 'effective' FOR UPDATE`
      );
      const current = result.rows[0]
        ? { ...result.rows[0].configuration_json, version: Number(result.rows[0].version) }
        : { ...defaultTenantConfiguration(mutation.access.profileKey, mutation.access.profileVersion), timezone: mutation.access.timezone, locale: mutation.access.locale };
      if (current.version !== expectedVersion) throw new CrmV1Error(412, "crm.version.conflict", "La configuracion fue modificada por otra operacion.");
      const profileKey = String(input.profileKey ?? current.profileKey); const profileVersion = String(input.profileVersion ?? current.profileVersion);
      resolveIndustryProfile(profileKey, profileVersion);
      const next = { ...current, ...input, profileKey, profileVersion, version: current.version + 1, updatedAt: new Date().toISOString() } as TenantConfiguration;
      await client.query(
        `INSERT INTO ${schema}.crm_tenant_configuration (singleton_key, profile_key, profile_version, configuration_json, version, updated_at)
         VALUES ('effective',$1,$2,$3::jsonb,$4,NOW())
         ON CONFLICT (singleton_key) DO UPDATE SET profile_key=EXCLUDED.profile_key, profile_version=EXCLUDED.profile_version, configuration_json=EXCLUDED.configuration_json, version=EXCLUDED.version, updated_at=NOW()`,
        [profileKey, profileVersion, JSON.stringify(stripConfigVersion(next)), next.version]
      );
      await appendAuditAndOutbox(client, schema, mutation, "configuration.updated", "tenant-configuration", mutation.access.tenantId, { version: next.version, profile: `${profileKey}@${profileVersion}` });
      return { configuration: next, replayed: false };
    });
    return result.configuration;
  }

  async reports(access: CrmAccessContext): Promise<ReportDefinition[]> {
    const profile = await this.effectiveProfile(access);
    return reportCatalog.filter((report) => report.profileKeys.includes(profile.key));
  }

  async createJob(kind: "report-run" | "export", input: Record<string, unknown>, mutation: CrmMutationContext): Promise<{ job: CrmJob; replayed: boolean }> {
    return this.mutate(mutation, `job:${kind}`, async (client, schema) => {
      const now = new Date(); const id = opaqueId(kind === "export" ? "export" : "report");
      const expiresAt = kind === "export" ? new Date(now.valueOf() + 86_400_000).toISOString() : null;
      const result = await client.query<RecordRow>(
        `INSERT INTO ${schema}.crm_jobs (id, kind, status, expires_at, record_json, version, created_at, updated_at)
         VALUES ($1,$2,'accepted',$3,$4::jsonb,1,NOW(),NOW())
         RETURNING id, status, NULL::text AS owner_id, record_json, version, created_at, updated_at, NULL::timestamptz AS archived_at`,
        [id, kind, expiresAt, JSON.stringify({ ...input, kind, expiresAt })]
      );
      const job = { ...rowToRecord(mutation.access, result.rows[0]), kind, expiresAt } as CrmJob;
      await appendAuditAndOutbox(client, schema, mutation, `${kind}.accepted`, kind, id, { id, status: "accepted" });
      return { job, replayed: false };
    });
  }

  async getJob(access: CrmAccessContext, id: string): Promise<CrmJob | null> {
    const result = await this.query<RecordRow & { kind: "report-run" | "export"; expires_at: Date | string | null }>(
      `SELECT id, kind, status, NULL::text AS owner_id, record_json, version, created_at, updated_at, NULL::timestamptz AS archived_at, expires_at
       FROM ${schemaIdent(access)}.crm_jobs WHERE id=$1 LIMIT 1`, [id]
    );
    return result.rows[0] ? { ...rowToRecord(access, result.rows[0]), kind: result.rows[0].kind, expiresAt: result.rows[0].expires_at ? isoDate(result.rows[0].expires_at) : null } as CrmJob : null;
  }

  async importPreflight(input: Record<string, unknown>, mutation: CrmMutationContext): Promise<{ batch: ImportBatch; replayed: boolean }> {
    return this.mutate(mutation, "import:preflight", async (client, schema) => {
      const fingerprint = String(input.sourceFingerprint ?? "").trim().toLowerCase(); const source = Array.isArray(input.records) ? input.records : [];
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new CrmV1Error(400, "crm.import.fingerprint_invalid", "sourceFingerprint SHA-256 es obligatorio.");
      if (source.length < 1 || source.length > 10_000) throw new CrmV1Error(400, "crm.import.records_invalid", "El lote debe contener entre 1 y 10000 registros normalizados.");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`crm-import:${fingerprint}`]);
      const existing = await client.query(`SELECT * FROM ${schema}.crm_import_batches WHERE source_fingerprint=$1 LIMIT 1`, [fingerprint]);
      if (existing.rows[0]) return { batch: importRow(mutation.access, existing.rows[0]), replayed: true };
      const records = source.map((value, index) => normalizeImport(value, index + 1));
      const seen = new Set<string>(); const duplicates = new Set<string>();
      for (const record of records) { const id = String(record.externalId ?? ""); if (seen.has(id) && id) duplicates.add(id); seen.add(id); }
      const quarantine = records.flatMap((record, index) => { const fields = [!record.externalId ? "externalId" : "", !record.caseSubject ? "caseSubject" : "", duplicates.has(String(record.externalId)) ? "externalId" : ""].filter(Boolean); return fields.length ? [{ sourceRow: index + 1, code: duplicates.has(String(record.externalId)) ? "duplicate" : "required", fields: [...new Set(fields)] }] : []; });
      const id = opaqueId("import"); const acceptedCount = records.length - quarantine.length;
      await client.query(`INSERT INTO ${schema}.crm_import_batches (id,status,source_fingerprint,source_record_count,accepted_count,duplicate_count,quarantine_count,quarantine_json,version,created_at,updated_at) VALUES ($1,'staged',$2,$3,$4,$5,$6,$7::jsonb,1,NOW(),NOW())`, [id,fingerprint,records.length,acceptedCount,quarantine.filter((item)=>item.code==="duplicate").length,quarantine.length,JSON.stringify(quarantine)]);
      for (const record of records) await client.query(`INSERT INTO ${schema}.crm_import_records (batch_id,source_row,normalized_json,status,created_at) VALUES ($1,$2,$3::jsonb,$4,NOW())`, [id,record.sourceRow,JSON.stringify(record),quarantine.some((item)=>item.sourceRow===record.sourceRow)?"quarantined":"accepted"]);
      const batch: ImportBatch = { id, tenantId: mutation.access.tenantId, status:"staged",sourceFingerprint:fingerprint,sourceRecordCount:records.length,acceptedCount,duplicateCount:quarantine.filter((item)=>item.code==="duplicate").length,quarantineCount:quarantine.length,quarantine,version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),archivedAt:null };
      await appendAuditAndOutbox(client,schema,mutation,"import.staged","import",id,{sourceRecordCount:records.length,quarantineCount:quarantine.length});
      return { batch, replayed:false };
    });
  }

  async importCommand(id: string, command: "dry-run"|"commit"|"rollback", mutation: CrmMutationContext): Promise<{batch:ImportBatch;replayed:boolean}> {
    return this.mutate(mutation,`import:${id}:${command}`,async(client,schema)=>{
      const current=await loadImport(client,mutation.access,schema,id,true);
      if(!current) throw new CrmV1Error(404,"crm.import.not_found","No existe el lote solicitado.");
      if(command==="dry-run"&&current.status!=="staged") throw new CrmV1Error(409,"crm.import.transition_invalid","El dry-run solo aplica a un lote staged.");
      if(command==="commit"&&(current.status!=="validated"||current.quarantineCount>0)) throw new CrmV1Error(409,current.quarantineCount>0?"crm.import.quarantine_unresolved":"crm.import.transition_invalid",current.quarantineCount>0?"Resuelva quarantine antes del commit.":"El commit requiere un dry-run validado.");
      if(command==="rollback"&&!(current.status==="validated"||current.status==="committed")) throw new CrmV1Error(409,"crm.import.transition_invalid","El lote no admite rollback.");

      if(command==="commit") await materializeImportRows(client,schema,id,mutation.access);
      if(command==="rollback"&&current.status==="committed") await rollbackImportRows(client,schema,id);
      if(command==="rollback"&&current.status==="validated") {
        await client.query(`UPDATE ${schema}.crm_import_records SET status='rolled_back' WHERE batch_id=$1 AND status='accepted'`,[id]);
      }

      const status=command==="dry-run"?"validated":command==="commit"?"committed":"rolled_back";
      const result=await client.query(`UPDATE ${schema}.crm_import_batches SET status=$2,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,status]);
      const batch=importRow(mutation.access,result.rows[0]);
      await appendAuditAndOutbox(client,schema,mutation,`import.${command.replace("-","_")}`,"import",id,{status,acceptedCount:batch.acceptedCount,quarantineCount:batch.quarantineCount});
      return {batch,replayed:false};
    });
  }

  async getImport(access:CrmAccessContext,id:string):Promise<ImportBatch|null>{ return withPostgresTransaction(this.config,(client)=>loadImport(client,access,schemaIdent(access),id,false)); }

  private async query<T extends pg.QueryResultRow>(text:string,values:unknown[]=[]):Promise<pg.QueryResult<T>>{ return withPostgresTransaction(this.config,(client)=>client.query<T>(text,values)); }

  private async mutate<T extends { replayed:boolean }>(mutation:CrmMutationContext,_operation:string,work:(client:pg.PoolClient,schema:string)=>Promise<T>):Promise<T>{
    return withPostgresTransaction(this.config,async(client)=>{const schema=schemaIdent(mutation.access);const key=mutation.idempotencyKey;await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",[`${schema}:${key}`]);const existing=await client.query<IdempotencyRow>(`SELECT request_checksum,response_json FROM ${schema}.crm_idempotency_results WHERE idempotency_key=$1 FOR UPDATE`,[key]);if(existing.rows[0]){if(existing.rows[0].request_checksum!==mutation.requestChecksum)throw new CrmV1Error(409,"crm.idempotency.conflict","Idempotency-Key ya fue usada con otro contenido.");return {...(existing.rows[0].response_json as T),replayed:true};}const result=await work(client,schema);await client.query(`INSERT INTO ${schema}.crm_idempotency_results (idempotency_key,request_checksum,response_json,created_at,updated_at) VALUES ($1,$2,$3::jsonb,NOW(),NOW())`,[key,mutation.requestChecksum,JSON.stringify(result)]);return result;});
  }
}

export function recordPersistenceFields(resource: CrmResource, input: Record<string, unknown>): PhysicalField[] {
  switch (resource) {
    case "accounts":
      return [
        { column: "account_type", value: requiredPhysical(input.type, "type") },
        { column: "external_ref", value: optional(input.externalRef) }
      ];
    case "contacts":
      return [
        { column: "primary_account_id", value: optional(input.accountId) },
        { column: "contact_role", value: requiredPhysical(input.role, "role") },
        { column: "sensitive_json", value: JSON.stringify(sensitivePayload(input.sensitive)), cast: "jsonb" }
      ];
    case "cases":
      assertPersistableExtensions(input.extensions);
      return [
        { column: "account_id", value: optional(input.accountId) },
        { column: "contact_id", value: optional(input.contactId) },
        { column: "case_type", value: requiredPhysical(input.caseType, "caseType") },
        { column: "priority", value: requiredPhysical(input.priority, "priority") },
        { column: "queue_id", value: optional(input.queueId) },
        { column: "sla_due_at", value: optional(input.slaDueAt) }
      ];
    case "activities":
      return [
        { column: "case_id", value: optional(input.caseId) },
        { column: "account_id", value: optional(input.accountId) },
        { column: "contact_id", value: optional(input.contactId) },
        { column: "activity_type", value: requiredPhysical(input.type, "type") },
        { column: "due_at", value: optional(input.dueAt) },
        { column: "completed_at", value: optional(input.completedAt) }
      ];
    case "appointments":
      return [
        { column: "case_id", value: requiredPhysical(input.caseId, "caseId") },
        { column: "account_id", value: optional(input.accountId) },
        { column: "contact_id", value: optional(input.contactId) },
        { column: "resource_id", value: optional(input.resourceId) },
        { column: "start_at", value: optional(input.startAt) },
        { column: "end_at", value: optional(input.endAt) },
        { column: "timezone", value: requiredPhysical(input.timezone, "timezone") },
        { column: "external_ref", value: optional(input.externalRef) }
      ];
    case "opportunities":
      return [
        { column: "account_id", value: requiredPhysical(input.accountId, "accountId") },
        { column: "primary_contact_id", value: optional(input.primaryContactId) },
        { column: "pipeline_id", value: requiredPhysical(input.pipelineId, "pipelineId") },
        { column: "stage_id", value: requiredPhysical(input.stageId, "stageId") },
        { column: "amount_minor", value: Number(input.amountMinor ?? 0) },
        { column: "currency", value: requiredPhysical(input.currency ?? "USD", "currency") },
        { column: "probability", value: Number(input.probability ?? 0) },
        { column: "close_reason", value: optional(input.closeReason) }
      ];
  }
}

export function listFilterSql(resource: CrmResource, filters: Record<string, string>): { predicates: string[]; values: string[] } {
  const values: string[] = [];
  const predicates: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (key === "attention" && resource === "cases") {
      values.push(value);
      predicates.push(`$${values.length} = 'overdue' AND sla_due_at IS NOT NULL AND sla_due_at < NOW() AND status NOT IN ('resolved','closed','cancelled')`);
      continue;
    }
    if (key === "attention" && resource === "appointments") {
      values.push(value);
      predicates.push(`$${values.length} = 'exception' AND status IN ('sync_failed','no_show')`);
      continue;
    }
    if (key === "attention" && resource === "activities") {
      values.push(value);
      predicates.push(`$${values.length} = 'pending' AND status IN ('open','in_progress')`);
      continue;
    }
    const expression = filterExpressions[resource][key];
    if (!expression) {
      throw new CrmV1Error(400, "crm.validation.failed", "El filtro no esta permitido para el recurso.");
    }
    values.push(value);
    predicates.push(key === "tag" ? `${expression} $${values.length}` : `${expression} = $${values.length}`);
  }
  return { predicates, values };
}

function withPersistenceDefaults(resource: CrmResource, input: Record<string, unknown>, access: CrmAccessContext): Record<string, unknown> {
  if (resource === "appointments" && !input.timezone) return { ...input, timezone: access.timezone };
  if (resource === "contacts" && input.sensitive === undefined) return { ...input, sensitive: {} };
  return input;
}

function recordProjection(resource: CrmResource): string {
  return `id, status, owner_id, record_json${resource === "contacts" ? ", sensitive_json" : ""}${resource === "activities" ? ", completed_at" : ""}, version, created_at, updated_at, archived_at`;
}

async function ensureDefaultPipeline(client: pg.PoolClient, schema: string): Promise<void> {
  await client.query(
    `INSERT INTO ${schema}.crm_pipelines (id, profile_key, name, status, version, created_at, updated_at)
     VALUES ('default', 'core', 'Pipeline predeterminado', 'active', 1, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`
  );
  await client.query(
    `INSERT INTO ${schema}.crm_pipeline_stages
       (id, pipeline_id, stage_key, label, position, default_probability, terminal_kind, version)
     VALUES
       ('lead', 'default', 'lead', 'Lead', 10, 10, NULL, 1),
       ('qualified', 'default', 'qualified', 'Calificada', 20, 40, NULL, 1),
       ('proposal', 'default', 'proposal', 'Propuesta', 30, 70, NULL, 1),
       ('won', 'default', 'won', 'Ganada', 40, 100, 'won', 1),
       ('lost', 'default', 'lost', 'Perdida', 50, 0, 'lost', 1)
     ON CONFLICT (id) DO NOTHING`
  );
}

async function insertResourceRecord(
  client: pg.PoolClient,
  schema: string,
  resource: CrmResource,
  id: string,
  input: Record<string, unknown>,
  access: CrmAccessContext
): Promise<CrmRecord> {
  const fields = recordPersistenceFields(resource, input);
  const baseValues: unknown[] = [
    id,
    String(input.status ?? "active"),
    optional(input.ownerId),
    searchText(input),
    JSON.stringify(stripBase(resource, input))
  ];
  const values = [...baseValues, ...fields.map((field) => field.value)];
  const columns = ["id", "status", "owner_id", "search_text", "record_json", ...fields.map((field) => field.column)];
  const placeholders = values.map((_, index) => `$${index + 1}${index === 4 || fields[index - baseValues.length]?.cast === "jsonb" ? "::jsonb" : ""}`);
  const result = await client.query<RecordRow>(
    `INSERT INTO ${schema}.${tables[resource]} (${columns.join(", ")}, version, created_at, updated_at)
     VALUES (${placeholders.join(", ")}, 1, NOW(), NOW())
     RETURNING ${recordProjection(resource)}`,
    values
  );
  return rowToRecord(access, result.rows[0]);
}

async function materializeImportRows(client: pg.PoolClient, schema: string, batchId: string, access: CrmAccessContext): Promise<void> {
  const result = await client.query<{ normalized_json: Record<string, unknown>; source_row: string | number }>(
    `SELECT source_row, normalized_json
       FROM ${schema}.crm_import_records
      WHERE batch_id=$1 AND status='accepted'
      ORDER BY source_row
      FOR UPDATE`,
    [batchId]
  );
  for (const row of result.rows) {
    const source = row.normalized_json ?? {};
    const sourceRow = Number(row.source_row);
    const metadata = { importBatchId: batchId, importSourceRow: sourceRow, importExternalId: String(source.externalId ?? "") };
    let accountId: string | null = null;
    let contactId: string | null = null;
    if (String(source.accountName ?? "").trim()) {
      accountId = opaqueId("account");
      await insertResourceRecord(client, schema, "accounts", accountId, {
        ...metadata,
        externalRef: `import:${batchId}:${String(source.externalId ?? sourceRow)}`,
        name: String(source.accountName),
        status: "active",
        type: "organization"
      }, access);
    }
    if (String(source.contactAlias ?? "").trim()) {
      contactId = opaqueId("contact");
      await insertResourceRecord(client, schema, "contacts", contactId, {
        ...metadata,
        accountId,
        displayName: String(source.contactAlias),
        role: "patient",
        sensitive: {},
        status: "active"
      }, access);
    }
    const priority = ["low", "normal", "high", "urgent"].includes(String(source.priority ?? ""))
      ? String(source.priority)
      : "normal";
    const caseId = opaqueId("case");
    await insertResourceRecord(client, schema, "cases", caseId, {
      ...metadata,
      accountId,
      caseType: String(source.caseType ?? "").trim() || "case-follow-up",
      contactId,
      priority,
      queueId: optional(source.queueKey),
      status: "new",
      subject: String(source.caseSubject)
    }, access);
    await client.query(
      `UPDATE ${schema}.crm_import_records
          SET status='committed', target_type='case', target_id=$3
        WHERE batch_id=$1 AND source_row=$2`,
      [batchId, sourceRow, caseId]
    );
  }
}

async function rollbackImportRows(client: pg.PoolClient, schema: string, batchId: string): Promise<void> {
  for (const table of ["crm_cases", "crm_contacts", "crm_accounts"] as const) {
    const locked = await client.query<{ archived_at: Date | string | null; version: string | number }>(
      `SELECT version, archived_at FROM ${schema}.${table} WHERE record_json->>'importBatchId'=$1 FOR UPDATE`,
      [batchId]
    );
    if (locked.rows.some((row) => Number(row.version) !== 1 || row.archived_at !== null)) {
      throw new CrmV1Error(409, "crm.import.rollback_conflict", "El rollback fue bloqueado porque un registro importado cambio despues del commit.");
    }
  }
  await client.query(
    `UPDATE ${schema}.crm_cases
        SET status='cancelled', archived_at=NOW(), version=version+1, updated_at=NOW()
      WHERE archived_at IS NULL AND record_json->>'importBatchId'=$1`,
    [batchId]
  );
  await client.query(
    `UPDATE ${schema}.crm_contacts
        SET status='archived', archived_at=NOW(), version=version+1, updated_at=NOW()
      WHERE archived_at IS NULL AND record_json->>'importBatchId'=$1`,
    [batchId]
  );
  await client.query(
    `UPDATE ${schema}.crm_accounts
        SET status='archived', archived_at=NOW(), version=version+1, updated_at=NOW()
      WHERE archived_at IS NULL AND record_json->>'importBatchId'=$1`,
    [batchId]
  );
  await client.query(
    `UPDATE ${schema}.crm_import_records
        SET status='rolled_back'
      WHERE batch_id=$1 AND status='committed'`,
    [batchId]
  );
}

async function lockRecord(client:pg.PoolClient,access:CrmAccessContext,schema:string,resource:CrmResource,id:string):Promise<CrmRecord>{const result=await client.query<RecordRow>(`SELECT ${recordProjection(resource)} FROM ${schema}.${tables[resource]} WHERE id=$1 AND archived_at IS NULL FOR UPDATE`,[id]);if(!result.rows[0])throw new CrmV1Error(404,`crm.${resource.slice(0,-1)}.not_found`,`No existe el recurso solicitado.`);return rowToRecord(access,result.rows[0]);}
async function validateReferences(client:pg.PoolClient,schema:string,input:Record<string,unknown>):Promise<void>{const refs:[[unknown,string],...[unknown,string][]]=[[input.accountId,"crm_accounts"],[input.contactId,"crm_contacts"],[input.primaryContactId,"crm_contacts"],[input.caseId,"crm_cases"]];for(const[id,table]of refs){if(!id)continue;const found=await client.query(`SELECT 1 FROM ${schema}.${table} WHERE id=$1 AND archived_at IS NULL`,[id]);if(found.rowCount!==1)throw new CrmV1Error(409,"crm.reference.invalid","Una referencia no existe en el tenant.");}if(input.pipelineId||input.stageId){const catalog=await client.query(`SELECT 1 FROM ${schema}.crm_pipeline_stages WHERE id=$1 AND pipeline_id=$2`,[input.stageId,input.pipelineId]);if(catalog.rowCount!==1)throw new CrmV1Error(409,"crm.pipeline.reference_invalid","El pipeline o la etapa no existe en el tenant.");}}
async function assertAppointmentAvailable(client:pg.PoolClient,schema:string,input:Record<string,unknown>,excludingId?:string):Promise<void>{if(!input.startAt&&!input.endAt)return;if(!input.startAt||!input.endAt)throw new CrmV1Error(400,"crm.appointment.range_invalid","Inicio y fin deben declararse juntos.");const start=new Date(String(input.startAt));const end=new Date(String(input.endAt));if(Number.isNaN(start.valueOf())||Number.isNaN(end.valueOf())||end<=start)throw new CrmV1Error(400,"crm.appointment.range_invalid","El rango de la cita no es valido.");if(!input.resourceId)return;const result=await client.query(`SELECT 1 FROM ${schema}.crm_appointments WHERE archived_at IS NULL AND id<>COALESCE($1,'') AND status NOT IN ('cancelled','no_show') AND resource_id=$2 AND start_at<$4 AND end_at>$3 LIMIT 1`,[excludingId??null,input.resourceId,start.toISOString(),end.toISOString()]);if(result.rowCount)throw new CrmV1Error(409,"crm.appointment.conflict","El recurso ya tiene una cita en ese rango.");}

async function appendAuditAndOutbox(client:pg.PoolClient,schema:string,mutation:CrmMutationContext,action:string,entityType:string,entityId:string,payload:Record<string,unknown>):Promise<void>{const eventId=opaqueId("event");const reasonCode=typeof payload.reasonCode==="string"&&payload.reasonCode?payload.reasonCode:null;await client.query(`INSERT INTO ${schema}.crm_audit_events (id,request_id,actor_subject,authorization_decision_id,action,event_type,entity_type,entity_id,outcome,reason_code,occurred_at) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,'accepted',$8,NOW())`,[opaqueId("audit"),mutation.requestId,mutation.actor.subject,mutation.access.authorizationDecisionId,action,entityType,entityId,reasonCode]);await client.query(`INSERT INTO ${schema}.crm_outbox_events (event_id,event_type,contract_version,correlation_id,causation_id,actor_subject,payload_json,status,occurred_at) VALUES ($1,$2,'1',$3,$4,$5,$6::jsonb,'pending',NOW())`,[eventId,`crm.${action}`,mutation.correlationId,mutation.idempotencyKey,mutation.actor.subject,JSON.stringify(payload)]);}
async function appendRejectedAudit(client:pg.PoolClient,schema:string,mutation:CrmMutationContext,action:string,entityType:string,entityId:string,reasonCode:string):Promise<void>{await client.query(`INSERT INTO ${schema}.crm_audit_events (id,request_id,actor_subject,authorization_decision_id,action,event_type,entity_type,entity_id,outcome,reason_code,occurred_at) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,'rejected',$8,NOW())`,[opaqueId("audit"),mutation.requestId,mutation.actor.subject,mutation.access.authorizationDecisionId,action,entityType,entityId,reasonCode]);}

function rowToRecord(access:CrmAccessContext,row:RecordRow):CrmRecord{const sensitive=row.sensitive_json&&Object.keys(row.sensitive_json).length>0?{sensitive:row.sensitive_json}:{};const completion=row.completed_at===undefined?{}:{completedAt:row.completed_at?isoDate(row.completed_at):null};return{...row.record_json,...sensitive,...completion,id:row.id,tenantId:access.tenantId,status:row.status,ownerId:row.owner_id,version:Number(row.version),createdAt:isoDate(row.created_at),updatedAt:isoDate(row.updated_at),archivedAt:row.archived_at?isoDate(row.archived_at):null};}
function project(record:CrmRecord,access:CrmAccessContext):CrmRecord{const copy=structuredClone(record);if(copy.sensitive!==undefined&&!access.capabilities.includes("crm.sensitive.read")){delete copy.sensitive;copy.masked=true;}return copy;}
function stripBase(resource:CrmResource,input:Record<string,unknown>):Record<string,unknown>{const copy={...input};for(const key of ["id","tenantId","version","createdAt","updatedAt","archivedAt","status","ownerId","completedAt"])delete copy[key];if(resource==="contacts")delete copy.sensitive;return copy;}
function stripConfigVersion(config:TenantConfiguration):Record<string,unknown>{const copy={...config} as Record<string,unknown>;delete copy.version;delete copy.updatedAt;return copy;}
function searchText(input:Record<string,unknown>):string{return[input.name,input.displayName,input.subject,input.caseType,input.type,input.status].map((value)=>String(value??"").trim().toLocaleLowerCase()).join(" ").slice(0,800);}
function assertVersion(record:CrmRecord,expected:number):void{if(record.version!==expected)throw new CrmV1Error(412,"crm.version.conflict","El recurso fue modificado por otra operacion.");}
function schemaIdent(access:CrmAccessContext):string{if(!/^pyrosa_(?:demo)?crm_[a-z0-9_]{3,48}$/.test(access.schemaName)||!access.schemaName.endsWith(`_${access.tenantKey}`))throw new CrmV1Error(500,"crm.schema.invalid","El contexto CRM no contiene un schema valido.");return `"${access.schemaName}"`;}
function optional(value:unknown):string|null{const text=String(value??"").trim();return text||null;}
function requiredPhysical(value:unknown,field:string):string{const text=String(value??"").trim();if(!text)throw new CrmV1Error(400,"crm.validation.failed",`El campo ${field} es obligatorio para persistencia.`);return text;}
function sensitivePayload(value:unknown):Record<string,unknown>{if(value===undefined||value===null)return{};if(!value||typeof value!=="object"||Array.isArray(value))throw new CrmV1Error(400,"crm.validation.failed","sensitive debe ser un objeto JSON.");if(Object.keys(value as Record<string,unknown>).length>0)throw new CrmV1Error(503,"crm.sensitive.persistence_unavailable","Los atributos sensibles permanecen bloqueados hasta habilitar cifrado por campo.",false);return{};}
function assertPersistableExtensions(value:unknown):void{if(value===undefined||value===null)return;if(!value||typeof value!=="object"||Array.isArray(value))throw new CrmV1Error(400,"crm.validation.failed","extensions debe ser un objeto JSON.");if(Object.keys(value as Record<string,unknown>).length>0)throw new CrmV1Error(503,"crm.extensions.persistence_unavailable","Las extensiones declarativas permanecen bloqueadas hasta habilitar schema y cifrado por perfil.",false);}
function isoDate(value:Date|string):string{return new Date(value).toISOString();}
function encodeCursor(offset:number):string{return Buffer.from(JSON.stringify({offset}),"utf8").toString("base64url");}
function decodeCursor(cursor:string|null):number{if(!cursor)return 0;try{const offset=Number((JSON.parse(Buffer.from(cursor,"base64url").toString("utf8"))as{offset?:unknown}).offset);if(Number.isInteger(offset)&&offset>=0)return offset;}catch{}throw new CrmV1Error(400,"crm.pagination.cursor_invalid","El cursor no es valido.");}
function escapeLike(value:string):string{return value.replace(/[\\%_]/g,"\\$&");}
function normalizeImport(value:unknown,sourceRow:number):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))return{sourceRow};const source=value as Record<string,unknown>;const allowed=["externalId","accountName","contactAlias","caseSubject","caseType","priority","queueKey","appointmentRequested"];return Object.fromEntries([["sourceRow",sourceRow],...allowed.filter((key)=>source[key]!==undefined).map((key)=>[key,typeof source[key]==="boolean"?source[key]:String(source[key]??"").trim().slice(0,240)])]);}
async function loadImport(client:pg.PoolClient,access:CrmAccessContext,schema:string,id:string,lock:boolean):Promise<ImportBatch|null>{const result=await client.query(`SELECT * FROM ${schema}.crm_import_batches WHERE id=$1${lock?" FOR UPDATE":""}`,[id]);return result.rows[0]?importRow(access,result.rows[0]):null;}
function importRow(access:CrmAccessContext,row:Record<string,unknown>):ImportBatch{return{id:String(row.id),tenantId:access.tenantId,status:String(row.status)as ImportBatch["status"],sourceFingerprint:String(row.source_fingerprint),sourceRecordCount:Number(row.source_record_count),acceptedCount:Number(row.accepted_count),duplicateCount:Number(row.duplicate_count),quarantineCount:Number(row.quarantine_count),quarantine:Array.isArray(row.quarantine_json)?row.quarantine_json as ImportBatch["quarantine"]:[],version:Number(row.version),createdAt:isoDate(row.created_at as Date|string),updatedAt:isoDate(row.updated_at as Date|string),archivedAt:null};}

function dashboardFromCounts(access:CrmAccessContext,period:{from:string;to:string},count:Record<string,number>):DashboardSummary{const casesOpen=count.cases_open??0,casesOverdue=count.cases_overdue??0,appointments=count.appointments??0,appointmentsStock=count.appointments_stock??0,exceptions=count.appointment_exceptions??0,activitiesOpen=count.activities_open??0;const sla=casesOpen===0?100:Math.max(0,Math.round((casesOpen-casesOverdue)/casesOpen*100));const agenda=appointmentsStock===0?100:Math.max(0,Math.round((appointmentsStock-exceptions)/appointmentsStock*100));const follow=activitiesOpen===0?100:Math.max(0,100-Math.min(100,activitiesOpen*4));const score=Math.round(sla*.45+agenda*.3+follow*.25);const now=new Date().toISOString();const total=count.stock_total??0;return{contractVersion:"crm-dashboard-summary-v1",metricSetVersion:access.profileKey==="healthcare-call-center"?"healthcare-call-center@1":"core@1",profileVersion:`${access.profileKey}@${access.profileVersion}`,period,timezone:access.timezone,asOf:now,freshness:{state:total===0?"empty":"live",generatedAt:now,ageSeconds:0},score:{value:score,formulaVersion:"crm-operational-score@1",dimensions:[{key:"sla",label:"SLA",value:sla,weight:.45},{key:"agenda",label:"Agenda",value:agenda,weight:.3},{key:"follow-up",label:"Seguimiento",value:follow,weight:.25}]},metrics:[{key:"cases.open",label:"Casos abiertos",value:casesOpen,unit:"casos",tone:casesOverdue?"warning":"neutral"},{key:"cases.overdue",label:"Casos vencidos",value:casesOverdue,unit:"casos",tone:casesOverdue?"danger":"success",target:0},{key:"appointments.exceptions",label:"Excepciones de agenda",value:exceptions,unit:"citas",tone:exceptions?"warning":"success",target:0},{key:"opportunities.open",label:"Oportunidades abiertas",value:count.opportunities_open??0,unit:"oportunidades",tone:"neutral"}],signals:[{key:"profile",label:"Perfil",value:`${access.profileKey}@${access.profileVersion}`,tone:"neutral"},{key:"freshness",label:"Freshness",value:total===0?"empty":"live",tone:total===0?"muted":"success"},{key:"dictionary",label:"Diccionario",value:access.dictionaryVersion,tone:"success"}],progress:[{key:"sla",label:"Cumplimiento SLA",value:sla,target:95,unit:"%"},{key:"agenda",label:"Citas sin excepcion",value:agenda,target:98,unit:"%"}],risks:[{key:"cases-overdue",label:"Casos vencidos",count:casesOverdue,route:"#casos?attention=overdue&sort=slaDueAt&direction=asc",severity:casesOverdue?"high":"none"},{key:"appointments-exceptions",label:"Agenda con excepciones",count:exceptions,route:"#agenda?attention=exception&sort=updatedAt&direction=desc",severity:exceptions?"medium":"none"}],domains:[{key:"accounts",label:"Cuentas",value:count.accounts??0,route:"#cuentas",status:"live"},{key:"contacts",label:"Contactos",value:count.contacts??0,route:"#contactos",status:"live"},{key:"cases",label:"Casos",value:count.cases??0,route:"#casos",status:"live"},{key:"appointments",label:"Agenda",value:appointments,route:"#agenda",status:"live"},{key:"opportunities",label:"Oportunidades",value:count.opportunities??0,route:"#oportunidades",status:"live"}],insights:casesOverdue?[{key:"case-sla",title:"Priorizar casos vencidos",detail:`${casesOverdue} casos requieren revision de SLA.`,route:"#casos?attention=overdue&sort=slaDueAt&direction=asc",tone:"danger"}]:exceptions?[{key:"agenda-reconcile",title:"Reconciliar agenda",detail:`${exceptions} citas presentan excepcion.`,route:"#agenda?attention=exception&sort=updatedAt&direction=desc",tone:"warning"}]:[{key:"operations-clear",title:"Operacion sin alertas",detail:"No hay riesgos operacionales activos en el periodo.",route:"#dashboard",tone:"success"}]};}
