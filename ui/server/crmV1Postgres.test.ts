import assert from "node:assert/strict";
import { test } from "node:test";
import { listFilterSql, recordPersistenceFields } from "./crmV1Postgres.js";

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
