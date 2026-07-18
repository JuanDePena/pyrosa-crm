#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRelativePath = "database/dictionaries/crm-global.genesis-v2607.json";
const sourcePath = resolve(repoRoot, sourceRelativePath);
const seedPath = resolve(repoRoot, "database/dictionaries/pyrosa-democrm-global.owner-v2.json");
const version = "2026.07.18.0";
const checksumScheme = "dictionary-content-v2";
const objectChecksumScheme = "dictionary-object-content-v2";
const sourceSchemaVersion = "pyrosa-crm-shared-global-app-genesis-v1";
const manifestSchemaVersion = "pyrosa-platform-dictionary-owner-candidate-v2";
const typeRank = new Map([
  ["schema", 10], ["extension", 20], ["enum", 30], ["type", 40],
  ["domain", 45], ["table", 50], ["sequence", 60], ["column", 70],
  ["constraint", 80], ["index", 90], ["view", 100],
  ["materialized_view", 110], ["trigger", 120], ["function", 130],
  ["policy", 140], ["seed", 150]
]);
const bindings = Object.freeze([
  {
    appSlug: "pyrosa-democrm",
    dictionarySlug: "pyrosa-democrm-global",
    logicalSchema: "pyrosa_democrm",
    path: "database/dictionaries/pyrosa-democrm-global.owner-v2.json"
  },
  {
    appSlug: "pyrosa-crm",
    dictionarySlug: "pyrosa-crm-global-app",
    logicalSchema: "pyrosa_crm",
    path: "database/dictionaries/pyrosa-crm-global-app.owner-v2.json"
  }
]);

const options = new Set(process.argv.slice(2));
const checkOnly = options.has("--check");
if (options.has("--bootstrap-source")) {
  if (checkOnly) throw new Error("--bootstrap-source and --check are mutually exclusive");
  await bootstrapLogicalSource();
}

const sourceRaw = await readFile(sourcePath, "utf8");
const source = JSON.parse(sourceRaw);
validateLogicalSource(source);
const outputs = bindings.map((binding) => {
  const manifest = buildOwnerManifest(source, binding);
  return {
    binding,
    content: serialize(manifest),
    path: resolve(repoRoot, binding.path)
  };
});

if (checkOnly) {
  for (const output of outputs) await assertCurrent(output.path, output.content);
  process.stdout.write(`CRM global genesis owners are current (${outputs.length} manifests, ${source.objectCount} objects each).\n`);
} else {
  for (const output of outputs) await writeFile(output.path, output.content, "utf8");
  process.stdout.write(`Generated ${outputs.length} CRM global owner manifests from ${sourceRelativePath}.\n`);
}

async function bootstrapLogicalSource() {
  const seed = JSON.parse(await readFile(seedPath, "utf8"));
  if (seed.appSlug !== "pyrosa-democrm" || seed.scopeType !== "global-app") {
    throw new Error("CRM global seed manifest is invalid");
  }
  const objects = seed.objects.map((object) => ({
    definition: stripPhysicalEvidence(object.definition),
    objectName: object.objectType === "schema" ? "global_app" : object.objectName,
    objectType: object.objectType,
    parentObjectName: object.parentObjectName ?? null
  })).sort(compareObjects);
  const logicalSource = {
    schemaVersion: sourceSchemaVersion,
    version,
    productFamily: "pyrosa-crm-v2607",
    scopeType: "global-app",
    artifactKind: "desired-state",
    applyOwner: "pyrosa-platform",
    runtimeDdlAllowed: false,
    schemaObjectName: "global_app",
    objectCount: objects.length,
    objects
  };
  validateLogicalSource(logicalSource);
  await writeFile(sourcePath, serialize(logicalSource), "utf8");
}

function buildOwnerManifest(sourceValue, binding) {
  const objects = sourceValue.objects.map((object) => {
    const materialized = {
      ...object,
      objectName: object.objectType === "schema" ? binding.logicalSchema : object.objectName
    };
    return { ...materialized, objectChecksum: objectChecksum(materialized) };
  }).sort(compareObjects);
  const checksum = dictionaryChecksum({
    appSlug: binding.appSlug,
    artifactKind: sourceValue.artifactKind,
    dictionarySlug: binding.dictionarySlug,
    objects,
    productFamily: sourceValue.productFamily,
    scopeType: sourceValue.scopeType,
    version: sourceValue.version
  });
  return {
    appSlug: binding.appSlug,
    artifactKind: sourceValue.artifactKind,
    checksum,
    checksumScheme,
    dictionarySlug: binding.dictionarySlug,
    key: `${binding.appSlug}:${binding.dictionarySlug}@${sourceValue.version}#${sourceValue.scopeType}`,
    objectCount: objects.length,
    objects,
    owner: binding.appSlug,
    ownerDecisions: [],
    predecessors: [],
    productFamily: sourceValue.productFamily,
    release: { checksum, checksumScheme, version: sourceValue.version },
    schemaVersion: manifestSchemaVersion,
    scopeType: sourceValue.scopeType,
    version: sourceValue.version
  };
}

function validateLogicalSource(sourceValue) {
  if (sourceValue.schemaVersion !== sourceSchemaVersion || sourceValue.version !== version) {
    throw new Error("CRM global logical source identity/version mismatch");
  }
  if (sourceValue.productFamily !== "pyrosa-crm-v2607"
      || sourceValue.scopeType !== "global-app"
      || sourceValue.artifactKind !== "desired-state") {
    throw new Error("CRM global logical source scope/artifact mismatch");
  }
  if (sourceValue.applyOwner !== "pyrosa-platform" || sourceValue.runtimeDdlAllowed !== false) {
    throw new Error("CRM global logical source must preserve Platform-only DDL ownership");
  }
  if (sourceValue.schemaObjectName !== "global_app"
      || !Array.isArray(sourceValue.objects)
      || sourceValue.objectCount !== sourceValue.objects.length
      || sourceValue.objects.length !== 90) {
    throw new Error("CRM global logical source must contain the complete 90-object contract");
  }
  const identities = new Set();
  const schemas = [];
  for (const object of sourceValue.objects) {
    if (!typeRank.has(object.objectType)) throw new Error(`unsupported object type ${object.objectType}`);
    const identity = `${object.objectType}:${object.parentObjectName ?? ""}:${object.objectName}`;
    if (identities.has(identity)) throw new Error(`duplicate object identity ${identity}`);
    identities.add(identity);
    if (object.objectType === "schema") schemas.push(object.objectName);
    assertTargetNeutral(object, identity);
  }
  if (schemas.length !== 1 || schemas[0] !== sourceValue.schemaObjectName) {
    throw new Error("CRM global logical source must declare exactly global_app");
  }
}

function assertTargetNeutral(value, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertTargetNeutral(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "definitionHash") throw new Error(`${path} contains physical definitionHash evidence`);
      if (["target", "targetSchema", "tenantKey", "schemaTemplate", "databaseName"].includes(key)) {
        throw new Error(`${path} contains physical target field ${key}`);
      }
      assertTargetNeutral(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (/\bpublic\b/i.test(value)) throw new Error(`${path} references forbidden public schema`);
  if (/\bapp_pyrosa_(?:demo)?crm\b/i.test(value)) throw new Error(`${path} pins a physical database`);
  if (/\bpyrosa_(?:demo)?crm(?:_[0-9a-f]{12})?\b/i.test(value) && value !== "global_app") {
    throw new Error(`${path} pins an app-specific schema`);
  }
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
  return sha256(stableJson({
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
