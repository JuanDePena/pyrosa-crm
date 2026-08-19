#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const predecessorVersion = "2026.07.17.0";
const version = "2026.08.19.0";
const checksumScheme = "dictionary-content-v2";
const objectChecksumScheme = "dictionary-object-content-v2";
const baseSourceRelativePath = "database/dictionaries/crm-tenant-product.genesis-v2607.json";
const sourceRelativePath = `database/dictionaries/crm-tenant-product.${version}.json`;
const bundleRelativePath = `database/dictionaries/manifest.${version}.json`;
const expectedBaseSourceSha256 = "42a310d42736b05f4e61eadf798328c8381478e28c8bceaa14ef837be41228ac";
const expectedBaseOwners = {
  "pyrosa-crm": "81da473e2ea4f606fab72ddb9bd0008b74e1a050935818bcc8ae594cbf9982c0",
  "pyrosa-democrm": "8826feadf533948b4aa6d4ff2cee78ccadc2002bd9ce5de708da20ace0b1ea5f"
};
const bindings = [
  { appSlug: "pyrosa-democrm", dictionarySlug: "pyrosa-democrm-tenant-product" },
  { appSlug: "pyrosa-crm", dictionarySlug: "pyrosa-crm-tenant-product" }
];
const typeRank = new Map([
  ["schema", 10], ["extension", 20], ["enum", 30], ["type", 40], ["domain", 45],
  ["table", 50], ["sequence", 60], ["column", 70], ["constraint", 80], ["index", 90],
  ["view", 100], ["materialized_view", 110], ["trigger", 120], ["function", 130], ["policy", 140], ["seed", 150]
]);

const checkOnly = new Set(process.argv.slice(2)).has("--check");
const baseSourceBytes = await readFile(resolve(repoRoot, baseSourceRelativePath));
if (rawSha256(baseSourceBytes) !== expectedBaseSourceSha256) throw new Error("CRM recycle successor base source changed");
const baseSource = JSON.parse(baseSourceBytes);
if (baseSource.version !== predecessorVersion || baseSource.objectCount !== 413 || baseSource.runtimeDdlAllowed !== false) {
  throw new Error("CRM recycle successor requires the exact governed genesis predecessor");
}

const recycleObjects = compileRecycleBinObjects();
const identities = new Set(baseSource.objects.map(identityOf));
for (const object of recycleObjects) {
  if (identities.has(identityOf(object))) throw new Error(`CRM recycle object already exists: ${identityOf(object)}`);
}
const source = {
  ...baseSource,
  schemaVersion: "pyrosa-crm-shared-tenant-product-v2",
  version,
  objectCount: baseSource.objects.length + recycleObjects.length,
  objects: [...baseSource.objects, ...recycleObjects].sort(compareObjects),
  predecessors: [{ relation: "supersedes", sourceId: `logical-source:crm-tenant-product:${predecessorVersion}`, checksum: `sha256:${expectedBaseSourceSha256}` }],
  invariants: [
    "runtime roles remain DDL-free and public is never a fallback",
    "trash preserves the aggregate and records one active tenant-local tombstone",
    "restore consumes the tombstone under optimistic concurrency; permanent purge is absent"
  ]
};
const sourceText = serialize(source);

const outputs = [];
for (const binding of bindings) {
  const baseOwnerRelativePath = `database/dictionaries/${binding.dictionarySlug}.owner-v2.json`;
  const baseOwnerBytes = await readFile(resolve(repoRoot, baseOwnerRelativePath));
  if (rawSha256(baseOwnerBytes) !== expectedBaseOwners[binding.appSlug]) throw new Error(`${binding.appSlug} owner predecessor changed`);
  const baseOwner = JSON.parse(baseOwnerBytes);
  const objects = source.objects.map((object) => ({ ...object, objectChecksum: objectChecksum(object) }));
  const owner = {
    appSlug: binding.appSlug,
    artifactKind: "desired-state",
    checksum: null,
    checksumScheme,
    dictionarySlug: binding.dictionarySlug,
    governedInstallationLane: "migration.execute",
    key: `${binding.appSlug}:${binding.dictionarySlug}@${version}#tenant-product`,
    migrationBaseChecksum: baseOwner.checksum,
    migrationBaseDictionarySlug: baseOwner.dictionarySlug,
    migrationBaseObjectCount: baseOwner.objectCount,
    migrationBaseVersion: baseOwner.version,
    objectCount: objects.length,
    objects,
    owner: binding.appSlug,
    ownerDecisions: [],
    predecessors: [
      { checksum: baseOwner.checksum, relation: "supersedes", sourceId: `owner-manifest:${binding.dictionarySlug}:${predecessorVersion}` },
      { checksum: sha256(sourceText), relation: "consolidates", sourceId: `owner-file:${sourceRelativePath.replaceAll("/", ":")}` }
    ],
    productFamily: source.productFamily,
    release: { checksum: null, checksumScheme, version },
    runtimeDdlAllowed: false,
    schemaVersion: "pyrosa-platform-dictionary-owner-candidate-v2",
    scopeType: "tenant-product",
    version
  };
  owner.checksum = dictionaryChecksum(owner);
  owner.release.checksum = owner.checksum;
  const relativePath = `database/dictionaries/${binding.dictionarySlug}.${version}.owner-v2.json`;
  outputs.push({ binding, content: serialize(owner), owner, relativePath });
}

const bundle = {
  schemaVersion: "pyrosa-platform-dictionary-successor-owner-bundle-v1",
  version,
  predecessorVersion,
  ownerRepository: "JuanDePena/pyrosa-crm",
  scopeCoverage: ["tenant-product"],
  runtimeDdlAllowed: false,
  source: { path: sourceRelativePath, sha256: sha256(sourceText), objectCount: source.objectCount },
  manifests: outputs.map(({ binding, content, owner, relativePath }) => ({
    appSlug: binding.appSlug,
    dictionarySlug: binding.dictionarySlug,
    objectCount: owner.objectCount,
    owner: binding.appSlug,
    path: relativePath,
    scopeType: owner.scopeType,
    sha256: sha256(content),
    version
  }))
};
const bundleText = serialize(bundle);

if (checkOnly) {
  await assertCurrent(resolve(repoRoot, sourceRelativePath), sourceText);
  for (const output of outputs) await assertCurrent(resolve(repoRoot, output.relativePath), output.content);
  await assertCurrent(resolve(repoRoot, bundleRelativePath), bundleText);
  process.stdout.write(`CRM recycle-bin successor is current (${source.objectCount} objects, ${outputs.length} owner manifests).\n`);
} else {
  await writeFile(resolve(repoRoot, sourceRelativePath), sourceText, "utf8");
  for (const output of outputs) await writeFile(resolve(repoRoot, output.relativePath), output.content, "utf8");
  await writeFile(resolve(repoRoot, bundleRelativePath), bundleText, "utf8");
  process.stdout.write(`${JSON.stringify({ version, objectCount: source.objectCount, manifests: outputs.map((entry) => ({ path: entry.relativePath, checksum: entry.owner.checksum })) }, null, 2)}\n`);
}

function compileRecycleBinObjects() {
  const table = "crm_recycle_bin_entries";
  const fields = [
    ["id", "text", false], ["resource_type", "text", false], ["resource_id", "text", false],
    ["resource_label", "text", false], ["resource_class", "text", false], ["previous_status", "text", false],
    ["previous_version", "bigint", false], ["snapshot_json", "jsonb", false], ["dependency_count", "bigint", false, "0"],
    ["policy_reason_code", "text", false], ["trashed_by", "text", false], ["trash_operation_ref", "text", false],
    ["status", "text", false], ["version", "bigint", false, "1"], ["created_at", "timestamp with time zone", false],
    ["updated_at", "timestamp with time zone", false], ["restored_at", "timestamp with time zone", true],
    ["restored_by", "text", true], ["restore_operation_ref", "text", true]
  ];
  const objects = [{
    definition: { fields: fields.map(([name, dataType, nullable, defaultValue]) => clean({ name, dataType, nullable, default: defaultValue })), primaryKey: ["id"], semanticChecks: ["resource_type follows the exact CRM resource allowlist", "snapshot_json is internal and never projected by the API"] },
    objectName: table, objectType: "table", parentObjectName: null
  }];
  for (const [name, dataType, nullable, defaultValue] of fields) {
    objects.push({ definition: clean({ dataType, nullable, default: defaultValue }), objectName: `${table}.${name}`, objectType: "column", parentObjectName: table });
  }
  objects.push(
    { definition: { columns: ["id"], constraintType: "primary-key" }, objectName: `${table}.${table}_pkey`, objectType: "constraint", parentObjectName: table },
    { definition: { constraintType: "check", expression: "resource_class IN ('master','transaction')" }, objectName: `${table}.${table}_resource_class_chk`, objectType: "constraint", parentObjectName: table },
    { definition: { constraintType: "check", expression: "status IN ('active','restored')" }, objectName: `${table}.${table}_status_chk`, objectType: "constraint", parentObjectName: table },
    { definition: { columns: ["id"], unique: true }, objectName: `${table}.${table}_pkey`, objectType: "index", parentObjectName: table },
    { definition: { columns: ["resource_type", "resource_id"], predicate: "status = 'active'", unique: true }, objectName: `${table}.${table}_active_resource_uk`, objectType: "index", parentObjectName: table },
    { definition: { columns: ["status", "created_at"], unique: false }, objectName: `${table}.${table}_inventory_idx`, objectType: "index", parentObjectName: table }
  );
  return objects;
}

function objectChecksum(object) {
  return sha256(stableJson({ checksumScheme: objectChecksumScheme, definition: object.definition, objectName: object.objectName, objectType: object.objectType, parentObjectName: object.parentObjectName }));
}
function dictionaryChecksum(manifest) {
  return sha256(stableJson({
    app: manifest.appSlug, artifactKind: manifest.artifactKind, checksumScheme, dictionary: manifest.dictionarySlug,
    objectCount: manifest.objects.length,
    objects: manifest.objects.map((object) => ({ definition: object.definition, name: object.objectName, parent: object.parentObjectName ?? "", type: object.objectType, version: manifest.version })).sort(compareChecksumObjects),
    productFamily: manifest.productFamily, scopeType: manifest.scopeType, version: manifest.version
  }));
}
function compareObjects(left, right) {
  return (typeRank.get(left.objectType) ?? 999) - (typeRank.get(right.objectType) ?? 999)
    || String(left.parentObjectName ?? "").localeCompare(String(right.parentObjectName ?? ""))
    || String(left.objectName).localeCompare(String(right.objectName));
}
function compareChecksumObjects(left, right) {
  return (typeRank.get(left.type) ?? 999) - (typeRank.get(right.type) ?? 999)
    || String(left.parent ?? "").localeCompare(String(right.parent ?? ""))
    || String(left.name).localeCompare(String(right.name));
}
function identityOf(object) { return `${object.objectType}:${object.parentObjectName ?? ""}:${object.objectName}`; }
function clean(value) { return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function rawSha256(value) { return createHash("sha256").update(value).digest("hex"); }
function sha256(value) { return `sha256:${rawSha256(value)}`; }
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
async function assertCurrent(path, expected) { if (await readFile(path, "utf8") !== expected) throw new Error(`${path} is not current`); }
