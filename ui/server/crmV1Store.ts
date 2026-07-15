import { createHash } from "node:crypto";
import {
  CrmV1Error,
  assertTransition,
  defaultTenantConfiguration,
  deriveLifecycleFields,
  normalizePayload,
  opaqueId,
  resolveIndustryProfile
} from "./crmV1Domain.js";
import type {
  CrmAccessContext,
  CrmAuditEvent,
  CrmJob,
  CrmListQuery,
  CrmMutationContext,
  CrmOutboxEvent,
  CrmPage,
  CrmRecord,
  CrmResource,
  DashboardSummary,
  ImportBatch,
  IndustryProfile,
  ReportDefinition,
  TenantConfiguration
} from "./crmV1Types.js";

export type CrmCommand = {
  name: string;
  payload: Record<string, unknown>;
  expectedVersion: number;
};

export interface CrmV1Store {
  list(access: CrmAccessContext, resource: CrmResource, query: CrmListQuery): Promise<CrmPage>;
  get(access: CrmAccessContext, resource: CrmResource, id: string): Promise<CrmRecord | null>;
  create(resource: CrmResource, input: Record<string, unknown>, mutation: CrmMutationContext): Promise<{ record: CrmRecord; replayed: boolean }>;
  update(resource: CrmResource, id: string, input: Record<string, unknown>, expectedVersion: number, mutation: CrmMutationContext): Promise<{ record: CrmRecord; replayed: boolean }>;
  command(resource: CrmResource, id: string, command: CrmCommand, mutation: CrmMutationContext): Promise<{ record: CrmRecord; replayed: boolean }>;
  dashboard(access: CrmAccessContext, period: { from: string; to: string }): Promise<DashboardSummary>;
  profiles(): Promise<IndustryProfile[]>;
  effectiveProfile(access: CrmAccessContext): Promise<IndustryProfile>;
  getConfiguration(access: CrmAccessContext): Promise<TenantConfiguration>;
  updateConfiguration(input: Partial<TenantConfiguration>, expectedVersion: number, mutation: CrmMutationContext): Promise<TenantConfiguration>;
  reports(access: CrmAccessContext): Promise<ReportDefinition[]>;
  createJob(kind: "report-run" | "export", input: Record<string, unknown>, mutation: CrmMutationContext): Promise<{ job: CrmJob; replayed: boolean }>;
  getJob(access: CrmAccessContext, id: string): Promise<CrmJob | null>;
  importPreflight(input: Record<string, unknown>, mutation: CrmMutationContext): Promise<{ batch: ImportBatch; replayed: boolean }>;
  importCommand(id: string, command: "dry-run" | "commit" | "rollback", mutation: CrmMutationContext): Promise<{ batch: ImportBatch; replayed: boolean }>;
  getImport(access: CrmAccessContext, id: string): Promise<ImportBatch | null>;
}

type IdempotencyResult = { checksum: string; result: unknown };
type ImportInternal = { batch: ImportBatch; records: Array<Record<string, unknown>>; targets: Array<{ id: string; resource: CrmResource }> };
type TenantState = {
  resources: Record<CrmResource, Map<string, CrmRecord>>;
  configuration: TenantConfiguration;
  idempotency: Map<string, IdempotencyResult>;
  audits: CrmAuditEvent[];
  outbox: CrmOutboxEvent[];
  jobs: Map<string, CrmJob>;
  imports: Map<string, ImportInternal>;
};

export const reportCatalog: ReportDefinition[] = [
  defineReport("case-backlog", "Backlog de casos", "Casos por estado, prioridad, cola y antiguedad.", ["core", "healthcare-call-center"]),
  defineReport("sla-compliance", "Cumplimiento SLA", "Primera accion y seguimientos dentro del SLA versionado.", ["healthcare-call-center"]),
  defineReport("appointments-by-status", "Agenda operacional", "Citas por estado y recurso sin datos sensibles.", ["healthcare-call-center"]),
  defineReport("pipeline-summary", "Pipeline comercial", "Oportunidades por etapa, monto y probabilidad.", ["core", "healthcare-call-center"]),
  defineReport("activity-throughput", "Actividad", "Actividades abiertas y completadas por periodo.", ["core", "healthcare-call-center"]),
  defineReport("import-quality", "Calidad de importacion", "Aceptados, duplicados y quarantine por lote.", ["healthcare-call-center"])
];

function defineReport(key: string, label: string, description: string, profileKeys: string[]): ReportDefinition {
  return {
    id: key,
    key,
    label,
    description,
    profileKeys,
    requiredCapability: "crm.reports.read",
    status: "active",
    version: "1",
    freshness: "catalog"
  };
}

const opportunityStageTransitions: Record<string, string[]> = {
  lead: ["qualified", "lost"],
  qualified: ["proposal", "lost"],
  proposal: ["won", "lost"],
  won: [],
  lost: ["qualified"]
};

export class MemoryCrmV1Store implements CrmV1Store {
  private readonly tenants = new Map<string, TenantState>();

  async list(access: CrmAccessContext, resource: CrmResource, query: CrmListQuery): Promise<CrmPage> {
    const state = this.state(access);
    let rows = [...state.resources[resource].values()].filter((record) => record.archivedAt === null);
    for (const [key, value] of Object.entries(query.filters)) {
      rows = rows.filter((record) => {
        if (key === "tag") return Array.isArray(record.tags) && record.tags.includes(value);
        if (key === "attention" && resource === "cases") {
          return value === "overdue" && Boolean(record.slaDueAt) && new Date(String(record.slaDueAt)) < new Date() && !["resolved", "closed", "cancelled"].includes(String(record.status));
        }
        if (key === "attention" && resource === "appointments") {
          return value === "exception" && ["sync_failed", "no_show"].includes(String(record.status));
        }
        if (key === "attention" && resource === "activities") {
          return value === "pending" && ["open", "in_progress"].includes(String(record.status));
        }
        return String(record[key] ?? "") === value;
      });
    }
    if (query.q) {
      const needle = query.q.toLocaleLowerCase();
      rows = rows.filter((record) => searchable(record).includes(needle));
    }
    rows.sort((left, right) => compare(left[query.sort], right[query.sort]) * (query.direction === "asc" ? 1 : -1));
    const offset = decodeCursor(query.cursor);
    const page = rows.slice(offset, offset + query.limit).map((record) => projectRecord(record, access));
    return {
      data: page,
      total: rows.length,
      nextCursor: offset + page.length < rows.length ? encodeCursor(offset + page.length) : null
    };
  }

  async get(access: CrmAccessContext, resource: CrmResource, id: string): Promise<CrmRecord | null> {
    const record = this.state(access).resources[resource].get(id);
    return record && record.tenantId === access.tenantId ? projectRecord(record, access) : null;
  }

  async create(resource: CrmResource, input: Record<string, unknown>, mutation: CrmMutationContext): Promise<{ record: CrmRecord; replayed: boolean }> {
    return this.idempotent(mutation, `${resource}:create`, () => {
      const state = this.state(mutation.access);
      validateReferences(state, resource, input);
      if (resource === "appointments") assertAppointmentAvailable(state, input);
      const now = new Date().toISOString();
      const derivedInput = deriveLifecycleFields(resource, input, now);
      const record: CrmRecord = {
        ...structuredClone(derivedInput),
        id: opaqueId(resource.slice(0, -1)),
        tenantId: mutation.access.tenantId,
        version: 1,
        createdAt: now,
        updatedAt: now,
        archivedAt: null
      };
      state.resources[resource].set(record.id, record);
      this.accept(state, mutation, `${resource}.created`, resource, record.id, publicEventPayload(resource, record));
      return { record: projectRecord(record, mutation.access), replayed: false };
    });
  }

  async update(resource: CrmResource, id: string, input: Record<string, unknown>, expectedVersion: number, mutation: CrmMutationContext): Promise<{ record: CrmRecord; replayed: boolean }> {
    return this.idempotent(mutation, `${resource}:${id}:update`, () => {
      const state = this.state(mutation.access);
      const current = requireRecord(state, resource, id, mutation.access.tenantId);
      assertVersion(current, expectedVersion);
      validateReferences(state, resource, { ...current, ...input });
      if (resource === "appointments") assertAppointmentAvailable(state, { ...current, ...input }, id);
      const now = new Date().toISOString();
      const merged = deriveLifecycleFields(resource, { ...current, ...structuredClone(input) }, now);
      const record: CrmRecord = { ...merged, id, tenantId: current.tenantId, version: current.version + 1, updatedAt: now } as CrmRecord;
      state.resources[resource].set(id, record);
      this.accept(state, mutation, `${resource}.updated`, resource, id, { version: record.version });
      return { record: projectRecord(record, mutation.access), replayed: false };
    });
  }

  async command(resource: CrmResource, id: string, command: CrmCommand, mutation: CrmMutationContext): Promise<{ record: CrmRecord; replayed: boolean }> {
    return this.idempotent(mutation, `${resource}:${id}:${command.name}`, () => {
      const state = this.state(mutation.access);
      const current = requireRecord(state, resource, id, mutation.access.tenantId);
      assertVersion(current, command.expectedVersion);
      try {
        const patch = commandPatch(resource, current, command);
        if (resource === "appointments") assertAppointmentAvailable(state, { ...current, ...patch }, id);
        const now = new Date().toISOString();
        const record = {
          ...deriveLifecycleFields(resource, { ...current, ...patch }, now),
          version: current.version + 1,
          updatedAt: now
        } as CrmRecord;
        state.resources[resource].set(id, record);
        this.accept(state, mutation, `${resource}.${command.name}`, resource, id, { reasonCode: patch.reasonCode ?? null, status: record.status, version: record.version });
        return { record: projectRecord(record, mutation.access), replayed: false };
      } catch (error) {
        this.reject(state, mutation, `${resource}.${command.name}`, resource, id, error instanceof CrmV1Error ? error.code : "crm.command.rejected");
        throw error;
      }
    });
  }

  async dashboard(access: CrmAccessContext, period: { from: string; to: string }): Promise<DashboardSummary> {
    const state = this.state(access);
    const profile = await this.effectiveProfile(access);
    const from = new Date(period.from).valueOf();
    const to = new Date(period.to).valueOf();
    const inPeriod = (record: CrmRecord) => {
      const updatedAt = new Date(record.updatedAt).valueOf();
      return Number.isFinite(updatedAt) && updatedAt >= from && updatedAt < to;
    };
    const count = (resource: CrmResource, predicate: (record: CrmRecord) => boolean = () => true) => [...state.resources[resource].values()].filter((record) => record.archivedAt === null && inPeriod(record) && predicate(record)).length;
    const stockCount = (resource: CrmResource, predicate: (record: CrmRecord) => boolean = () => true) => [...state.resources[resource].values()].filter((record) => record.archivedAt === null && predicate(record)).length;
    const casesOpen = stockCount("cases", (record) => !["closed", "cancelled"].includes(String(record.status)));
    const casesOverdue = stockCount("cases", (record) => Boolean(record.slaDueAt) && new Date(String(record.slaDueAt)).valueOf() < Date.now() && !["resolved", "closed", "cancelled"].includes(String(record.status)));
    const appointmentsExceptions = stockCount("appointments", (record) => ["sync_failed", "no_show"].includes(String(record.status)));
    const appointmentsStock = stockCount("appointments");
    const activitiesOpen = stockCount("activities", (record) => ["open", "in_progress"].includes(String(record.status)));
    const opportunitiesOpen = stockCount("opportunities", (record) => !["won", "lost"].includes(String(record.stageId)));
    const stockTotal = stockCount("accounts") + stockCount("contacts") + stockCount("cases") + stockCount("activities") + appointmentsStock + stockCount("opportunities");
    const slaValue = casesOpen === 0 ? 100 : Math.max(0, Math.round(((casesOpen - casesOverdue) / casesOpen) * 100));
    const agendaValue = appointmentsStock === 0 ? 100 : Math.max(0, Math.round(((appointmentsStock - appointmentsExceptions) / appointmentsStock) * 100));
    const followUpValue = activitiesOpen === 0 ? 100 : Math.max(0, 100 - Math.min(100, activitiesOpen * 4));
    const scoreValue = Math.round(slaValue * 0.45 + agendaValue * 0.3 + followUpValue * 0.25);
    const now = new Date().toISOString();
    return {
      contractVersion: "crm-dashboard-summary-v1",
      metricSetVersion: profile.metricSetVersion,
      profileVersion: `${profile.key}@${profile.version}`,
      period,
      timezone: access.timezone,
      asOf: now,
      freshness: { state: stockTotal === 0 ? "empty" : "live", generatedAt: now, ageSeconds: 0 },
      score: { value: scoreValue, formulaVersion: "crm-operational-score@1", dimensions: [
        { key: "sla", label: "SLA", value: slaValue, weight: 0.45 },
        { key: "agenda", label: "Agenda", value: agendaValue, weight: 0.3 },
        { key: "follow-up", label: "Seguimiento", value: followUpValue, weight: 0.25 }
      ] },
      metrics: [
        { key: "cases.open", label: "Casos abiertos", value: casesOpen, unit: "casos", tone: casesOverdue > 0 ? "warning" : "neutral" },
        { key: "cases.overdue", label: "Casos vencidos", value: casesOverdue, unit: "casos", tone: casesOverdue > 0 ? "danger" : "success", target: 0 },
        { key: "appointments.exceptions", label: "Excepciones de agenda", value: appointmentsExceptions, unit: "citas", tone: appointmentsExceptions > 0 ? "warning" : "success", target: 0 },
        { key: "opportunities.open", label: "Oportunidades abiertas", value: opportunitiesOpen, unit: "oportunidades", tone: "neutral" }
      ],
      signals: [
        { key: "profile", label: "Perfil", value: `${profile.key}@${profile.version}`, tone: "neutral" },
        { key: "freshness", label: "Freshness", value: stockTotal === 0 ? "empty" : "live", tone: stockTotal === 0 ? "muted" : "success" },
        { key: "dictionary", label: "Diccionario", value: access.dictionaryVersion, tone: "success" }
      ],
      progress: [
        { key: "sla", label: "Cumplimiento SLA", value: slaValue, target: 95, unit: "%" },
        { key: "agenda", label: "Citas sin excepcion", value: agendaValue, target: 98, unit: "%" }
      ],
      risks: [
        { key: "cases-overdue", label: "Casos vencidos", count: casesOverdue, route: "#casos?attention=overdue&sort=slaDueAt&direction=asc", severity: casesOverdue > 0 ? "high" : "none" },
        { key: "appointments-exceptions", label: "Agenda con excepciones", count: appointmentsExceptions, route: "#agenda?attention=exception&sort=updatedAt&direction=desc", severity: appointmentsExceptions > 0 ? "medium" : "none" }
      ],
      domains: [
        { key: "accounts", label: "Cuentas", value: count("accounts"), route: "#cuentas", status: "live" },
        { key: "contacts", label: "Contactos", value: count("contacts"), route: "#contactos", status: "live" },
        { key: "cases", label: "Casos", value: count("cases"), route: "#casos", status: "live" },
        { key: "appointments", label: "Agenda", value: count("appointments"), route: "#agenda", status: "live" },
        { key: "opportunities", label: "Oportunidades", value: count("opportunities"), route: "#oportunidades", status: "live" }
      ],
      insights: buildInsights(casesOverdue, appointmentsExceptions, activitiesOpen)
    };
  }

  async profiles(): Promise<IndustryProfile[]> {
    return [resolveIndustryProfile("core", "1"), resolveIndustryProfile("healthcare-call-center", "1")];
  }

  async effectiveProfile(access: CrmAccessContext): Promise<IndustryProfile> {
    const config = this.state(access).configuration;
    return resolveIndustryProfile(config.profileKey, config.profileVersion);
  }

  async getConfiguration(access: CrmAccessContext): Promise<TenantConfiguration> {
    return structuredClone(this.state(access).configuration);
  }

  async updateConfiguration(input: Partial<TenantConfiguration>, expectedVersion: number, mutation: CrmMutationContext): Promise<TenantConfiguration> {
    const result = await this.idempotent(mutation, "configuration:update", () => {
      const state = this.state(mutation.access);
      const current = state.configuration;
      if (current.version !== expectedVersion) throw new CrmV1Error(412, "crm.version.conflict", "La configuracion fue modificada por otra operacion.");
      const profileKey = String(input.profileKey ?? current.profileKey);
      const profileVersion = String(input.profileVersion ?? current.profileVersion);
      resolveIndustryProfile(profileKey, profileVersion);
      const next: TenantConfiguration = {
        ...current,
        ...structuredClone(input),
        profileKey,
        profileVersion,
        version: current.version + 1,
        updatedAt: new Date().toISOString()
      };
      state.configuration = next;
      this.accept(state, mutation, "configuration.updated", "tenant-configuration", mutation.access.tenantId, { version: next.version, profile: `${profileKey}@${profileVersion}` });
      return { configuration: structuredClone(next), replayed: false };
    });
    return result.configuration;
  }

  async reports(access: CrmAccessContext): Promise<ReportDefinition[]> {
    const profile = await this.effectiveProfile(access);
    return reportCatalog.filter((report) => report.profileKeys.includes(profile.key)).map((report) => structuredClone(report));
  }

  async createJob(kind: "report-run" | "export", input: Record<string, unknown>, mutation: CrmMutationContext): Promise<{ job: CrmJob; replayed: boolean }> {
    return this.idempotent(mutation, `job:${kind}`, () => {
      const state = this.state(mutation.access);
      const now = new Date();
      const job: CrmJob = {
        ...structuredClone(input), id: opaqueId(kind === "export" ? "export" : "report"), tenantId: mutation.access.tenantId,
        kind, status: "accepted", version: 1, archivedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString(),
        expiresAt: kind === "export" ? new Date(now.valueOf() + 24 * 60 * 60 * 1000).toISOString() : null
      };
      state.jobs.set(job.id, job);
      this.accept(state, mutation, `${kind}.accepted`, kind, job.id, { status: job.status });
      return { job: structuredClone(job), replayed: false };
    });
  }

  async getJob(access: CrmAccessContext, id: string): Promise<CrmJob | null> {
    const job = this.state(access).jobs.get(id);
    return job?.tenantId === access.tenantId ? structuredClone(job) : null;
  }

  async importPreflight(input: Record<string, unknown>, mutation: CrmMutationContext): Promise<{ batch: ImportBatch; replayed: boolean }> {
    return this.idempotent(mutation, "import:preflight", () => {
      const state = this.state(mutation.access);
      const fingerprint = String(input.sourceFingerprint ?? "").trim().toLowerCase();
      const records = Array.isArray(input.records) ? input.records : [];
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new CrmV1Error(400, "crm.import.fingerprint_invalid", "sourceFingerprint SHA-256 es obligatorio.");
      if (records.length === 0 || records.length > 10_000) throw new CrmV1Error(400, "crm.import.records_invalid", "El lote debe contener entre 1 y 10000 registros normalizados.");
      const existing = [...state.imports.values()].find((item) => item.batch.sourceFingerprint === fingerprint);
      if (existing) return { batch: structuredClone(existing.batch), replayed: true };
      const normalized = records.map((record, index) => normalizeImportRecord(record, index + 1));
      const duplicateIds = duplicateValues(normalized.map((record) => String(record.externalId ?? ""))).filter(Boolean);
      const quarantine = normalized.flatMap((record, index) => {
        const fields: string[] = [];
        if (!record.externalId) fields.push("externalId");
        if (!record.caseSubject) fields.push("caseSubject");
        if (duplicateIds.includes(String(record.externalId ?? ""))) fields.push("externalId");
        return fields.length ? [{ sourceRow: index + 1, code: duplicateIds.includes(String(record.externalId ?? "")) ? "duplicate" : "required", fields }] : [];
      });
      const now = new Date().toISOString();
      const batch: ImportBatch = {
        id: opaqueId("import"), tenantId: mutation.access.tenantId, version: 1, archivedAt: null, createdAt: now, updatedAt: now,
        status: "staged", sourceFingerprint: fingerprint, sourceRecordCount: normalized.length,
        acceptedCount: normalized.length - quarantine.length, duplicateCount: quarantine.filter((item) => item.code === "duplicate").length,
        quarantineCount: quarantine.length, quarantine
      };
      state.imports.set(batch.id, { batch, records: normalized, targets: [] });
      this.accept(state, mutation, "import.staged", "import", batch.id, { sourceRecordCount: batch.sourceRecordCount, quarantineCount: batch.quarantineCount });
      return { batch: structuredClone(batch), replayed: false };
    });
  }

  async importCommand(id: string, command: "dry-run" | "commit" | "rollback", mutation: CrmMutationContext): Promise<{ batch: ImportBatch; replayed: boolean }> {
    return this.idempotent(mutation, `import:${id}:${command}`, () => {
      const state = this.state(mutation.access);
      const internal = state.imports.get(id);
      if (!internal || internal.batch.tenantId !== mutation.access.tenantId) throw new CrmV1Error(404, "crm.import.not_found", "No existe el lote solicitado.");
      const current = internal.batch;
      if (command === "dry-run" && current.status !== "staged") throw new CrmV1Error(409, "crm.import.transition_invalid", "El dry-run solo aplica a un lote staged.");
      if (command === "commit" && current.status !== "validated") throw new CrmV1Error(409, "crm.import.transition_invalid", "El commit requiere un dry-run validado.");
      if (command === "commit" && current.quarantineCount > 0) throw new CrmV1Error(409, "crm.import.quarantine_unresolved", "Resuelva quarantine antes del commit.");
      if (command === "rollback" && !["validated", "committed"].includes(current.status)) throw new CrmV1Error(409, "crm.import.transition_invalid", "El lote no admite rollback.");
      if (command === "commit") materializeMemoryImport(state, internal);
      if (command === "rollback" && current.status === "committed") rollbackMemoryImport(state, internal);
      const status: ImportBatch["status"] = command === "dry-run" ? "validated" : command === "commit" ? "committed" : "rolled_back";
      const next = { ...current, status, version: current.version + 1, updatedAt: new Date().toISOString() };
      internal.batch = next;
      this.accept(state, mutation, `import.${command.replace("-", "_")}`, "import", id, { status, acceptedCount: next.acceptedCount, quarantineCount: next.quarantineCount });
      return { batch: structuredClone(next), replayed: false };
    });
  }

  async getImport(access: CrmAccessContext, id: string): Promise<ImportBatch | null> {
    const batch = this.state(access).imports.get(id)?.batch;
    return batch?.tenantId === access.tenantId ? structuredClone(batch) : null;
  }

  seedSynthetic(access: CrmAccessContext): void {
    const state = this.state(access);
    if (state.resources.accounts.size > 0) return;
    const now = new Date().toISOString();
    const add = (resource: CrmResource, id: string, data: Record<string, unknown>) => state.resources[resource].set(id, { ...data, id, tenantId: access.tenantId, version: 1, createdAt: now, updatedAt: now, archivedAt: null });
    add("accounts", "account_synthetic_clinic", { name: "Clinica Horizonte Sintetica", type: "organization", status: "active", ownerId: "team_synthetic", tags: ["synthetic"] });
    add("contacts", "contact_synthetic_patient", { accountId: "account_synthetic_clinic", displayName: "Paciente Sintetico 001", role: "patient", status: "active", preferredChannel: "phone", consentStatus: "recorded", sensitive: { birthDate: "1990-01-01", memberReference: "SYNTH-0001" } });
    add("cases", "case_synthetic_001", { accountId: "account_synthetic_clinic", contactId: "contact_synthetic_patient", caseType: "appointment-coordination", status: "in_progress", priority: "normal", queueId: "queue_synthetic", ownerId: "agent_synthetic", subject: "Seguimiento sintetico de coordinacion", slaDueAt: new Date(Date.now() + 86_400_000).toISOString() });
    add("activities", "activity_synthetic_001", { caseId: "case_synthetic_001", accountId: "account_synthetic_clinic", contactId: "contact_synthetic_patient", type: "call", status: "open", ownerId: "agent_synthetic", subject: "Llamada sintetica de seguimiento" });
    add("appointments", "appointment_synthetic_001", { caseId: "case_synthetic_001", accountId: "account_synthetic_clinic", contactId: "contact_synthetic_patient", status: "requested", timezone: access.timezone });
    add("opportunities", "opportunity_synthetic_001", { accountId: "account_synthetic_clinic", name: "Expansion B2B sintetica", status: "open", pipelineId: "default", stageId: "qualified", amountMinor: 1250000, currency: "USD", probability: 40, ownerId: "seller_synthetic" });
  }

  evidence(access: CrmAccessContext): { audits: CrmAuditEvent[]; outbox: CrmOutboxEvent[] } {
    const state = this.state(access);
    return { audits: structuredClone(state.audits), outbox: structuredClone(state.outbox) };
  }

  private state(access: CrmAccessContext): TenantState {
    let state = this.tenants.get(access.tenantId);
    if (!state) {
      state = {
        resources: { accounts: new Map(), contacts: new Map(), cases: new Map(), activities: new Map(), appointments: new Map(), opportunities: new Map() },
        configuration: defaultTenantConfiguration(access.profileKey, access.profileVersion),
        idempotency: new Map(), audits: [], outbox: [], jobs: new Map(), imports: new Map()
      };
      state.configuration.timezone = access.timezone;
      state.configuration.locale = access.locale;
      this.tenants.set(access.tenantId, state);
    }
    return state;
  }

  private async idempotent<T extends { replayed: boolean }>(mutation: CrmMutationContext, _operation: string, work: () => T): Promise<T> {
    const state = this.state(mutation.access);
    const key = mutation.idempotencyKey;
    const existing = state.idempotency.get(key);
    if (existing) {
      if (existing.checksum !== mutation.requestChecksum) throw new CrmV1Error(409, "crm.idempotency.conflict", "Idempotency-Key ya fue usada con otro contenido.");
      return { ...(structuredClone(existing.result) as T), replayed: true };
    }
    const result = work();
    state.idempotency.set(key, { checksum: mutation.requestChecksum, result: structuredClone(result) });
    return result;
  }

  private accept(state: TenantState, mutation: CrmMutationContext, action: string, entityType: string, entityId: string, payload: Record<string, unknown>): void {
    const occurredAt = new Date().toISOString();
    const reasonCode = typeof payload.reasonCode === "string" && payload.reasonCode ? payload.reasonCode : null;
    state.audits.push({ id: opaqueId("audit"), tenantId: mutation.access.tenantId, requestId: mutation.requestId, actorSubject: mutation.actor.subject, action, entityType, entityId, outcome: "accepted", reasonCode, occurredAt });
    state.outbox.push({ eventId: opaqueId("event"), eventType: `crm.${action}`, contractVersion: "1", tenantId: mutation.access.tenantId, occurredAt, correlationId: mutation.correlationId, causationId: mutation.idempotencyKey, actor: { type: mutation.actor.kind === "oauth-api" && mutation.actor.subject.startsWith("client:") ? "service" : "human", subject: mutation.actor.subject }, payload, status: "pending" });
  }

  private reject(state: TenantState, mutation: CrmMutationContext, action: string, entityType: string, entityId: string, reasonCode: string): void {
    state.audits.push({ id: opaqueId("audit"), tenantId: mutation.access.tenantId, requestId: mutation.requestId, actorSubject: mutation.actor.subject, action, entityType, entityId, outcome: "rejected", reasonCode, occurredAt: new Date().toISOString() });
  }
}

export function commandPatch(resource: CrmResource, current: CrmRecord, command: CrmCommand): Record<string, unknown> {
  if (resource === "cases" && command.name === "assign") {
    assertCommandPayloadKeys(command.payload, ["assigneeId", "reasonCode"]);
    const assigneeId = String(command.payload.assigneeId ?? "").trim();
    if (!assigneeId) throw new CrmV1Error(400, "crm.validation.failed", "assigneeId es obligatorio.");
    return { ownerId: assigneeId, reasonCode: optionalText(command.payload.reasonCode) };
  }
  if (resource === "cases" && command.name === "transition") {
    assertCommandPayloadKeys(command.payload, ["reasonCode", "targetStatus"]);
    const targetStatus = String(command.payload.targetStatus ?? "").trim();
    assertTransition("case", String(current.status), targetStatus);
    return { status: targetStatus, reasonCode: optionalText(command.payload.reasonCode) };
  }
  if (resource === "appointments" && ["schedule", "confirm", "reschedule", "cancel", "complete", "no-show"].includes(command.name)) {
    const scheduling = command.name === "schedule" || command.name === "reschedule";
    assertCommandPayloadKeys(command.payload, scheduling
      ? ["endAt", "externalRef", "reasonCode", "resourceId", "startAt", "timezone"]
      : ["reasonCode"]);
    const target = ({ schedule: "scheduled", confirm: "confirmed", reschedule: "rescheduled", cancel: "cancelled", complete: "completed", "no-show": "no_show" } as Record<string, string>)[command.name];
    assertTransition("appointment", String(current.status), target);
    const normalizedTiming: Record<string, unknown> = scheduling ? normalizePayload("appointments", {
      caseId: current.caseId,
      startAt: command.payload.startAt ?? current.startAt,
      endAt: command.payload.endAt ?? current.endAt,
      timezone: command.payload.timezone ?? current.timezone,
      ...(command.payload.resourceId ?? current.resourceId ? { resourceId: command.payload.resourceId ?? current.resourceId } : {}),
      ...(command.payload.externalRef === undefined ? {} : { externalRef: command.payload.externalRef })
    }) : {};
    const timing: Record<string, unknown> = scheduling ? {
      startAt: normalizedTiming.startAt,
      endAt: normalizedTiming.endAt,
      timezone: normalizedTiming.timezone,
      ...(Object.hasOwn(normalizedTiming, "resourceId") ? { resourceId: normalizedTiming.resourceId } : {}),
      ...(Object.hasOwn(normalizedTiming, "externalRef") ? { externalRef: normalizedTiming.externalRef } : {})
    } : {};
    if (scheduling && (!timing.startAt || !timing.endAt || !timing.timezone)) {
      throw new CrmV1Error(400, "crm.appointment.schedule_required", "Programar o reprogramar requiere inicio, fin y zona horaria.");
    }
    return {
      status: target,
      ...timing,
      reasonCode: optionalText(command.payload.reasonCode)
    };
  }
  if (resource === "opportunities" && command.name === "transition") {
    assertCommandPayloadKeys(command.payload, ["reasonCode", "stageId"]);
    const stageId = String(command.payload.stageId ?? "").trim();
    if (!opportunityStageTransitions[String(current.stageId)]?.includes(stageId)) throw new CrmV1Error(409, "crm.opportunity.transition_invalid", "La transicion de pipeline no esta permitida.");
    return { stageId, status: ["won", "lost"].includes(stageId) ? "closed" : "open", closeReason: optionalText(command.payload.reasonCode) };
  }
  throw new CrmV1Error(404, "crm.command.not_found", "El comando no existe para este recurso.");
}

function validateReferences(state: TenantState, resource: CrmResource, input: Record<string, unknown>): void {
  const references: Array<[unknown, CrmResource]> = [
    [input.accountId, "accounts"], [input.contactId, "contacts"], [input.primaryContactId, "contacts"], [input.caseId, "cases"]
  ];
  for (const [id, target] of references) {
    if (id && !state.resources[target].has(String(id))) throw new CrmV1Error(409, "crm.reference.invalid", `La referencia ${target} no existe en el tenant.`);
  }
  if (resource === "contacts" && input.accountId && !state.resources.accounts.has(String(input.accountId))) throw new CrmV1Error(409, "crm.reference.invalid", "La cuenta no existe en el tenant.");
}

function assertAppointmentAvailable(state: TenantState, input: Record<string, unknown>, excludingId?: string): void {
  if (!input.startAt && !input.endAt) return;
  if (!input.startAt || !input.endAt) throw new CrmV1Error(400, "crm.appointment.range_invalid", "Inicio y fin deben declararse juntos.");
  const start = new Date(String(input.startAt)).valueOf(); const end = new Date(String(input.endAt)).valueOf();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new CrmV1Error(400, "crm.appointment.range_invalid", "El rango de la cita no es valido.");
  if (!input.resourceId) return;
  const conflict = [...state.resources.appointments.values()].some((record) => record.id !== excludingId && record.resourceId === input.resourceId && !["cancelled", "no_show"].includes(String(record.status)) && record.startAt && record.endAt && new Date(String(record.startAt)).valueOf() < end && new Date(String(record.endAt)).valueOf() > start);
  if (conflict) throw new CrmV1Error(409, "crm.appointment.conflict", "El recurso ya tiene una cita en ese rango.");
}

function requireRecord(state: TenantState, resource: CrmResource, id: string, tenantId: string): CrmRecord {
  const record = state.resources[resource].get(id);
  if (!record || record.tenantId !== tenantId) throw new CrmV1Error(404, `crm.${resource.slice(0, -1)}.not_found`, "No existe el recurso solicitado.");
  return record;
}

function assertVersion(record: CrmRecord, expectedVersion: number): void {
  if (record.version !== expectedVersion) throw new CrmV1Error(412, "crm.version.conflict", "El recurso fue modificado por otra operacion.");
}

function projectRecord(record: CrmRecord, access: CrmAccessContext): CrmRecord {
  const copy = structuredClone(record);
  if (copy.sensitive !== undefined && !access.capabilities.includes("crm.sensitive.read")) {
    delete copy.sensitive;
    copy.masked = true;
  }
  return copy;
}

function publicEventPayload(resource: CrmResource, record: CrmRecord): Record<string, unknown> {
  return { id: record.id, resource, version: record.version, status: record.status ?? null };
}

function searchable(record: CrmRecord): string {
  return [record.name, record.displayName, record.subject, record.caseType, record.type, record.status].map((value) => String(value ?? "").toLocaleLowerCase()).join(" ");
}

function compare(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function encodeCursor(offset: number): string { return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url"); }
function decodeCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try { const value = Number((JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown }).offset); if (Number.isInteger(value) && value >= 0) return value; } catch { /* handled below */ }
  throw new CrmV1Error(400, "crm.pagination.cursor_invalid", "El cursor no es valido.");
}

function buildInsights(casesOverdue: number, appointmentExceptions: number, activitiesOpen: number): DashboardSummary["insights"] {
  const insights: DashboardSummary["insights"] = [];
  if (casesOverdue > 0) insights.push({ key: "case-sla", title: "Priorizar casos vencidos", detail: `${casesOverdue} casos requieren revision de SLA.`, route: "#casos?attention=overdue&sort=slaDueAt&direction=asc", tone: "danger" });
  if (appointmentExceptions > 0) insights.push({ key: "agenda-reconcile", title: "Reconciliar agenda", detail: `${appointmentExceptions} citas presentan excepcion.`, route: "#agenda?attention=exception&sort=updatedAt&direction=desc", tone: "warning" });
  if (activitiesOpen > 0) insights.push({ key: "activities-open", title: "Completar seguimientos", detail: `${activitiesOpen} actividades permanecen abiertas.`, route: "#actividades?attention=pending&sort=dueAt&direction=asc", tone: "neutral" });
  if (insights.length === 0) insights.push({ key: "operations-clear", title: "Operacion sin alertas", detail: "No hay riesgos operacionales activos en el periodo.", route: "#dashboard", tone: "success" });
  return insights;
}

function materializeMemoryImport(state: TenantState, internal: ImportInternal): void {
  const quarantined = new Set(internal.batch.quarantine.map((item) => item.sourceRow));
  const now = new Date().toISOString();
  for (const source of internal.records) {
    const sourceRow = Number(source.sourceRow);
    if (quarantined.has(sourceRow)) continue;
    const metadata = { importBatchId: internal.batch.id, importSourceRow: sourceRow, importExternalId: String(source.externalId ?? "") };
    let accountId: string | null = null;
    let contactId: string | null = null;
    if (String(source.accountName ?? "").trim()) {
      accountId = opaqueId("account");
      state.resources.accounts.set(accountId, {
        ...metadata, id: accountId, tenantId: internal.batch.tenantId, name: String(source.accountName), type: "organization", status: "active",
        version: 1, createdAt: now, updatedAt: now, archivedAt: null
      });
      internal.targets.push({ id: accountId, resource: "accounts" });
    }
    if (String(source.contactAlias ?? "").trim()) {
      contactId = opaqueId("contact");
      state.resources.contacts.set(contactId, {
        ...metadata, id: contactId, tenantId: internal.batch.tenantId, accountId, displayName: String(source.contactAlias), role: "patient", status: "active",
        version: 1, createdAt: now, updatedAt: now, archivedAt: null
      });
      internal.targets.push({ id: contactId, resource: "contacts" });
    }
    const caseId = opaqueId("case");
    const priority = ["low", "normal", "high", "urgent"].includes(String(source.priority ?? "")) ? String(source.priority) : "normal";
    state.resources.cases.set(caseId, {
      ...metadata, id: caseId, tenantId: internal.batch.tenantId, accountId, contactId,
      caseType: String(source.caseType ?? "").trim() || "case-follow-up", priority, queueId: optionalText(source.queueKey),
      status: "new", subject: String(source.caseSubject), version: 1, createdAt: now, updatedAt: now, archivedAt: null
    });
    internal.targets.push({ id: caseId, resource: "cases" });
  }
}

function rollbackMemoryImport(state: TenantState, internal: ImportInternal): void {
  const now = new Date().toISOString();
  const unsafe = internal.targets.some((target) => {
    const record = state.resources[target.resource].get(target.id);
    return !record || record.archivedAt !== null || record.version !== 1;
  });
  if (unsafe) {
    throw new CrmV1Error(409, "crm.import.rollback_conflict", "El rollback fue bloqueado porque un registro importado cambio despues del commit.");
  }
  for (const target of internal.targets) {
    const record = state.resources[target.resource].get(target.id);
    if (!record || record.archivedAt !== null) continue;
    state.resources[target.resource].set(target.id, {
      ...record,
      archivedAt: now,
      status: target.resource === "cases" ? "cancelled" : "archived",
      updatedAt: now,
      version: record.version + 1
    });
  }
}

function normalizeImportRecord(value: unknown, sourceRow: number): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { sourceRow };
  const source = value as Record<string, unknown>;
  const allowed = ["externalId", "accountName", "contactAlias", "caseSubject", "caseType", "priority", "queueKey", "appointmentRequested"];
  return Object.fromEntries([["sourceRow", sourceRow], ...allowed.filter((key) => source[key] !== undefined).map((key) => [key, typeof source[key] === "boolean" ? source[key] : String(source[key] ?? "").trim().slice(0, 240)])]);
}

function duplicateValues(values: string[]): string[] { const seen = new Set<string>(); const duplicates = new Set<string>(); for (const value of values) { if (seen.has(value)) duplicates.add(value); seen.add(value); } return [...duplicates]; }
function optionalText(value: unknown): string | null { const text = String(value ?? "").trim(); return text ? text.slice(0, 128) : null; }
function assertCommandPayloadKeys(payload: Record<string, unknown>, allowed: string[]): void {
  const unknown = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new CrmV1Error(400, "crm.validation.failed", "El comando contiene campos no permitidos.");
  }
}

export function fingerprintSyntheticSeed(): string {
  return createHash("sha256").update("pyrosa-democrm-v2607-synthetic-seed-v1").digest("hex");
}
