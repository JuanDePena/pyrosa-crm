import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const compatibilityVersion = "2026.08.19.1";
const successorVersion = "2026.08.19.2";

test("CRM compatibility bridge is immutable and neutral to legacy audit column order", async () => {
  const bridge = await readJson(`database/dictionaries/pyrosa-democrm-tenant-product.${compatibilityVersion}.owner-v2.json`);

  assert.equal(bridge.version, compatibilityVersion);
  assert.equal(bridge.objectCount, 413);
  assert.equal(bridge.migrationBaseVersion, "2026.08.18.0");
  assert.equal(bridge.migrationBaseChecksum, "sha256:a1830678b88b511792449b526ffad12f683044fe43b3587d85da716bb2002565");
  assert.equal(bridge.runtimeDdlAllowed, false);
  assert.equal(bridge.release.checksum, bridge.checksum);

  const table = bridge.objects.filter((object) => object.objectType === "table" && object.objectName === "crm_audit_events");
  const columns = bridge.objects.filter((object) => object.objectType === "column" && object.parentObjectName === "crm_audit_events");
  assert.equal(table.length, 1);
  assert.equal(columns.length, 16);
  assert.equal(Object.hasOwn(table[0].definition, "columns"), false);
  assert.equal(columns.some((column) => Object.hasOwn(column.definition, "ordinalPosition")), false);
});

test("CRM recycle successor bases DemoCRM on the corrected compatibility bridge", async () => {
  const bundle = await readJson(`database/dictionaries/manifest.${successorVersion}.json`);
  assert.equal(bundle.schemaVersion, "pyrosa-platform-dictionary-successor-owner-bundle-v2");
  assert.equal(bundle.version, successorVersion);
  assert.equal(bundle.predecessorVersion, "2026.08.19.0");
  assert.equal(bundle.compatibilityBridge.version, compatibilityVersion);
  assert.equal(bundle.compatibilityBridge.checksum, "sha256:87ddbc885d3aab9910832d93be15b15624c0c6160968de56c088957624f15c10");
  assert.deepEqual(bundle.manifests.map((entry) => entry.appSlug), ["pyrosa-democrm", "pyrosa-crm"]);

  for (const entry of bundle.manifests) {
    const raw = await readFile(resolve(repoRoot, entry.path));
    const owner = JSON.parse(raw);
    assert.equal(entry.sha256, `sha256:${createHash("sha256").update(raw).digest("hex")}`);
    assert.equal(owner.version, successorVersion);
    assert.equal(owner.objectCount, 439);
    assert.equal(owner.objects.length, 439);
    assert.equal(owner.runtimeDdlAllowed, false);
    assert.equal(owner.release.checksum, owner.checksum);
    assert.equal(owner.migrationBaseVersion,
      entry.appSlug === "pyrosa-democrm" ? compatibilityVersion : "2026.08.19.0");
    const table = owner.objects.find((object) => object.objectType === "table" && object.objectName === "crm_audit_events");
    const columns = owner.objects.filter((object) => object.objectType === "column" && object.parentObjectName === "crm_audit_events");
    assert.ok(table);
    assert.equal(columns.length, 16);
    assert.equal(Object.hasOwn(table.definition, "columns"), false);
    assert.equal(columns.some((column) => Object.hasOwn(column.definition, "ordinalPosition")), false);
  }
});

async function readJson(path) {
  return JSON.parse(await readFile(resolve(repoRoot, path), "utf8"));
}
