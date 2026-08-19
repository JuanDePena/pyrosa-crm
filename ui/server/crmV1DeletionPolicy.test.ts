import assert from "node:assert/strict";
import { test } from "node:test";
import { checksum } from "./crmV1Domain.js";
import {
  assertDeletionAllowed,
  crmDeletionPolicies,
  deletionDecision,
  normalizeEnvironmentClass
} from "./crmV1DeletionPolicy.js";
import { MemoryCrmV1Store } from "./crmV1Store.js";
import type { CrmAccessContext, CrmIdentity, CrmMutationContext } from "./crmV1Types.js";

const actor: CrmIdentity = {
  clientId: null,
  issuer: "test-iam",
  kind: "browser",
  principalType: "human",
  roles: ["tenant_admin"],
  scopes: [],
  subject: "user:recycle-test"
};

function access(capabilities: string[], tenantId = "tenant_recycle"): CrmAccessContext {
  return {
    authorizationDecisionId: `decision:${tenantId}`,
    capabilities,
    contextVersion: `context:${tenantId}`,
    decisionReferences: { directory: "directory:1", platform: "platform:1", store: "store:1" },
    dictionaryVersion: "2026.08.19.2",
    displayName: tenantId,
    locale: "es-DO",
    physicalFingerprint: `placement:${tenantId}`,
    profileKey: "core",
    profileVersion: "1",
    schemaName: `pyrosa_democrm_${tenantId}`,
    tenantId,
    tenantKey: tenantId,
    timezone: "America/Santo_Domingo"
  };
}

let sequence = 0;
function mutation(context: CrmAccessContext, body: unknown): CrmMutationContext {
  sequence += 1;
  return {
    access: context,
    actor,
    correlationId: `correlation-${sequence}`,
    idempotencyKey: `recycle-idempotency-${sequence}`,
    requestChecksum: checksum(body),
    requestId: `request-${sequence}`
  };
}

test("environment classification is strict and deletion fails closed", () => {
  assert.equal(normalizeEnvironmentClass("development"), "development");
  assert.equal(normalizeEnvironmentClass("PRODUCTION"), "production");
  assert.equal(normalizeEnvironmentClass("demo"), null);
  assert.equal(normalizeEnvironmentClass(undefined), null);

  const unknown = deletionDecision({ access: access(["crm.accounts.recycle"]), dependencyCount: 0, environmentClass: null, record: { version: 3 }, resource: "accounts" });
  assert.deepEqual({ reasonCode: unknown.reasonCode, state: unknown.state }, { reasonCode: "environment_unknown", state: "hidden" });
  assert.throws(
    () => assertDeletionAllowed({ access: access(["crm.accounts.recycle"]), dependencyCount: 0, environmentClass: null, record: { version: 3 }, resource: "accounts" }),
    hasCode("crm.deletion.environment_unknown")
  );
});

test("matrix permits safe masters and all accredited development transactions", () => {
  const productionMaster = deletionDecision({ access: access(["crm.accounts.recycle"]), dependencyCount: 0, environmentClass: "production", record: { version: 1 }, resource: "accounts" });
  assert.deepEqual({ reasonCode: productionMaster.reasonCode, state: productionMaster.state }, { reasonCode: "master_unreferenced", state: "allowed" });

  const referencedMaster = deletionDecision({ access: access(["crm.accounts.recycle"]), dependencyCount: 2, environmentClass: "production", record: { version: 1 }, resource: "accounts" });
  assert.deepEqual({ dependencyCount: referencedMaster.dependencyCount, reasonCode: referencedMaster.reasonCode, state: referencedMaster.state }, { dependencyCount: 2, reasonCode: "master_has_transactions", state: "blocked" });

  const developmentActivity = deletionDecision({ access: access(["crm.activities.recycle"]), dependencyCount: 0, environmentClass: "development", record: { version: 1 }, resource: "activities" });
  assert.deepEqual({ reasonCode: developmentActivity.reasonCode, state: developmentActivity.state }, { reasonCode: "allowed_development", state: "allowed" });

  const productionActivity = deletionDecision({ access: access(["crm.activities.recycle"]), dependencyCount: 0, environmentClass: "production", record: { version: 1 }, resource: "activities" });
  assert.deepEqual({ reasonCode: productionActivity.reasonCode, state: productionActivity.state }, { reasonCode: "transaction_delete_forbidden", state: "hidden" });

  for (const resource of ["cases", "activities", "appointments", "opportunities"] as const) {
    const decision = deletionDecision({ access: access([crmDeletionPolicies[resource].capability]), dependencyCount: 0, environmentClass: "development", record: { version: 1 }, resource });
    assert.deepEqual({ reasonCode: decision.reasonCode, state: decision.state }, { reasonCode: "allowed_development", state: "allowed" });
    assert.equal(crmDeletionPolicies[resource].lifecycle, "enabled");
  }

  const missingCapability = deletionDecision({ access: access([]), dependencyCount: 0, environmentClass: "development", record: { version: 1 }, resource: "accounts" });
  assert.deepEqual({ reasonCode: missingCapability.reasonCode, state: missingCapability.state }, { reasonCode: "capability_missing", state: "hidden" });
});

test("trash and restore preserve the aggregate while emitting tenant-local evidence", async () => {
  const store = new MemoryCrmV1Store("development");
  const context = access(["crm.accounts.recycle", "crm.accounts.read", "crm.accounts.write"]);
  const created = await store.create("accounts", { name: "Cuenta para papelera", status: "active", type: "organization" }, mutation(context, { create: true }));
  const trashed = await store.trash("accounts", created.record.id, created.record.version, mutation(context, { trash: true }));

  assert.equal(trashed.entry.status, "active");
  assert.equal((await store.list(context, "accounts", listQuery())).total, 0);
  assert.equal((await store.listRecycleBin(context, listQuery())).total, 1);
  assert.equal((await store.getRecycleBin(context, trashed.entry.id))?.resourceId, created.record.id);

  const restored = await store.restore("accounts", trashed.entry.id, trashed.entry.version, mutation(context, { restore: true }));
  assert.equal(restored.entry.status, "restored");
  assert.equal((await store.list(context, "accounts", listQuery())).total, 1);
  assert.equal((await store.listRecycleBin(context, listQuery())).total, 0);
  const evidence = store.evidence(context);
  assert.ok(evidence.audits.some((event) => event.action === "accounts.trashed"));
  assert.ok(evidence.audits.some((event) => event.action === "accounts.restored"));
  assert.ok(evidence.outbox.some((event) => event.eventType === "crm.accounts.trashed"));
  assert.ok(evidence.outbox.some((event) => event.eventType === "crm.accounts.restored"));
});

test("trash rejects a stale inventory decision before creating a tombstone", async () => {
  const store = new MemoryCrmV1Store("development");
  const context = access(["crm.accounts.recycle", "crm.accounts.write"]);
  const created = await store.create("accounts", { name: "Cuenta stale", status: "active", type: "organization" }, mutation(context, { create: "stale" }));
  const updated = await store.update("accounts", created.record.id, { name: "Cuenta actualizada" }, created.record.version, mutation(context, { update: "stale" }));
  assert.equal(updated.record.version, 2);
  await assert.rejects(
    store.trash("accounts", created.record.id, created.record.version, mutation(context, { trash: "stale" })),
    hasCode("crm.deletion.deletion_policy_changed")
  );
  assert.equal((await store.listRecycleBin(context, listQuery())).total, 0);
});

test("production revalidates dependencies under the command path", async () => {
  const store = new MemoryCrmV1Store("production");
  const context = access(["crm.accounts.recycle", "crm.accounts.write", "crm.cases.write"]);
  const account = await store.create("accounts", { name: "Cuenta referenciada", status: "active", type: "organization" }, mutation(context, { account: true }));
  await store.create("cases", { accountId: account.record.id, caseType: "service", priority: "normal", status: "new", subject: "Dependencia" }, mutation(context, { case: true }));
  await assert.rejects(
    store.trash("accounts", account.record.id, account.record.version, mutation(context, { trash: true })),
    hasCode("crm.deletion.master_has_transactions")
  );
});

function listQuery() {
  return { cursor: null, direction: "asc" as const, filters: {}, limit: 25, q: null, sort: "createdAt" };
}

function hasCode(code: string) {
  return (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
