#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dictionaryRoot = resolve(repoRoot, "database/dictionaries");
const sourceRelativePath = "database/dictionaries/crm-tenant-product.genesis-v2607.json";
const sourcePath = resolve(repoRoot, sourceRelativePath);
const bundleRelativePath = "database/dictionaries/manifest.genesis-v2607.json";
const bundlePath = resolve(repoRoot, bundleRelativePath);
const seedPath = resolve(dictionaryRoot, "pyrosa-democrm-tenant-product.owner-v2.json");
const version = "2026.07.17.0";
const checksumScheme = "dictionary-content-v2";
const objectChecksumScheme = "dictionary-object-content-v2";
const sourceSchemaVersion = "pyrosa-crm-shared-tenant-product-genesis-v1";
const manifestSchemaVersion = "pyrosa-platform-dictionary-owner-candidate-v2";
const bundleSchemaVersion = "pyrosa-platform-dictionary-genesis-owner-bundle-v1";
const typeRank = new Map([
  ["schema", 10], ["extension", 20], ["enum", 30], ["type", 40],
  ["domain", 45], ["table", 50], ["sequence", 60], ["column", 70],
  ["constraint", 80], ["index", 90], ["view", 100],
  ["materialized_view", 110], ["trigger", 120], ["function", 130],
  ["policy", 140], ["seed", 150]
]);
const bindings = [
  {
    appSlug: "pyrosa-democrm",
    dictionarySlug: "pyrosa-democrm-tenant-product",
    path: "database/dictionaries/pyrosa-democrm-tenant-product.owner-v2.json"
  },
  {
    appSlug: "pyrosa-crm",
    dictionarySlug: "pyrosa-crm-tenant-product",
    path: "database/dictionaries/pyrosa-crm-tenant-product.owner-v2.json"
  }
];

const options = new Set(process.argv.slice(2));
const checkOnly = options.has("--check");
if (options.has("--bootstrap-source")) {
  if (checkOnly) throw new Error("--bootstrap-source and --check are mutually exclusive");
  await bootstrapLogicalSource();
}

const sourceRaw = await readFile(sourcePath, "utf8");
const source = JSON.parse(sourceRaw);
validateLogicalSource(source);

const outputs = [];
for (const binding of bindings) {
  const manifest = buildOwnerManifest(source, binding);
  const content = serialize(manifest);
  outputs.push({
    binding,
    content,
    manifest,
    path: resolve(repoRoot, binding.path),
    sha256: sha256(content)
  });
}

const bundle = {
  schemaVersion: bundleSchemaVersion,
  epoch: 1,
  release: "v2607",
  version,
  ownerRepository: "JuanDePena/pyrosa-crm",
  scopeCoverage: ["tenant-product"],
  publicSchemaPolicy: {
    applicationObjectsAllowed: false,
    fallbackTargetAllowed: false,
    requiredNonExtensionObjectCount: 0
  },
  source: {
    path: sourceRelativePath,
    schemaVersion: sourceSchemaVersion,
    sha256: sha256(sourceRaw)
  },
  manifests: outputs.map(({ binding, manifest, sha256: fileSha256 }) => ({
    appSlug: binding.appSlug,
    dictionarySlug: binding.dictionarySlug,
    objectCount: manifest.objectCount,
    owner: binding.appSlug,
    path: binding.path,
    scopeType: manifest.scopeType,
    sha256: fileSha256,
    version: manifest.version
  }))
};
const bundleContent = serialize(bundle);

if (checkOnly) {
  for (const output of outputs) await assertCurrent(output.path, output.content);
  await assertCurrent(bundlePath, bundleContent);
  process.stdout.write(`CRM genesis owner bundle is current (${outputs.length} manifests, ${source.objectCount} objects each).\n`);
} else {
  for (const output of outputs) await writeFile(output.path, output.content, "utf8");
  await writeFile(bundlePath, bundleContent, "utf8");
  process.stdout.write(`Generated ${bundleRelativePath} and ${outputs.length} owner manifests.\n`);
}

async function bootstrapLogicalSource() {
  const seed = JSON.parse(await readFile(seedPath, "utf8"));
  const objects = seed.objects.map((object) => ({
    definition: stripPhysicalEvidence(object.definition),
    objectName: object.objectName,
    objectType: object.objectType,
    parentObjectName: object.parentObjectName ?? null
  })).sort(compareObjects);
  const source = {
    schemaVersion: sourceSchemaVersion,
    version,
    productFamily: "pyrosa-crm-v2607",
    scopeType: "tenant-product",
    artifactKind: "desired-state",
    applyOwner: "pyrosa-platform",
    runtimeDdlAllowed: false,
    schemaObjectName: "tenant_product",
    objectCount: objects.length,
    objects
  };
  validateLogicalSource(source);
  await writeFile(sourcePath, serialize(source), "utf8");
}

function buildOwnerManifest(source, binding) {
  const objects = source.objects.map((object) => ({
    ...object,
    objectChecksum: objectChecksum(object)
  })).sort(compareObjects);
  const checksum = dictionaryChecksum({
    appSlug: binding.appSlug,
    artifactKind: source.artifactKind,
    dictionarySlug: binding.dictionarySlug,
    objects,
    productFamily: source.productFamily,
    scopeType: source.scopeType,
    version: source.version
  });
  return {
    appSlug: binding.appSlug,
    artifactKind: source.artifactKind,
    checksum,
    checksumScheme,
    dictionarySlug: binding.dictionarySlug,
    key: `${binding.appSlug}:${binding.dictionarySlug}@${source.version}#${source.scopeType}`,
    objectCount: objects.length,
    objects,
    owner: binding.appSlug,
    ownerDecisions: [],
    predecessors: [],
    productFamily: source.productFamily,
    release: {
      checksum,
      checksumScheme,
      version: source.version
    },
    schemaVersion: manifestSchemaVersion,
    scopeType: source.scopeType,
    version: source.version
  };
}

function validateLogicalSource(source) {
  if (source.schemaVersion !== sourceSchemaVersion) throw new Error("logical source schemaVersion mismatch");
  if (source.version !== version) throw new Error("logical source version mismatch");
  if (source.productFamily !== "pyrosa-crm-v2607") throw new Error("logical source productFamily mismatch");
  if (source.scopeType !== "tenant-product" || source.artifactKind !== "desired-state") {
    throw new Error("logical source scope/artifact mismatch");
  }
  if (source.applyOwner !== "pyrosa-platform" || source.runtimeDdlAllowed !== false) {
    throw new Error("logical source must preserve Platform-only DDL ownership");
  }
  if (source.schemaObjectName !== "tenant_product") throw new Error("logical source schema identity mismatch");
  if (!Array.isArray(source.objects) || source.objectCount !== source.objects.length || source.objects.length !== 413) {
    throw new Error("logical source must contain the complete 413-object tenant contract");
  }
  const identities = new Set();
  let schemaCount = 0;
  for (const object of source.objects) {
    if (!typeRank.has(object.objectType)) throw new Error(`unsupported object type ${object.objectType}`);
    const identity = `${object.objectType}:${object.parentObjectName ?? ""}:${object.objectName}`;
    if (identities.has(identity)) throw new Error(`duplicate object identity ${identity}`);
    identities.add(identity);
    if (object.objectType === "schema") {
      schemaCount += 1;
      if (object.objectName !== source.schemaObjectName || object.parentObjectName !== null) {
        throw new Error("tenant source must use the target-neutral tenant_product schema identity");
      }
    }
    assertNoPhysicalTarget(object, identity);
  }
  if (schemaCount !== 1) throw new Error("logical source must declare exactly one schema object");
}

function assertNoPhysicalTarget(value, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPhysicalTarget(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "definitionHash") throw new Error(`${path} contains physical definitionHash evidence`);
      if (["target", "targetSchema", "tenantKey", "schemaTemplate", "databaseName"].includes(key)) {
        throw new Error(`${path} contains physical target field ${key}`);
      }
      assertNoPhysicalTarget(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (/\bpublic\b/i.test(value)) throw new Error(`${path} references forbidden public schema`);
  if (/\bapp_pyrosa_(?:demo)?crm\b/i.test(value)) throw new Error(`${path} pins a physical database`);
  if (/\bpyrosa_(?:demo)?crm_[0-9a-f]{12}\b/i.test(value)) throw new Error(`${path} pins a concrete tenant schema`);
}

function stripPhysicalEvidence(value) {
  if (Array.isArray(value)) return value.map(stripPhysicalEvidence);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "definitionHash")
    .map(([key, entry]) => [key, stripPhysicalEvidence(entry)]));
}

function objectChecksum(object) {
  return sha256(stableJson({
    checksumScheme: objectChecksumScheme,
    definition: object.definition,
    objectName: object.objectName,
    objectType: object.objectType,
    parentObjectName: object.parentObjectName
  }));
}

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
    })).sort(compareChecksumObjects),
    productFamily: manifest.productFamily,
    scopeType: manifest.scopeType,
    version: manifest.version
  };
  return sha256(stableJson(payload));
}

function compareObjects(left, right) {
  return (typeRank.get(left.objectType) ?? 999) - (typeRank.get(right.objectType) ?? 999)
    || String(left.parentObjectName ?? "").localeCompare(String(right.parentObjectName ?? ""))
    || String(left.objectName).localeCompare(String(right.objectName));
}

function compareChecksumObjects(left, right) {
  return (typeRank.get(left.type) ?? 999) - (typeRank.get(right.type) ?? 999)
    || String(left.parent ?? "").localeCompare(String(right.parent ?? ""))
    || String(left.name).localeCompare(String(right.name))
    || String(left.version).localeCompare(String(right.version));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function assertCurrent(path, expected) {
  const actual = await readFile(path, "utf8");
  if (actual !== expected) throw new Error(`${path} is not generated from ${sourceRelativePath}`);
}
