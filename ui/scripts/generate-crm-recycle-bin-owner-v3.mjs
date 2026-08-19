#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const compatibilityVersion = "2026.08.19.1";
const successorVersion = "2026.08.19.2";
const checksumScheme = "dictionary-content-v2";
const objectChecksumScheme = "dictionary-object-content-v2";
const auditTable = "crm_audit_events";
const typeRank = new Map([
  ["schema", 10], ["extension", 20], ["enum", 30], ["type", 40], ["domain", 45],
  ["table", 50], ["sequence", 60], ["column", 70], ["constraint", 80], ["index", 90],
  ["view", 100], ["materialized_view", 110], ["trigger", 120], ["function", 130], ["policy", 140], ["seed", 150]
]);
const inputs = Object.freeze({
  bridge: Object.freeze({
    path: "database/dictionaries/pyrosa-democrm-tenant-product.2026.08.18.0.owner-v2.json",
    sha256: "9a231389a7a7946f038b6457cfb950b8268cafe38c8cfaf9c61225d7d2817762"
  }),
  logical: Object.freeze({
    path: "database/dictionaries/crm-tenant-product.2026.08.19.0.json",
    sha256: "28903513446a638d78677a5d086e37336ac15debaa1534cc981f7dece926ca46"
  }),
  owners: Object.freeze({
    "pyrosa-democrm": Object.freeze({
      path: "database/dictionaries/pyrosa-democrm-tenant-product.2026.08.19.0.owner-v2.json",
      sha256: "5e82d4e7aeeb0de2839e7f120e4ed7138427aec41069cc8e96682878ff1b525a"
    }),
    "pyrosa-crm": Object.freeze({
      path: "database/dictionaries/pyrosa-crm-tenant-product.2026.08.19.0.owner-v2.json",
      sha256: "36ea178775260f73ba1df72bd86355ff7993ef2deb6f436b4528e6f604fc089d"
    })
  })
});
const checkOnly = new Set(process.argv.slice(2)).has("--check");

const priorBridge = await readPinnedJson(inputs.bridge);
const priorLogical = await readPinnedJson(inputs.logical);
const priorOwners = Object.fromEntries(await Promise.all(
  Object.entries(inputs.owners).map(async ([appSlug, input]) => [appSlug, await readPinnedJson(input)])
));

assertInputContracts(priorBridge, priorLogical, priorOwners);

const compatibilityObjects = compileCompatibilityObjects(priorBridge.objects)
  .map((object) => ({ ...object, objectChecksum: objectChecksum(object) }));
const compatibility = {
  ...priorBridge,
  checksum: null,
  key: `pyrosa-democrm:pyrosa-democrm-tenant-product@${compatibilityVersion}#tenant-product`,
  migrationBaseChecksum: priorBridge.checksum,
  migrationBaseDictionarySlug: priorBridge.dictionarySlug,
  migrationBaseObjectCount: priorBridge.objectCount,
  migrationBaseVersion: priorBridge.version,
  objects: compatibilityObjects,
  predecessors: [{
    checksum: priorBridge.checksum,
    relation: "supersedes",
    sourceId: `owner-manifest:${priorBridge.dictionarySlug}:${priorBridge.version}`
  }],
  release: { checksum: null, checksumScheme, version: compatibilityVersion },
  version: compatibilityVersion
};
compatibility.checksum = dictionaryChecksum(compatibility);
compatibility.release.checksum = compatibility.checksum;

const logical = {
  ...priorLogical,
  version: successorVersion,
  objects: compileCompatibilityObjects(priorLogical.objects),
  predecessors: [{
    checksum: `sha256:${inputs.logical.sha256}`,
    relation: "supersedes",
    sourceId: `logical-source:crm-tenant-product:${priorLogical.version}`
  }],
  invariants: [
    ...new Set([
      ...(priorLogical.invariants ?? []),
      "crm_audit_events compatibility is column-order neutral across governed legacy cohorts"
    ])
  ]
};
assertCompatibilityObjects(logical.objects, logical.objectCount);
const logicalPath = `database/dictionaries/crm-tenant-product.${successorVersion}.json`;
const logicalText = serialize(logical);

const ownerOutputs = [];
for (const [appSlug, priorOwner] of Object.entries(priorOwners)) {
  const baseOwner = appSlug === "pyrosa-democrm" ? compatibility : priorOwner;
  const objects = compileCompatibilityObjects(priorOwner.objects)
    .map((object) => ({ ...object, objectChecksum: objectChecksum(object) }));
  const owner = {
    ...priorOwner,
    checksum: null,
    key: `${appSlug}:${priorOwner.dictionarySlug}@${successorVersion}#tenant-product`,
    migrationBaseChecksum: baseOwner.checksum,
    migrationBaseDictionarySlug: baseOwner.dictionarySlug,
    migrationBaseObjectCount: baseOwner.objectCount,
    migrationBaseVersion: baseOwner.version,
    objects,
    predecessors: [
      {
        checksum: baseOwner.checksum,
        relation: "supersedes",
        sourceId: `owner-manifest:${baseOwner.dictionarySlug}:${baseOwner.version}`
      },
      {
        checksum: sha256(logicalText),
        relation: "consolidates",
        sourceId: `owner-file:${logicalPath.replaceAll("/", ":")}`
      }
    ],
    release: { checksum: null, checksumScheme, version: successorVersion },
    version: successorVersion
  };
  owner.checksum = dictionaryChecksum(owner);
  owner.release.checksum = owner.checksum;
  assertCompatibilityObjects(owner.objects, owner.objectCount);
  ownerOutputs.push({
    appSlug,
    content: serialize(owner),
    owner,
    path: `database/dictionaries/${owner.dictionarySlug}.${successorVersion}.owner-v2.json`
  });
}

const compatibilityPath = `database/dictionaries/pyrosa-democrm-tenant-product.${compatibilityVersion}.owner-v2.json`;
const compatibilityText = serialize(compatibility);
const bundlePath = `database/dictionaries/manifest.${successorVersion}.json`;
const bundle = {
  schemaVersion: "pyrosa-platform-dictionary-successor-owner-bundle-v2",
  version: successorVersion,
  predecessorVersion: priorLogical.version,
  ownerRepository: "JuanDePena/pyrosa-crm",
  scopeCoverage: ["tenant-product"],
  runtimeDdlAllowed: false,
  source: { path: logicalPath, sha256: sha256(logicalText), objectCount: logical.objectCount },
  compatibilityBridge: {
    appSlug: compatibility.appSlug,
    checksum: compatibility.checksum,
    migrationBaseChecksum: compatibility.migrationBaseChecksum,
    objectCount: compatibility.objectCount,
    path: compatibilityPath,
    version: compatibility.version
  },
  manifests: ownerOutputs.map(({ appSlug, content, owner, path }) => ({
    appSlug,
    dictionarySlug: owner.dictionarySlug,
    objectCount: owner.objectCount,
    owner: appSlug,
    path,
    scopeType: owner.scopeType,
    sha256: sha256(content),
    version: successorVersion
  }))
};
const bundleText = serialize(bundle);

const files = [
  [logicalPath, logicalText],
  [compatibilityPath, compatibilityText],
  ...ownerOutputs.map(({ content, path }) => [path, content]),
  [bundlePath, bundleText]
];
if (checkOnly) {
  for (const [path, content] of files) await assertCurrent(resolve(repoRoot, path), content);
  process.stdout.write(`CRM recycle-bin compatibility successor is current (${compatibilityVersion} -> ${successorVersion}).\n`);
} else {
  for (const [path, content] of files) await writeFile(resolve(repoRoot, path), content, "utf8");
  process.stdout.write(`${JSON.stringify({
    compatibility: { version: compatibilityVersion, checksum: compatibility.checksum },
    successor: {
      version: successorVersion,
      manifests: ownerOutputs.map(({ owner, path }) => ({ appSlug: owner.appSlug, checksum: owner.checksum, path }))
    }
  }, null, 2)}\n`);
}

function compileCompatibilityObjects(objects) {
  return objects.map((object) => {
    if (object.objectType === "table" && object.objectName === auditTable) {
      const { columns: _columns, ...definition } = object.definition;
      return { ...object, definition };
    }
    if (object.objectType === "column" && object.parentObjectName === auditTable) {
      const { ordinalPosition: _ordinalPosition, ...definition } = object.definition;
      return { ...object, definition };
    }
    return structuredClone(object);
  });
}

function assertCompatibilityObjects(objects, objectCount) {
  if (objects.length !== objectCount) throw new Error("CRM compatibility transform changed object cardinality");
  const table = objects.filter((object) => object.objectType === "table" && object.objectName === auditTable);
  const columns = objects.filter((object) => object.objectType === "column" && object.parentObjectName === auditTable);
  if (table.length !== 1 || columns.length !== 16) throw new Error("CRM audit compatibility requires one table and sixteen columns");
  if (Object.hasOwn(table[0].definition, "columns")) throw new Error("CRM audit compatibility table must not pin physical column order");
  if (columns.some((column) => Object.hasOwn(column.definition, "ordinalPosition"))) {
    throw new Error("CRM audit compatibility columns must not pin ordinalPosition");
  }
}

function assertInputContracts(bridge, logicalSource, owners) {
  if (bridge.version !== "2026.08.18.0" || bridge.objectCount !== 413) throw new Error("unexpected CRM compatibility predecessor");
  if (logicalSource.version !== "2026.08.19.0" || logicalSource.objectCount !== 439) throw new Error("unexpected CRM recycle logical predecessor");
  for (const [appSlug, owner] of Object.entries(owners)) {
    if (owner.appSlug !== appSlug || owner.version !== "2026.08.19.0" || owner.objectCount !== 439) {
      throw new Error(`unexpected CRM recycle owner predecessor for ${appSlug}`);
    }
  }
}

async function readPinnedJson(input) {
  const bytes = await readFile(resolve(repoRoot, input.path));
  if (rawSha256(bytes) !== input.sha256) throw new Error(`immutable CRM predecessor changed: ${input.path}`);
  return JSON.parse(bytes);
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

function compareChecksumObjects(left, right) {
  return (typeRank.get(left.type) ?? 999) - (typeRank.get(right.type) ?? 999)
    || String(left.parent ?? "").localeCompare(String(right.parent ?? ""))
    || String(left.name).localeCompare(String(right.name));
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function rawSha256(value) { return createHash("sha256").update(value).digest("hex"); }
function sha256(value) { return `sha256:${rawSha256(value)}`; }
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
async function assertCurrent(path, expected) {
  if (await readFile(path, "utf8") !== expected) throw new Error(`${path} is not current`);
}
