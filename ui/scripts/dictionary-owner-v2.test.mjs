import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expected = [
  {
    "appSlug": "pyrosa-democrm",
    "objectCount": 90,
    "path": "database/dictionaries/pyrosa-democrm-global.owner-v2.json",
    "scopeType": "global-app"
  },
  {
    "appSlug": "pyrosa-democrm",
    "objectCount": 413,
    "path": "database/dictionaries/pyrosa-democrm-tenant-product.owner-v2.json",
    "scopeType": "tenant-product"
  }
];
const checksumScheme = "dictionary-content-v2";
const objectChecksumScheme = "dictionary-object-content-v2";
const versionPattern = /^\d{4}\.\d{2}\.\d{2}\.(?:0|[1-9]\d*)$/;
const checksumPattern = /^sha256:[0-9a-f]{64}$/;
const typeRank = new Map([
  ["schema", 10], ["extension", 20], ["enum", 30], ["type", 40],
  ["domain", 45], ["table", 50], ["sequence", 60], ["column", 70],
  ["constraint", 80], ["index", 90], ["view", 100],
  ["materialized_view", 110], ["trigger", 120], ["function", 130],
  ["policy", 140], ["seed", 150]
]);
test("owner dictionary v2 manifests are canonical and source-pinned", async () => {
  const observedScopes = [];
  for (const item of expected) {
    const manifest = JSON.parse(await readFile(resolve(repoRoot, item.path), "utf8"));
    assert.equal(manifest.schemaVersion, "pyrosa-platform-dictionary-owner-candidate-v2");
    assert.equal(manifest.appSlug, item.appSlug);
    assert.equal(manifest.scopeType, item.scopeType);
    assert.equal(manifest.artifactKind, "desired-state");
    assert.match(manifest.version, versionPattern);
    assert.equal(manifest.version, "2026.07.16.0");
    assert.equal(manifest.checksumScheme, checksumScheme);
    assert.equal(manifest.release.version, manifest.version);
    assert.equal(manifest.release.checksumScheme, checksumScheme);
    assert.equal(manifest.release.checksum, manifest.checksum);
    assert.equal(manifest.objectCount, item.objectCount);
    assert.equal(manifest.objects.length, item.objectCount);
    assert.equal(manifest.key, manifest.appSlug + ":" + manifest.dictionarySlug + "@" + manifest.version + "#" + manifest.scopeType);
    assert.equal(Object.hasOwn(manifest, "target"), false);
    assert.equal(Object.hasOwn(manifest, "targetSchema"), false);
    assert.equal(Object.hasOwn(manifest, "tenantKey"), false);

    const identities = new Set();
    for (const object of manifest.objects) {
      const identity = {
        objectName: object.objectName,
        objectType: object.objectType,
        parentObjectName: object.parentObjectName
      };
      const key = identity.objectType + ":" + (identity.parentObjectName ?? "") + ":" + identity.objectName;
      assert.equal(identities.has(key), false, "duplicate object identity " + key);
      identities.add(key);
      assert.equal(object.objectChecksum, sha256(stableJson({
        checksumScheme: objectChecksumScheme,
        definition: object.definition,
        ...identity
      })));
    }

    const predecessorIds = new Set(manifest.predecessors.map((entry) => entry.sourceId));
    assert.ok(predecessorIds.size > 0);
    for (const predecessor of manifest.predecessors) {
      assert.match(predecessor.checksum, checksumPattern);
      assert.match(predecessor.sourceId, /^[a-z0-9][a-z0-9._:-]{0,199}$/);
      assert.ok(["consolidates", "derived-from-baseline", "supersedes"].includes(predecessor.relation));
      if (predecessor.sourceId.startsWith("owner-file:")) {
        const sourcePath = predecessor.sourceId.slice("owner-file:".length).replaceAll(":", "/");
        const source = await readFile(resolve(repoRoot, sourcePath));
        assert.equal(predecessor.checksum, "sha256:" + createHash("sha256").update(source).digest("hex"));
      }
    }
    for (const decision of manifest.ownerDecisions) {
      assert.equal(decision.owner, manifest.owner);
      assert.ok(predecessorIds.has(decision.selectedSourceId));
      assert.equal(decision.reasonCode, "owner-selected-current-desired-definition");
      const key = decision.identity.objectType + ":" + (decision.identity.parentObjectName ?? "") + ":" + decision.identity.objectName;
      assert.ok(identities.has(key));
    }

    assert.equal(manifest.checksum, dictionaryChecksum(manifest));
    if (manifest.scopeType !== "global-app") {
      const serialized = JSON.stringify(manifest.objects);
      assert.doesNotMatch(serialized, /_[0-9a-f]{12}\b/, "tenant manifest must not pin a concrete tenant schema");
    }
    observedScopes.push(manifest.scopeType);
  }
  assert.deepEqual(observedScopes.sort(), expected.map((item) => item.scopeType).sort());
});

test("checksum v2 retains temporal-looking dictionary semantics", () => {
  const checksumForDefinition = (definition) => dictionaryChecksum({
    appSlug: "pyrosa-test",
    artifactKind: "desired-state",
    dictionarySlug: "pyrosa-test-global",
    objects: [{
      definition,
      objectName: "retention_policy",
      objectType: "table",
      parentObjectName: null
    }],
    productFamily: "test",
    scopeType: "global-app",
    version: "2026.07.16.0"
  });

  assert.notEqual(
    checksumForDefinition({ retentionDate: "2026-08-16" }),
    checksumForDefinition({ retentionDate: "2026-09-16" })
  );
  assert.notEqual(
    checksumForDefinition({ generatedAt: "2026-07-16T12:00:00.000Z" }),
    checksumForDefinition({ generatedAt: "2026-07-17T12:00:00.000Z" })
  );
});

function dictionaryChecksum(manifest) {
  const payload = {
    app: manifest.appSlug,
    artifactKind: manifest.artifactKind,
    checksumScheme,
    dictionary: manifest.dictionarySlug,
    objectCount: manifest.objects.length,
    objects: manifest.objects.map((object) => ({
      definition: object.definition,
      name: object.objectName,
      parent: object.parentObjectName ?? "",
      type: object.objectType,
      version: manifest.version
    })).sort(compareObjects),
    productFamily: manifest.productFamily,
    scopeType: manifest.scopeType,
    version: manifest.version
  };
  return sha256(stableJson(payload));
}

function compareObjects(left, right) {
  return (typeRank.get(left.type) ?? 999) - (typeRank.get(right.type) ?? 999)
    || String(left.parent ?? "").localeCompare(String(right.parent ?? ""))
    || String(left.name ?? "").localeCompare(String(right.name ?? ""))
    || String(left.version ?? "").localeCompare(String(right.version ?? ""));
}

function stableJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => JSON.stringify(key) + ":" + stableJson(entry)).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value) {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}
