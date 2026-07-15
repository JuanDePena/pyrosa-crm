import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("v2607 dictionary manifest pins every governed artifact", async () => {
  const manifest = JSON.parse(await readFile(resolve(repoRoot, "database/dictionaries/manifest.v2607.json"), "utf8")) as {
    runtimeDdlAllowed?: unknown;
    lineage?: { physicalBaselineLifecycle?: unknown; postApplyVerification?: { evidenceSha256?: unknown; ready?: unknown; targetCount?: unknown } };
    artifacts?: Array<{ path?: unknown; sha256?: unknown; dictionaryVersion?: unknown; kind?: unknown; purpose?: unknown }>;
  };
  assert.equal(manifest.runtimeDdlAllowed, false);
  assert.equal(manifest.lineage?.physicalBaselineLifecycle, "immutable-pre-apply-migration-base");
  assert.equal(manifest.lineage?.postApplyVerification?.ready, true);
  assert.equal(manifest.lineage?.postApplyVerification?.targetCount, 3);
  assert.match(String(manifest.lineage?.postApplyVerification?.evidenceSha256), /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(manifest.artifacts));
  for (const artifact of manifest.artifacts ?? []) {
    assert.equal(typeof artifact.path, "string");
    assert.match(String(artifact.sha256), /^[a-f0-9]{64}$/);
    const content = await readFile(resolve(repoRoot, String(artifact.path)));
    assert.equal(createHash("sha256").update(content).digest("hex"), artifact.sha256);
    if (artifact.dictionaryVersion !== undefined) {
      const dictionary = JSON.parse(content.toString("utf8")) as { dictionaryVersion?: unknown };
      assert.equal(dictionary.dictionaryVersion, artifact.dictionaryVersion);
    }
    if (artifact.kind === "physical-baseline") {
      assert.equal(artifact.purpose, "immutable-pre-apply-migration-base");
    }
  }
});

test("tenant dictionary denies runtime DDL and declares isolation/audit invariants", async () => {
  const path = resolve(repoRoot, "database/dictionaries/pyrosa-democrm-tenant.v2607.json");
  const dictionary = JSON.parse(await readFile(path, "utf8")) as {
    scope?: unknown;
    bootstrapPolicy?: { runtimeRoleMayApplyDdl?: unknown; executor?: unknown };
    invariants?: unknown[];
    tables?: Array<{ name?: unknown }>;
    existingTableChanges?: Array<{ name?: unknown }>;
  };
  assert.equal(dictionary.scope, "tenant");
  assert.equal(dictionary.bootstrapPolicy?.executor, "pyrosa-platform");
  assert.equal(dictionary.bootstrapPolicy?.runtimeRoleMayApplyDdl, false);
  const names = new Set([
    ...(dictionary.tables ?? []).map((table) => table.name),
    ...(dictionary.existingTableChanges ?? []).map((table) => table.name)
  ]);
  for (const required of ["crm_accounts", "crm_contacts", "crm_cases", "crm_activities", "crm_appointments", "crm_opportunities", "crm_audit_events", "crm_outbox_events", "crm_import_batches"]) {
    assert.ok(names.has(required), `missing ${required}`);
  }
});
