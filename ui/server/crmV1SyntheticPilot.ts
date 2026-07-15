import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checksum, normalizePayload } from "./crmV1Domain.js";
import { MemoryCrmV1Store } from "./crmV1Store.js";
import type {
  CrmAccessContext,
  CrmIdentity,
  CrmListQuery,
  CrmMutationContext,
  CrmRecord,
  CrmResource
} from "./crmV1Types.js";

const pilotVersion = "pyrosa-democrm-v2607-synthetic-pilot-v1";
const seedContract = "pyrosa-democrm-synthetic-seed-v1";
const evidenceBasename = "democrm-v2607-synthetic-pilot-2026-07-15";

const actor: CrmIdentity = {
  kind: "browser",
  issuer: "https://iam.synthetic.invalid",
  subject: "subject:synthetic-pilot",
  roles: ["supervisor"],
  scopes: []
};

const fullCapabilities = [
  "crm.accounts.read", "crm.accounts.write", "crm.contacts.read", "crm.contacts.write",
  "crm.cases.read", "crm.cases.write", "crm.cases.assign", "crm.activities.read", "crm.activities.write",
  "crm.appointments.read", "crm.appointments.write", "crm.opportunities.read", "crm.opportunities.write",
  "crm.dashboard.read", "crm.reports.read", "crm.exports.create", "crm.config.read", "crm.config.manage",
  "crm.imports.read", "crm.imports.manage"
];

type SyntheticSeed = {
  schemaVersion: string;
  privacy: string;
  tenantProfile: string;
  records: Record<CrmResource, Array<Record<string, unknown>>>;
};

type PilotAssertion = {
  key: string;
  status: "pass";
  detail: string;
};

export type SyntheticPilotEvidence = {
  schemaVersion: typeof pilotVersion;
  status: "passed";
  classification: "isolated-synthetic";
  generatedAt: string;
  input: {
    seedPath: "database/seeds/v2607-synthetic.json";
    seedSchemaVersion: string;
    seedSha256: string;
    privacy: "synthetic-only";
    workbookRead: false;
  };
  execution: {
    adapter: "MemoryCrmV1Store";
    networkAccess: false;
    databaseAccess: false;
    runtimeDeployment: false;
    liveTenantMutation: false;
    tenantCount: 2;
  };
  aggregateCounts: {
    primaryTenant: Record<CrmResource, number>;
    controlTenant: Record<CrmResource, number>;
    reportsAvailable: number;
    acceptedAuditEvents: number;
    rejectedAuditEvents: number;
    outboxEvents: number;
    import: {
      duplicateRecords: number;
      quarantinedRecords: number;
      committedRecords: number;
      rolledBackBatches: number;
    };
  };
  assertions: PilotAssertion[];
  privacy: {
    aggregateEvidenceOnly: true;
    sensitiveValuesPersistedInEvidence: false;
    defaultProjectionMasked: true;
    privilegedProjectionChecked: true;
    outboxPayloadsSensitiveDataFree: true;
  };
  rollbackAndCleanup: {
    importRollback: "passed";
    persistence: "none";
    cleanup: "in-memory store discarded when the process exits";
    externalSideEffects: "none";
  };
  canary: {
    state: "synthetic_passed";
    scope: "source-only";
    livePromotion: false;
    productionReadinessClaimed: false;
  };
  gaps: string[];
};

export async function runSyntheticPilot(options: { seedPath?: string; generatedAt?: string } = {}): Promise<SyntheticPilotEvidence> {
  const seedPath = resolve(options.seedPath ?? "../database/seeds/v2607-synthetic.json");
  const rawSeed = await readFile(seedPath);
  const seed = parseSeed(rawSeed.toString("utf8"));
  const seedSha256 = createHash("sha256").update(rawSeed).digest("hex");
  const assertions: PilotAssertion[] = [];
  const pass = (key: string, detail: string): void => {
    assertions.push({ key, status: "pass", detail });
  };

  assert.equal(seed.schemaVersion, seedContract);
  assert.equal(seed.privacy, "synthetic-only");
  assert.equal(seed.tenantProfile, "healthcare-call-center@1");
  pass("input.synthetic_seed", "El runner acepto exclusivamente el seed JSON sintetico v1.");

  const store = new MemoryCrmV1Store();
  const primary = access("tenant_synthetic_primary");
  const control = access("tenant_synthetic_control");
  let requestSequence = 0;
  const mutation = (accessContext: CrmAccessContext, body: unknown, key: string): CrmMutationContext => ({
    correlationId: `synthetic-correlation-${key}`,
    requestId: `synthetic-request-${++requestSequence}`,
    actor,
    access: accessContext,
    idempotencyKey: key,
    requestChecksum: checksum(body)
  });

  const accountSeed = requireSeedRecord(seed, "accounts");
  const accountInput = normalizePayload("accounts", withoutKeys(accountSeed, ["id"]));
  const accountMutation = mutation(primary, accountInput, "synthetic-account-create");
  const account = await store.create("accounts", accountInput, accountMutation);
  const accountReplay = await store.create("accounts", accountInput, accountMutation);
  assert.equal(accountReplay.replayed, true);
  assert.equal(accountReplay.record.id, account.record.id);
  pass("idempotency.replay", "Un retry con igual llave y checksum devolvio el mismo agregado.");

  const conflictingAccount = { ...accountInput, name: "Cuenta sintetica alterna" };
  await expectCode(
    store.create("accounts", conflictingAccount, { ...accountMutation, requestChecksum: checksum(conflictingAccount) }),
    "crm.idempotency.conflict"
  );
  pass("idempotency.payload_conflict", "La misma llave con un payload diferente fue rechazada.");

  const contactSeed = requireSeedRecord(seed, "contacts");
  const contactInput = normalizePayload("contacts", {
    ...withoutKeys(contactSeed, ["id", "accountId"]),
    accountId: account.record.id,
    sensitive: { birthDate: "1990-01-01", memberReference: "SYNTHETIC-ONLY" }
  });
  const contact = await store.create("contacts", contactInput, mutation(primary, contactInput, "synthetic-contact-create"));
  const maskedContact = (await store.list(primary, "contacts", listQuery())).data[0];
  assert.equal(maskedContact.masked, true);
  assert.equal(maskedContact.sensitive, undefined);
  const privilegedContact = (await store.list(access(primary.tenantId, [...fullCapabilities, "crm.sensitive.read"]), "contacts", listQuery())).data[0];
  assert.ok(privilegedContact.sensitive);
  pass("privacy.masking", "La proyeccion ordinaria omitio sensitive y la capability separada habilito la lectura controlada.");

  const caseSeed = requireSeedRecord(seed, "cases");
  const caseInput = {
    ...withoutKeys(caseSeed, ["id", "accountId", "contactId", "status"]),
    accountId: account.record.id,
    contactId: contact.record.id,
    status: "new"
  };
  const caseRecord = await store.create("cases", caseInput, mutation(primary, caseInput, "synthetic-case-create"));
  const triageBody = { name: "transition", payload: { targetStatus: "triaged" }, expectedVersion: 1 };
  const triaged = await store.command("cases", caseRecord.record.id, triageBody, mutation(primary, triageBody, "synthetic-case-triage"));
  assert.equal(triaged.record.status, "triaged");
  await expectCode(
    store.update("cases", caseRecord.record.id, { subject: "Cambio sintetico stale" }, 1, mutation(primary, { subject: "Cambio sintetico stale" }, "synthetic-case-stale-update")),
    "crm.version.conflict"
  );
  const progressBody = { name: "transition", payload: { targetStatus: "in_progress" }, expectedVersion: 2 };
  const inProgress = await store.command("cases", caseRecord.record.id, progressBody, mutation(primary, progressBody, "synthetic-case-progress"));
  assert.equal(inProgress.record.status, "in_progress");
  assert.equal(inProgress.record.version, 3);
  pass("cases.lifecycle", "El caso avanzo new -> triaged -> in_progress con version optimista.");
  pass("concurrency.optimistic", "Un update con version stale fue rechazado sin alterar la version vigente.");

  const invalidCloseBody = { name: "transition", payload: { targetStatus: "closed" }, expectedVersion: 3 };
  await expectCode(
    store.command("cases", caseRecord.record.id, invalidCloseBody, mutation(primary, invalidCloseBody, "synthetic-case-invalid-close")),
    "crm.case.transition_invalid"
  );
  pass("cases.invalid_transition_audited", "Una transicion no permitida fue rechazada y quedo en auditoria.");

  const activitySeed = requireSeedRecord(seed, "activities");
  const activityInput = {
    ...withoutKeys(activitySeed, ["id", "caseId"]),
    caseId: caseRecord.record.id,
    accountId: account.record.id,
    contactId: contact.record.id
  };
  await store.create("activities", activityInput, mutation(primary, activityInput, "synthetic-activity-create"));
  pass("activities.linked", "La actividad sintetica quedo ligada al caso, cuenta y contacto del mismo tenant.");

  const appointmentSeed = requireSeedRecord(seed, "appointments");
  const appointmentInput = {
    ...withoutKeys(appointmentSeed, ["id", "caseId", "status"]),
    caseId: caseRecord.record.id,
    accountId: account.record.id,
    contactId: contact.record.id,
    status: "requested"
  };
  const appointment = await store.create("appointments", appointmentInput, mutation(primary, appointmentInput, "synthetic-appointment-create"));
  const scheduleBody = {
    name: "schedule",
    payload: {
      startAt: "2026-08-03T14:00:00.000Z",
      endAt: "2026-08-03T14:30:00.000Z",
      timezone: "America/Santo_Domingo"
    },
    expectedVersion: 1
  };
  const scheduled = await store.command("appointments", appointment.record.id, scheduleBody, mutation(primary, scheduleBody, "synthetic-appointment-schedule"));
  assert.equal(scheduled.record.status, "scheduled");
  pass("appointments.lifecycle", "La cita avanzo requested -> scheduled con rango y timezone sinteticos.");

  const opportunitySeed = requireSeedRecord(seed, "opportunities");
  const opportunityInput = {
    ...withoutKeys(opportunitySeed, ["id", "accountId", "stageId", "status"]),
    accountId: account.record.id,
    primaryContactId: contact.record.id,
    stageId: "lead",
    status: "open"
  };
  const opportunity = await store.create("opportunities", opportunityInput, mutation(primary, opportunityInput, "synthetic-opportunity-create"));
  const qualifyBody = { name: "transition", payload: { stageId: "qualified" }, expectedVersion: 1 };
  const qualified = await store.command("opportunities", opportunity.record.id, qualifyBody, mutation(primary, qualifyBody, "synthetic-opportunity-qualify"));
  assert.equal(qualified.record.stageId, "qualified");
  pass("opportunities.pipeline", "La oportunidad avanzo lead -> qualified en el pipeline default.");

  const dashboard = await store.dashboard(primary, { from: "2026-07-01T00:00:00.000Z", to: "2026-08-31T23:59:59.999Z" });
  const primaryCounts = await counts(store, primary);
  assert.equal(dashboard.contractVersion, "crm-dashboard-summary-v1");
  assert.equal(dashboard.metricSetVersion, "healthcare-call-center@1");
  assert.equal(dashboard.domains.find((domain) => domain.key === "cases")?.value, 1);
  const reports = await store.reports(primary);
  assert.ok(reports.some((report) => report.key === "case-backlog"));
  assert.ok(reports.some((report) => report.key === "pipeline-summary"));
  const reportInput = { reportKey: "case-backlog", format: "json", period: dashboard.period };
  const reportJob = await store.createJob("report-run", reportInput, mutation(primary, reportInput, "synthetic-report-run"));
  assert.equal(reportJob.job.status, "accepted");
  pass("dashboard.versioned", "Dashboard summary reporto contrato, metric set, perfil y agregados versionados.");
  pass("reports.catalog_and_job", "El catalogo expuso reportes operativos/comerciales y acepto un report-run sintetico.");

  const duplicateImport = {
    sourceFingerprint: seedSha256,
    records: [
      { externalId: "SYN-DUP-001", caseSubject: "Seguimiento sintetico duplicado A" },
      { externalId: "SYN-DUP-001", caseSubject: "Seguimiento sintetico duplicado B" }
    ]
  };
  const duplicateBatch = await store.importPreflight(duplicateImport, mutation(primary, duplicateImport, "synthetic-import-duplicate-stage"));
  assert.equal(duplicateBatch.batch.duplicateCount, 2);
  assert.equal(duplicateBatch.batch.quarantineCount, 2);
  const duplicateDryRun = await store.importCommand(
    duplicateBatch.batch.id,
    "dry-run",
    mutation(primary, { batch: "duplicate", command: "dry-run" }, "synthetic-import-duplicate-dry")
  );
  await expectCode(
    store.importCommand(
      duplicateBatch.batch.id,
      "commit",
      mutation(primary, { batch: "duplicate", command: "commit" }, "synthetic-import-duplicate-commit")
    ),
    "crm.import.quarantine_unresolved"
  );
  assert.equal(duplicateDryRun.batch.status, "validated");
  pass("imports.duplicate_quarantine", "El preflight detecto duplicados, dry-run valido el lote y commit fallo cerrado por quarantine.");

  const cleanImport = {
    sourceFingerprint: checksum({ seedSha256, batch: "clean" }),
    records: [{ externalId: "SYN-CLEAN-001", caseSubject: "Seguimiento sintetico limpio" }]
  };
  const cleanBatch = await store.importPreflight(cleanImport, mutation(primary, cleanImport, "synthetic-import-clean-stage"));
  const cleanDryRun = await store.importCommand(
    cleanBatch.batch.id,
    "dry-run",
    mutation(primary, { batch: "clean", command: "dry-run" }, "synthetic-import-clean-dry")
  );
  const committed = await store.importCommand(
    cleanBatch.batch.id,
    "commit",
    mutation(primary, { batch: "clean", command: "commit" }, "synthetic-import-clean-commit")
  );
  const rolledBack = await store.importCommand(
    cleanBatch.batch.id,
    "rollback",
    mutation(primary, { batch: "clean", command: "rollback" }, "synthetic-import-clean-rollback")
  );
  assert.equal(cleanDryRun.batch.status, "validated");
  assert.equal(committed.batch.status, "committed");
  assert.equal(rolledBack.batch.status, "rolled_back");
  pass("imports.commit_and_rollback", "Un lote limpio paso staged -> validated -> committed -> rolled_back.");

  const controlCounts = await counts(store, control);
  assert.ok(Object.values(controlCounts).every((value) => value === 0));
  assert.equal(await store.get(control, "contacts", contact.record.id), null);
  pass("tenant.isolation", "El tenant control no pudo listar ni resolver recursos del tenant primario.");

  const operationalEvidence = store.evidence(primary);
  const acceptedAuditEvents = operationalEvidence.audits.filter((event) => event.outcome === "accepted").length;
  const rejectedAuditEvents = operationalEvidence.audits.filter((event) => event.outcome === "rejected").length;
  assert.ok(acceptedAuditEvents > 0);
  assert.ok(rejectedAuditEvents > 0);
  assert.equal(JSON.stringify(operationalEvidence.outbox).includes("birthDate"), false);
  assert.equal(JSON.stringify(operationalEvidence.outbox).includes("memberReference"), false);
  pass("audit.accepted_and_rejected", "La evidencia operacional contiene resultados aceptados y rechazados.");
  pass("outbox.minimal_payload", "Los eventos internos del outbox no contienen campos sensibles del contacto.");

  assert.deepEqual(primaryCounts, {
    accounts: 1,
    contacts: 1,
    cases: 1,
    activities: 1,
    appointments: 1,
    opportunities: 1
  });
  pass("aggregate.counts", "Los seis dominios CRM quedaron representados una vez en el tenant sintetico.");

  return {
    schemaVersion: pilotVersion,
    status: "passed",
    classification: "isolated-synthetic",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    input: {
      seedPath: "database/seeds/v2607-synthetic.json",
      seedSchemaVersion: seed.schemaVersion,
      seedSha256,
      privacy: "synthetic-only",
      workbookRead: false
    },
    execution: {
      adapter: "MemoryCrmV1Store",
      networkAccess: false,
      databaseAccess: false,
      runtimeDeployment: false,
      liveTenantMutation: false,
      tenantCount: 2
    },
    aggregateCounts: {
      primaryTenant: primaryCounts,
      controlTenant: controlCounts,
      reportsAvailable: reports.length,
      acceptedAuditEvents,
      rejectedAuditEvents,
      outboxEvents: operationalEvidence.outbox.length,
      import: {
        duplicateRecords: duplicateBatch.batch.duplicateCount,
        quarantinedRecords: duplicateBatch.batch.quarantineCount,
        committedRecords: committed.batch.acceptedCount,
        rolledBackBatches: rolledBack.batch.status === "rolled_back" ? 1 : 0
      }
    },
    assertions,
    privacy: {
      aggregateEvidenceOnly: true,
      sensitiveValuesPersistedInEvidence: false,
      defaultProjectionMasked: true,
      privilegedProjectionChecked: true,
      outboxPayloadsSensitiveDataFree: true
    },
    rollbackAndCleanup: {
      importRollback: "passed",
      persistence: "none",
      cleanup: "in-memory store discarded when the process exits",
      externalSideEffects: "none"
    },
    canary: {
      state: "synthetic_passed",
      scope: "source-only",
      livePromotion: false,
      productionReadinessClaimed: false
    },
    gaps: [
      "El piloto no sustituye pruebas PostgreSQL, load tests ni canary de runtime.",
      "Los conflictos de version e idempotencia se rechazan, pero esta capa in-memory no registra esos rechazos en audit; la transicion invalida si queda auditada.",
      "No se ejercitaron dependencias IAM, Directory, Store o Platform live ni feature flags productivos."
    ]
  };
}

export async function writeSyntheticPilotEvidence(evidence: SyntheticPilotEvidence, evidenceDirectory = resolve("../docs/evidence")): Promise<{ jsonPath: string; markdownPath: string }> {
  const jsonPath = resolve(evidenceDirectory, `${evidenceBasename}.json`);
  const markdownPath = resolve(evidenceDirectory, `${evidenceBasename}.md`);
  await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(evidence), "utf8");
  return { jsonPath, markdownPath };
}

function renderMarkdown(evidence: SyntheticPilotEvidence): string {
  const primary = evidence.aggregateCounts.primaryTenant;
  const control = evidence.aggregateCounts.controlTenant;
  return `# Piloto sintetico DemoCRM v2607\n\n` +
    `Fecha de evidencia: \`${evidence.generatedAt}\`\n\n` +
    `Estado: \`${evidence.status}\`\n\n` +
    `Clasificacion: \`${evidence.classification}\`\n\n` +
    `## Alcance\n\n` +
    `Este piloto ejecuta las capas CRM v1 sobre \`MemoryCrmV1Store\`, usando ` +
    `exclusivamente \`database/seeds/v2607-synthetic.json\`. No lee el XLSX de ` +
    `VOIX, no abre red o PostgreSQL, no despliega runtime y no muta tenants live.\n\n` +
    `Seed SHA-256: \`${evidence.input.seedSha256}\`.\n\n` +
    `## Resultado agregado\n\n` +
    `| Dominio | Tenant primario | Tenant control |\n| --- | ---: | ---: |\n` +
    `${(["accounts", "contacts", "cases", "activities", "appointments", "opportunities"] as CrmResource[]).map((resource) => `| ${resource} | ${primary[resource]} | ${control[resource]} |`).join("\n")}\n\n` +
    `- reportes disponibles: \`${evidence.aggregateCounts.reportsAvailable}\`;\n` +
    `- audit aceptado/rechazado: \`${evidence.aggregateCounts.acceptedAuditEvents}/${evidence.aggregateCounts.rejectedAuditEvents}\`;\n` +
    `- eventos outbox con payload minimo: \`${evidence.aggregateCounts.outboxEvents}\`;\n` +
    `- import duplicados/quarantine/commit/rollback: ` +
    `\`${evidence.aggregateCounts.import.duplicateRecords}/${evidence.aggregateCounts.import.quarantinedRecords}/${evidence.aggregateCounts.import.committedRecords}/${evidence.aggregateCounts.import.rolledBackBatches}\`.\n\n` +
    `## Asserts\n\n` +
    evidence.assertions.map((item) => `- \`PASS\` **${item.key}:** ${item.detail}`).join("\n") + `\n\n` +
    `## Privacidad, rollback y cleanup\n\n` +
    `La evidencia contiene solo conteos y resultados agregados. Se verifico masking por ` +
    `defecto, lectura sensible con capability separada y ausencia de campos sensibles ` +
    `en outbox. El lote limpio ejercito rollback y el store completo se descarta al salir ` +
    `del proceso; no existen efectos externos que limpiar.\n\n` +
    `## Canary y limites\n\n` +
    `El estado es \`${evidence.canary.state}\` con alcance \`${evidence.canary.scope}\`. ` +
    `No representa promocion live ni readiness productivo.\n\n` +
    evidence.gaps.map((gap) => `- ${gap}`).join("\n") + `\n\n` +
    `## Reproduccion\n\n` +
    `\`\`\`bash\ncd /srv/containers/apps/pyrosa-democrm/app\nnpm --prefix ui run pilot:synthetic\n\`\`\`\n\n` +
    `El JSON hermano conserva el resultado machine-readable saneado.\n`;
}

function access(tenantId: string, capabilities = fullCapabilities): CrmAccessContext {
  const tenantKey = createHash("sha256").update(tenantId).digest("hex").slice(0, 12);
  return {
    tenantId,
    tenantKey,
    displayName: "Tenant sintetico",
    schemaName: `pyrosa_democrm_${tenantKey}`,
    dictionaryVersion: "2.0.1",
    profileKey: "healthcare-call-center",
    profileVersion: "1",
    timezone: "America/Santo_Domingo",
    locale: "es-DO",
    capabilities,
    authorizationDecisionId: `synthetic-decision:${tenantId}`
  };
}

function parseSeed(raw: string): SyntheticSeed {
  const value = JSON.parse(raw) as Partial<SyntheticSeed>;
  assert.ok(value && typeof value === "object");
  assert.ok(value.records && typeof value.records === "object");
  for (const resource of ["accounts", "contacts", "cases", "activities", "appointments", "opportunities"] as CrmResource[]) {
    assert.ok(Array.isArray(value.records[resource]), `El seed no contiene ${resource}.`);
  }
  return value as SyntheticSeed;
}

function requireSeedRecord(seed: SyntheticSeed, resource: CrmResource): Record<string, unknown> {
  const record = seed.records[resource][0];
  assert.ok(record, `El seed sintetico requiere al menos un registro de ${resource}.`);
  return structuredClone(record);
}

function withoutKeys(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code
  ));
}

function listQuery(): CrmListQuery {
  return { limit: 25, cursor: null, q: null, sort: "updatedAt", direction: "desc", filters: {} };
}

async function counts(store: MemoryCrmV1Store, accessContext: CrmAccessContext): Promise<Record<CrmResource, number>> {
  const entries = await Promise.all(
    (["accounts", "contacts", "cases", "activities", "appointments", "opportunities"] as CrmResource[])
      .map(async (resource) => [resource, (await store.list(accessContext, resource, listQuery())).total] as const)
  );
  return Object.fromEntries(entries) as Record<CrmResource, number>;
}

async function main(): Promise<void> {
  const evidence = await runSyntheticPilot();
  const paths = await writeSyntheticPilotEvidence(evidence);
  process.stdout.write(`${JSON.stringify({ status: evidence.status, assertions: evidence.assertions.length, ...paths })}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
