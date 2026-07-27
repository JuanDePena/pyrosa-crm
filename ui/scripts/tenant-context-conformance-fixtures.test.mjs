import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const EXPECTED_CHECKSUM = "f9a95d3e704d2cf97b09ba0d0a67d4766b4a8c557f6a71142315e3cbdd2998cc";
const EXPECTED_SWITCH_CASES = [
  ["switch-success", 200, null, false],
  ["switch-replay", 200, null, true],
  ["switch-idempotency-conflict", 409, "tenant_context_idempotency_conflict", false],
  ["switch-stale", 409, "tenant_context_stale", false],
  ["switch-not-eligible", 403, "tenant_context_not_eligible", false],
  ["switch-owner-unavailable", 503, "tenant_context_owner_unavailable", false]
];
const FORBIDDEN_PUBLIC_FIELDS = new Set([
  "accessToken",
  "dsn",
  "ownerResponse",
  "ownerRaw",
  "placement",
  "refreshToken",
  "schema",
  "schemaName",
  "schema_name",
  "sessionId",
  "sql",
  "subject",
  "tenantId",
  "token"
]);
const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../contracts/tenant-context/v1/conformance-fixtures.json"
);

test("tenant context v1 conformance fixtures remain canonical and safe", async () => {
  const bytes = await readFile(fixturePath);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), EXPECTED_CHECKSUM);

  const fixture = JSON.parse(bytes.toString("utf8"));
  assert.equal(fixture.schemaVersion, "pyrosa.tenant-context.conformance-fixtures.v1");
  assert.equal(fixture.interactiveContext?.valid?.schemaVersion, "pyrosa.interactive-tenant-context.v1");
  assert.equal(fixture.workContext?.valid?.schemaVersion, "pyrosa.tenant-work-context.v1");
  assert.deepEqual(
    fixture.switch.map(({ id, expected }) => [id, expected.status, expected.code, expected.replayed]),
    EXPECTED_SWITCH_CASES
  );
  assert.ok(
    fixture.switch.every(
      ({ request }) => request.schemaVersion === "pyrosa.tenant-context.switch.request.v1"
    )
  );

  for (const switchCase of fixture.switch) {
    assertNoForbiddenPublicFields(switchCase, `switch.${switchCase.id}`);
  }
});

function assertNoForbiddenPublicFields(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenPublicFields(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.equal(FORBIDDEN_PUBLIC_FIELDS.has(key), false, `${path}.${key} is forbidden`);
    assertNoForbiddenPublicFields(child, `${path}.${key}`);
  }
}
