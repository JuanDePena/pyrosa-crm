import assert from "node:assert/strict";
import { test } from "node:test";
import { crmTenantSearchPath } from "./db.js";
import { deletionDependencyExpression, listFilterSql, recordPersistenceFields } from "./crmV1Postgres.js";
import type { CrmAccessContext } from "./crmV1Types.js";

function tenantAccess(tenantKey: string): CrmAccessContext {
  return {
    tenantId: `tenant:${tenantKey}`,
    tenantKey,
    displayName: `Tenant ${tenantKey}`,
    schemaName: `pyrosa_democrm_${tenantKey}`,
    dictionaryVersion: "2026.07.27.0",
    profileKey: "core",
    profileVersion: "1",
    timezone: "America/Santo_Domingo",
    locale: "es-DO",
    capabilities: ["crm.dashboard.read"],
    authorizationDecisionId: `decision:${tenantKey}`,
    physicalFingerprint: `sha256:${"a".repeat(64)}`,
    contextVersion: `ctxv1.${"b".repeat(43)}`,
    decisionReferences: {
      directory: `directory:${tenantKey}`,
      store: `store:${tenantKey}`,
      platform: `platform:${tenantKey}`
    }
  };
}

test("PostgreSQL binds every CRM transaction to an exact tenant-local search_path", () => {
  assert.equal(
    crmTenantSearchPath(tenantAccess("8ef427da9f0e")),
    'pg_catalog,"pyrosa_democrm_8ef427da9f0e","pyrosa_democrm"'
  );
  assert.equal(
    crmTenantSearchPath(tenantAccess("62645c2f125c")),
    'pg_catalog,"pyrosa_democrm_62645c2f125c","pyrosa_democrm"'
  );
  assert.throws(
    () =>
      crmTenantSearchPath({
        ...tenantAccess("8ef427da9f0e"),
        schemaName: "pyrosa_democrm_62645c2f125c"
      }),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "crm.schema.invalid"
      )
  );
});

test("PostgreSQL writes every physical CRM v2607 domain column", () => {
  const cases: Array<{
    input: Record<string, unknown>;
    requiredColumns: string[];
    resource: Parameters<typeof recordPersistenceFields>[0];
  }> = [
    {
      resource: "accounts",
      input: { name: "Cuenta", type: "organization", status: "active" },
      requiredColumns: ["account_type", "external_ref"]
    },
    {
      resource: "contacts",
      input: { displayName: "Contacto", role: "patient", status: "active", sensitive: {} },
      requiredColumns: ["primary_account_id", "contact_role", "sensitive_json"]
    },
    {
      resource: "cases",
      input: { caseType: "coordination", subject: "Caso", priority: "normal", status: "new" },
      requiredColumns: ["account_id", "contact_id", "case_type", "priority", "queue_id", "sla_due_at"]
    },
    {
      resource: "activities",
      input: { type: "call", subject: "Llamada", status: "completed", completedAt: "2026-07-15T12:00:00.000Z" },
      requiredColumns: ["case_id", "account_id", "contact_id", "activity_type", "due_at", "completed_at"]
    },
    {
      resource: "appointments",
      input: { caseId: "case_1", status: "requested", timezone: "America/Santo_Domingo" },
      requiredColumns: ["case_id", "account_id", "contact_id", "resource_id", "start_at", "end_at", "timezone", "external_ref"]
    },
    {
      resource: "opportunities",
      input: { accountId: "account_1", name: "Venta", pipelineId: "default", stageId: "lead", amountMinor: 0, currency: "USD", probability: 0 },
      requiredColumns: ["account_id", "primary_contact_id", "pipeline_id", "stage_id", "amount_minor", "currency", "probability", "close_reason"]
    }
  ];

  for (const fixture of cases) {
    const fields = recordPersistenceFields(fixture.resource, fixture.input);
    assert.deepEqual(fields.map((field) => field.column), fixture.requiredColumns, fixture.resource);
  }

  const sensitive = recordPersistenceFields("contacts", cases[1].input).find((field) => field.column === "sensitive_json");
  assert.equal(sensitive?.cast, "jsonb");
  assert.deepEqual(JSON.parse(String(sensitive?.value)), {});
  assert.equal(
    recordPersistenceFields("activities", cases[3].input).find((field) => field.column === "completed_at")?.value,
    "2026-07-15T12:00:00.000Z"
  );
  assert.throws(
    () => recordPersistenceFields("contacts", { displayName: "Contacto", role: "patient", status: "active", sensitive: { birthDate: "1990-01-01" } }),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "crm.sensitive.persistence_unavailable")
  );
});

test("PostgreSQL list filters use physical columns and one parameter per value", () => {
  assert.deepEqual(listFilterSql("cases", { status: "new", ownerId: "agent_1", priority: "urgent" }), {
    predicates: ["status = $1", "owner_id = $2", "priority = $3"],
    values: ["new", "agent_1", "urgent"]
  });
  assert.deepEqual(listFilterSql("accounts", { tag: "priority" }), {
    predicates: ["record_json->'tags' ? $1"],
    values: ["priority"]
  });
  assert.deepEqual(listFilterSql("cases", { attention: "overdue" }), {
    predicates: ["$1 = 'overdue' AND sla_due_at IS NOT NULL AND sla_due_at < NOW() AND status NOT IN ('resolved','closed','cancelled')"],
    values: ["overdue"]
  });
  assert.deepEqual(listFilterSql("appointments", { attention: "exception" }), {
    predicates: ["$1 = 'exception' AND status IN ('sync_failed','no_show')"],
    values: ["exception"]
  });
  assert.deepEqual(listFilterSql("activities", { attention: "pending" }), {
    predicates: ["$1 = 'pending' AND status IN ('open','in_progress')"],
    values: ["pending"]
  });
});

test("deletion eligibility is projected by one correlated expression per inventory row", () => {
  const accounts = deletionDependencyExpression("accounts");
  assert.match(accounts, /crm_cases/u);
  assert.match(accounts, /crm_activities/u);
  assert.match(accounts, /crm_appointments/u);
  assert.match(accounts, /crm_opportunities/u);
  assert.doesNotMatch(accounts, /archived_at\s+IS\s+NULL/iu);
  assert.equal((accounts.match(/SELECT count\(\*\)/gu) ?? []).length, 4);
  assert.doesNotMatch(accounts, /\$\d+/u);

  const contacts = deletionDependencyExpression("contacts");
  assert.match(contacts, /primary_contact_id/u);
  assert.equal((contacts.match(/SELECT count\(\*\)/gu) ?? []).length, 4);
  assert.equal(deletionDependencyExpression("activities"), "0");
});
