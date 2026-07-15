import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertMutationRequestSecurity,
  checksum,
  normalizeConfigurationPatch,
  normalizeExportRequest,
  normalizePayload,
  normalizeReportRunRequest,
  parseListQuery,
  resolveIndustryProfile
} from "./crmV1Domain.js";
import { MemoryCrmV1Store, commandPatch, fingerprintSyntheticSeed } from "./crmV1Store.js";
import type { CrmAccessContext, CrmIdentity, CrmMutationContext, CrmRecord } from "./crmV1Types.js";

const actor: CrmIdentity = { kind: "browser", issuer: "test-iam", subject: "user:test", roles: ["supervisor"], scopes: [] };
const fullCapabilities = [
  "crm.accounts.read", "crm.accounts.write", "crm.contacts.read", "crm.contacts.write",
  "crm.cases.read", "crm.cases.write", "crm.cases.assign", "crm.activities.read", "crm.activities.write",
  "crm.appointments.read", "crm.appointments.write", "crm.opportunities.read", "crm.opportunities.write",
  "crm.dashboard.read", "crm.reports.read", "crm.exports.create", "crm.config.read", "crm.config.manage",
  "crm.imports.read", "crm.imports.manage"
];

function access(tenantId: string, capabilities = fullCapabilities): CrmAccessContext {
  const tenantKey = tenantId.replace(/[^a-z0-9_]/g, "_");
  return {
    tenantId, tenantKey, displayName: `Tenant ${tenantId}`, schemaName: `pyrosa_democrm_${tenantKey}`,
    dictionaryVersion: "2.0.1", profileKey: "healthcare-call-center", profileVersion: "1",
    timezone: "America/Santo_Domingo", locale: "es-DO", capabilities,
    authorizationDecisionId: `decision:${tenantId}`
  };
}

let sequence = 0;
function mutation(context: CrmAccessContext, body: unknown, key?: string): CrmMutationContext {
  sequence += 1;
  return { correlationId: `correlation-${sequence}`, requestId: `request-${sequence}`, actor, access: context, idempotencyKey: key ?? `idem-key-${sequence}`, requestChecksum: checksum(body) };
}

test("tenant isolation and sensitive projection are enforced by the store", async () => {
  const store = new MemoryCrmV1Store();
  const first = access("tenant_a");
  const second = access("tenant_b");
  const account = await store.create("accounts", { name: "Cuenta sintetica", type: "organization", status: "active" }, mutation(first, { account: 1 }));
  await store.create("contacts", { displayName: "Paciente sintetico", role: "patient", status: "active", accountId: account.record.id, sensitive: { birthDate: "1990-01-01" } }, mutation(first, { contact: 1 }));

  assert.equal((await store.list(first, "contacts", listQuery())).total, 1);
  assert.equal((await store.list(second, "contacts", listQuery())).total, 0);
  const projected = (await store.list(first, "contacts", listQuery())).data[0];
  assert.equal(projected.sensitive, undefined);
  assert.equal(projected.masked, true);
  const privileged = (await store.list(access("tenant_a", [...fullCapabilities, "crm.sensitive.read"]), "contacts", listQuery())).data[0];
  assert.deepEqual(privileged.sensitive, { birthDate: "1990-01-01" });
});

test("activity completion derives and preserves its physical throughput timestamp", async () => {
  const store = new MemoryCrmV1Store();
  const context = access("tenant_activity_completion");
  const created = await store.create(
    "activities",
    { subject: "Seguimiento", type: "follow_up", status: "open" },
    mutation(context, { activity: "create" })
  );
  assert.equal(created.record.completedAt, null);

  const completed = await store.update(
    "activities",
    created.record.id,
    { status: "completed" },
    created.record.version,
    mutation(context, { activity: "complete" })
  );
  assert.match(String(completed.record.completedAt), /^\d{4}-\d{2}-\d{2}T/);

  const edited = await store.update(
    "activities",
    created.record.id,
    { subject: "Seguimiento documentado" },
    completed.record.version,
    mutation(context, { activity: "edit-completed" })
  );
  assert.equal(edited.record.completedAt, completed.record.completedAt);

  const reopened = await store.update(
    "activities",
    created.record.id,
    { status: "in_progress" },
    edited.record.version,
    mutation(context, { activity: "reopen" })
  );
  assert.equal(reopened.record.completedAt, null);
});

test("creates are idempotent and reject a reused key with a different checksum", async () => {
  const store = new MemoryCrmV1Store(); const context = access("tenant_idem");
  const firstMutation = mutation(context, { name: "A" }, "idempotency-account-1");
  const first = await store.create("accounts", { name: "A", type: "organization", status: "active" }, firstMutation);
  const replay = await store.create("accounts", { name: "A", type: "organization", status: "active" }, firstMutation);
  assert.equal(replay.replayed, true); assert.equal(replay.record.id, first.record.id);
  await assert.rejects(
    store.create("accounts", { name: "B", type: "organization", status: "active" }, { ...firstMutation, requestChecksum: checksum({ name: "B" }) }),
    (error: unknown) => hasCode(error, "crm.idempotency.conflict")
  );
  await assert.rejects(
    store.create("contacts", { displayName: "Contacto", role: "patient" }, { ...firstMutation, requestChecksum: checksum({ contact: "same-raw-key" }) }),
    (error: unknown) => hasCode(error, "crm.idempotency.conflict")
  );
});

test("optimistic concurrency and case state machine preserve audit evidence", async () => {
  const store = new MemoryCrmV1Store(); const context = access("tenant_cases");
  const created = await store.create("cases", { caseType: "service", subject: "Caso sintetico", priority: "normal", status: "new" }, mutation(context, { create: 1 }));
  const triaged = await store.command("cases", created.record.id, { name: "transition", payload: { targetStatus: "triaged" }, expectedVersion: 1 }, mutation(context, { transition: "triaged" }));
  assert.equal(triaged.record.status, "triaged"); assert.equal(triaged.record.version, 2);
  await assert.rejects(
    store.command("cases", created.record.id, { name: "transition", payload: { targetStatus: "closed" }, expectedVersion: 2 }, mutation(context, { transition: "closed" })),
    (error: unknown) => hasCode(error, "crm.case.transition_invalid")
  );
  await assert.rejects(
    store.update("cases", created.record.id, { subject: "Cambio tardio" }, 1, mutation(context, { update: 1 })),
    (error: unknown) => hasCode(error, "crm.version.conflict")
  );
  const evidence = store.evidence(context);
  assert.ok(evidence.audits.some((event) => event.outcome === "rejected" && event.reasonCode === "crm.case.transition_invalid"));
  assert.ok(evidence.outbox.some((event) => event.eventType === "crm.cases.transition"));
});

test("appointment conflicts and opportunity transitions remain separate", async () => {
  const store = new MemoryCrmV1Store(); const context = access("tenant_schedule");
  const account = await store.create("accounts", { name: "Cuenta B2B sintetica", type: "organization", status: "active" }, mutation(context, { account: 1 }));
  const caseRecord = await store.create("cases", { caseType: "coordination", subject: "Caso de agenda", priority: "normal", status: "new" }, mutation(context, { case: 1 }));
  await store.create("appointments", { caseId: caseRecord.record.id, status: "requested", resourceId: "resource_synthetic", startAt: "2026-08-01T14:00:00.000Z", endAt: "2026-08-01T15:00:00.000Z", timezone: "America/Santo_Domingo" }, mutation(context, { appointment: 1 }));
  await assert.rejects(
    store.create("appointments", { caseId: caseRecord.record.id, status: "requested", resourceId: "resource_synthetic", startAt: "2026-08-01T14:30:00.000Z", endAt: "2026-08-01T15:30:00.000Z", timezone: "America/Santo_Domingo" }, mutation(context, { appointment: 2 })),
    (error: unknown) => hasCode(error, "crm.appointment.conflict")
  );
  const opportunity = await store.create("opportunities", { accountId: account.record.id, name: "Venta sintetica", pipelineId: "default", stageId: "lead", status: "open", amountMinor: 1000, currency: "USD", probability: 10 }, mutation(context, { opportunity: 1 }));
  const qualified = await store.command("opportunities", opportunity.record.id, { name: "transition", payload: { stageId: "qualified" }, expectedVersion: 1 }, mutation(context, { stage: 1 }));
  assert.equal(qualified.record.stageId, "qualified");
  assert.equal((await store.list(context, "cases", listQuery())).total, 1);
  assert.equal((await store.list(context, "opportunities", listQuery())).total, 1);
});

test("appointment lifecycle validates ranges before resource conflict checks", async () => {
  const store = new MemoryCrmV1Store(); const context = access("tenant_schedule_ranges");
  const caseRecord = await store.create("cases", { caseType: "coordination", subject: "Caso de agenda", priority: "normal" }, mutation(context, { case: 1 }));
  await assert.rejects(
    store.create("appointments", {
      caseId: caseRecord.record.id,
      startAt: "2026-08-01T15:00:00.000Z",
      endAt: "2026-08-01T14:00:00.000Z",
      timezone: "America/Santo_Domingo"
    }, mutation(context, { invalidRange: 1 })),
    (error: unknown) => hasCode(error, "crm.appointment.range_invalid")
  );
  const requested = await store.create("appointments", {
    caseId: caseRecord.record.id,
    status: "requested",
    timezone: "America/Santo_Domingo"
  }, mutation(context, { requested: 1 }));
  await assert.rejects(
    store.command("appointments", requested.record.id, { name: "schedule", payload: {}, expectedVersion: 1 }, mutation(context, { schedule: 1 })),
    (error: unknown) => hasCode(error, "crm.appointment.schedule_required")
  );
  const scheduled = await store.command("appointments", requested.record.id, {
    name: "schedule",
    payload: {
      startAt: "2026-08-02T14:00:00.000Z",
      endAt: "2026-08-02T15:00:00.000Z",
      timezone: "America/Santo_Domingo",
      resourceId: "resource_synthetic",
      reasonCode: "initial-schedule"
    },
    expectedVersion: 1
  }, mutation(context, { schedule: "valid" }));
  assert.equal(scheduled.record.status, "scheduled");
  const rescheduled = await store.command("appointments", requested.record.id, {
    name: "reschedule",
    payload: {
      startAt: "2026-08-03T16:00:00.000Z",
      endAt: "2026-08-03T17:00:00.000Z",
      timezone: "America/Santo_Domingo",
      resourceId: "resource_synthetic",
      reasonCode: "patient-request"
    },
    expectedVersion: 2
  }, mutation(context, { reschedule: "valid" }));
  assert.equal(rescheduled.record.status, "rescheduled");
  assert.equal(rescheduled.record.startAt, "2026-08-03T16:00:00.000Z");
  const accepted = store.evidence(context).audits.find((event) => event.action === "appointments.reschedule");
  assert.equal(accepted?.reasonCode, "patient-request");
  assert.equal(store.evidence(context).outbox.find((event) => event.eventType === "crm.appointments.reschedule")?.payload.reasonCode, "patient-request");
});

test("outbox preserves caller correlation independently from request id", async () => {
  const store = new MemoryCrmV1Store(); const context = access("tenant_correlation");
  const operation = mutation(context, { name: "Cuenta correlacion" });
  assert.notEqual(operation.correlationId, operation.requestId);
  await store.create("accounts", { name: "Cuenta correlacion", type: "organization" }, operation);
  assert.equal(store.evidence(context).outbox[0]?.correlationId, operation.correlationId);
});

test("partial opportunity payloads preserve lifecycle and do not inject create defaults", () => {
  const current = {
    amountMinor: 480000,
    currency: "DOP",
    pipelineId: "enterprise",
    probability: 100,
    stageId: "closed-won",
    status: "won"
  };
  const patch = normalizePayload("opportunities", { name: "Renovacion ajustada" }, true);

  assert.deepEqual(patch, { name: "Renovacion ajustada" });
  assert.deepEqual({ ...current, ...patch }, { ...current, name: "Renovacion ajustada" });
  assert.deepEqual(
    normalizePayload("opportunities", { amountMinor: 9000, currency: "dop", probability: 35 }, true),
    { amountMinor: 9000, currency: "DOP", probability: 35 }
  );
});

test("browser mutations require JSON and the exact session CSRF token", () => {
  assert.doesNotThrow(() => assertMutationRequestSecurity({ method: "GET", expectedCsrfToken: "csrf-secret" }));
  assert.doesNotThrow(() => assertMutationRequestSecurity({ method: "POST", contentType: "application/json; charset=utf-8" }));
  assert.doesNotThrow(() => assertMutationRequestSecurity({ method: "PATCH", contentType: "application/json", csrfToken: "csrf-secret", expectedCsrfToken: "csrf-secret" }));
  assert.throws(
    () => assertMutationRequestSecurity({ method: "POST", contentType: "text/plain", csrfToken: "csrf-secret", expectedCsrfToken: "csrf-secret" }),
    (error: unknown) => hasCode(error, "crm.request.content_type_required")
  );
  assert.throws(
    () => assertMutationRequestSecurity({ method: "POST", contentType: "application/json", csrfToken: "wrong-token", expectedCsrfToken: "csrf-secret" }),
    (error: unknown) => hasCode(error, "crm.csrf.invalid")
  );
});

test("consent, report and export inputs follow one allowlisted contract", () => {
  assert.equal(normalizePayload("contacts", { displayName: "Paciente", role: "patient", consentStatus: "recorded" }).consentStatus, "recorded");
  assert.throws(
    () => normalizePayload("contacts", { displayName: "Paciente", role: "patient", consentStatus: "granted" }),
    (error: unknown) => hasCode(error, "crm.validation.failed")
  );
  assert.deepEqual(normalizeReportRunRequest({ reportId: "case-backlog" }), { reportKey: "case-backlog", format: "json" });
  assert.deepEqual(
    normalizeExportRequest({ resource: "cases", format: "csv", filters: { status: "new" } }),
    { resource: "cases", format: "csv", includeSensitive: false, filters: { status: "new" } }
  );
  assert.throws(() => normalizeReportRunRequest({ reportKey: "unknown-report" }), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.throws(() => normalizeExportRequest({ resource: "cases", includeSensitive: true }), (error: unknown) => hasCode(error, "crm.export.sensitive_not_available"));
});

test("appointment commands reject non-IANA timezones", () => {
  const appointment = {
    id: "appointment_test",
    tenantId: "tenant_test",
    version: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    archivedAt: null,
    status: "requested"
  } satisfies CrmRecord;
  assert.throws(
    () => commandPatch("appointments", appointment, { name: "schedule", payload: { timezone: "Mars/Olympus" }, expectedVersion: 1 }),
    (error: unknown) => hasCode(error, "crm.validation.failed")
  );
});

test("dashboard uses stored aggregates and declares metric/profile versions", async () => {
  const store = new MemoryCrmV1Store(); const context = access("tenant_dashboard"); store.seedSynthetic(context);
  const summary = await store.dashboard(context, { from: "2026-07-01T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" });
  assert.equal(summary.contractVersion, "crm-dashboard-summary-v1");
  assert.equal(summary.metricSetVersion, "healthcare-call-center@1");
  assert.equal(summary.freshness.state, "live");
  assert.equal(summary.domains.find((domain) => domain.key === "cases")?.value, 1);
});

test("profiles share one contract and configuration upgrades are versioned", async () => {
  const core = resolveIndustryProfile("core", "1"); const healthcare = resolveIndustryProfile("healthcare-call-center", "1");
  assert.deepEqual(core.caseStates, healthcare.caseStates);
  assert.ok(healthcare.fields.some((field) => field.sensitive));
  const store = new MemoryCrmV1Store(); const context = access("tenant_profile");
  const current = await store.getConfiguration(context);
  const patch = normalizeConfigurationPatch({ labels: { case: "Seguimiento" }, featureFlags: { notifications: true, externalScheduling: false, sensitiveExtensions: false } });
  const updateMutation = mutation(context, patch, "config-idempotent-1");
  const updated = await store.updateConfiguration(patch, current.version, updateMutation);
  const replayed = await store.updateConfiguration(patch, current.version, updateMutation);
  assert.equal(updated.version, current.version + 1);
  assert.equal(updated.labels.case, "Seguimiento");
  assert.deepEqual(replayed, updated);
  assert.equal(store.evidence(context).audits.filter((event) => event.action === "configuration.updated").length, 1);
});

test("configuration patches enforce their schema and reject sensitive keys recursively", () => {
  assert.deepEqual(
    normalizeConfigurationPatch({
      locale: "es-do",
      profileKey: "healthcare-call-center",
      profileVersion: "1",
      timezone: "America/Santo_Domingo"
    }),
    {
      locale: "es-DO",
      profileKey: "healthcare-call-center",
      profileVersion: "1",
      timezone: "America/Santo_Domingo"
    }
  );
  assert.throws(
    () => normalizeConfigurationPatch({ labels: { clinic: { integrationToken: "never-persist" } } }),
    (error: unknown) => hasCode(error, "crm.validation.failed")
  );
  assert.throws(
    () => normalizeConfigurationPatch({ featureFlags: { notifications: true, externalScheduling: false, sensitiveExtensions: false, futureFlag: true } }),
    (error: unknown) => hasCode(error, "crm.validation.failed")
  );
  assert.throws(
    () => normalizeConfigurationPatch({ version: 9 }),
    (error: unknown) => hasCode(error, "crm.validation.failed")
  );
});

test("import preflight quarantines duplicates and gates commit", async () => {
  const store = new MemoryCrmV1Store(); const context = access("tenant_import");
  const duplicateBody = { sourceFingerprint: fingerprintSyntheticSeed(), records: [
    { externalId: "SYN-1", caseSubject: "Caso sintetico A" },
    { externalId: "SYN-1", caseSubject: "Caso sintetico B" }
  ] };
  const staged = await store.importPreflight(duplicateBody, mutation(context, duplicateBody));
  const deduplicated = await store.importPreflight(duplicateBody, mutation(context, duplicateBody));
  assert.equal(deduplicated.replayed, true);
  assert.equal(deduplicated.batch.id, staged.batch.id);
  assert.equal(staged.batch.quarantineCount, 2);
  const validated = await store.importCommand(staged.batch.id, "dry-run", mutation(context, { command: "dry-run" }));
  await assert.rejects(store.importCommand(validated.batch.id, "commit", mutation(context, { command: "commit" })), (error: unknown) => hasCode(error, "crm.import.quarantine_unresolved"));

  const cleanBody = { sourceFingerprint: checksum("another-synthetic-batch"), records: [{ externalId: "SYN-2", caseSubject: "Caso sintetico limpio" }] };
  const clean = await store.importPreflight(cleanBody, mutation(context, cleanBody));
  const dryRun = await store.importCommand(clean.batch.id, "dry-run", mutation(context, { clean: "dry" }));
  const committed = await store.importCommand(dryRun.batch.id, "commit", mutation(context, { clean: "commit" }));
  assert.equal(committed.batch.status, "committed");
  assert.equal((await store.list(context, "cases", listQuery())).total, 1);
  const rolledBack = await store.importCommand(committed.batch.id, "rollback", mutation(context, { clean: "rollback" }));
  assert.equal(rolledBack.batch.status, "rolled_back");
  assert.equal((await store.list(context, "cases", listQuery())).total, 0);

  const protectedBody = { sourceFingerprint: checksum("protected-synthetic-batch"), records: [{ externalId: "SYN-3", caseSubject: "Caso con edicion posterior" }] };
  const protectedStage = await store.importPreflight(protectedBody, mutation(context, protectedBody));
  const protectedDryRun = await store.importCommand(protectedStage.batch.id, "dry-run", mutation(context, { protected: "dry" }));
  const protectedCommit = await store.importCommand(protectedDryRun.batch.id, "commit", mutation(context, { protected: "commit" }));
  const importedCase = (await store.list(context, "cases", listQuery())).data[0];
  await store.update("cases", importedCase.id, { subject: "Edicion humana posterior" }, 1, mutation(context, { protected: "human-edit" }));
  await assert.rejects(
    store.importCommand(protectedCommit.batch.id, "rollback", mutation(context, { protected: "rollback" })),
    (error: unknown) => hasCode(error, "crm.import.rollback_conflict")
  );
  assert.equal((await store.list(context, "cases", listQuery())).data[0]?.subject, "Edicion humana posterior");
});

test("dashboard period and report catalog expose their executable contracts", async () => {
  const store = new MemoryCrmV1Store(); const context = access("tenant_contracts"); store.seedSynthetic(context);
  const outside = await store.dashboard(context, { from: "2020-01-01T00:00:00.000Z", to: "2020-02-01T00:00:00.000Z" });
  assert.equal(outside.freshness.state, "live");
  assert.ok(outside.domains.every((domain) => domain.value === 0));
  assert.ok(outside.progress.every((metric) => Number(metric.value) >= 0 && Number(metric.value) <= 100));
  const reports = await store.reports(context);
  assert.ok(reports.length > 0);
  assert.ok(reports.every((report) => report.id === report.key && report.status === "active" && report.version === "1"));
});

test("list query only accepts allowlisted filters and payloads reject unknown fields", () => {
  const url = new URL("https://crm.test/api/crm/v1/cases?status=new&limit=10&sort=priority&direction=asc");
  assert.equal(parseListQuery("cases", url).filters.status, "new");
  assert.throws(() => parseListQuery("cases", new URL("https://crm.test/api/crm/v1/cases?password=secret")), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.throws(() => normalizePayload("contacts", { displayName: "Sintetico", role: "patient", password: "secret" }), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.equal(parseListQuery("cases", new URL("https://crm.test/api/crm/v1/cases?attention=overdue")).filters.attention, "overdue");
  assert.throws(() => parseListQuery("cases", new URL("https://crm.test/api/crm/v1/cases?attention=exception")), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.throws(() => parseListQuery("appointments", new URL("https://crm.test/api/crm/v1/appointments?status=pending")), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.throws(() => normalizePayload("cases", { caseType: "service", subject: "Caso", priority: "normal", ownerId: "agent" }), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.throws(() => normalizePayload("cases", { ownerId: "agent" }, true), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.throws(() => normalizePayload("appointments", { startAt: "2026-08-01T14:00:00.000Z" }, true), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.throws(() => normalizePayload("opportunities", { stageId: "won" }, true), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.throws(() => normalizePayload("opportunities", { accountId: "account", name: "Won at create", pipelineId: "default", stageId: "won" }), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.throws(() => normalizePayload("accounts", { name: null }, true), (error: unknown) => hasCode(error, "crm.validation.failed"));
  assert.throws(() => normalizePayload("contacts", { displayName: null }, true), (error: unknown) => hasCode(error, "crm.validation.failed"));
});

function listQuery() { return { limit: 25, cursor: null, q: null, sort: "updatedAt", direction: "desc" as const, filters: {} }; }
function hasCode(error: unknown, code: string): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code); }
