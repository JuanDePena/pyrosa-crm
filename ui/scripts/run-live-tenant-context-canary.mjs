#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { loadConfig } from "../build/server/config.js";
import { resolveCrmAccess } from "../build/server/crmV1Access.js";
import {
  closePostgres,
  crmTenantSearchPath,
  getPool
} from "../build/server/db.js";

const args = parseArgs(process.argv.slice(2));
if (args.execute !== true) {
  fail("crm_canary_execute_required");
}
if (String(process.env.APP_ENV ?? "").trim() !== "development") {
  fail("crm_canary_development_required");
}

const tenantA = requiredTenant(args, "tenant-a");
const tenantB = requiredTenant(args, "tenant-b");
if (tenantA.id === tenantB.id || tenantA.key === tenantB.key) {
  fail("crm_canary_distinct_tenants_required");
}
const subject = requiredOpaque(args.subject, "subject");
const config = loadConfig();
const identity = {
  kind: "browser",
  issuer: config.iamBaseUrl,
  subject,
  principalType: "human",
  clientId: null,
  roles: ["superadmin"],
  scopes: []
};
const startedAt = new Date();
const accesses = [];
for (const [index, tenant] of [tenantA, tenantB, tenantA].entries()) {
  const requestId = `crm-live-context-canary-${index + 1}-${randomUUID()}`;
  const access = await resolveCrmAccess(
    {
      correlationId: requestId,
      requestId,
      startedAt: process.hrtime.bigint(),
      url: new URL("http://localhost/internal/canary"),
      headOnly: false
    },
    config,
    identity,
    "crm.dashboard.read",
    tenant.id
  );
  if (access.tenantKey !== tenant.key) {
    fail("crm_canary_owner_tenant_mismatch");
  }
  accesses.push(access);
}

const sentinelA = randomUUID();
const sentinelB = randomUUID();
const client = await getPool(config).connect();
let rollbackVerified = false;
try {
  await client.query("BEGIN");
  await bind(client, accesses[0]);
  await insertSentinel(client, sentinelA, "A");

  await bind(client, accesses[1]);
  assertVisibility(await visibleSentinels(client, [sentinelA, sentinelB]), []);
  await insertSentinel(client, sentinelB, "B");
  assertVisibility(
    await visibleSentinels(client, [sentinelA, sentinelB]),
    [sentinelB]
  );

  await bind(client, accesses[2]);
  assertVisibility(
    await visibleSentinels(client, [sentinelA, sentinelB]),
    [sentinelA]
  );
  await client.query("ROLLBACK");

  await client.query("BEGIN");
  await bind(client, accesses[0]);
  assertVisibility(await visibleSentinels(client, [sentinelA, sentinelB]), []);
  await bind(client, accesses[1]);
  assertVisibility(await visibleSentinels(client, [sentinelA, sentinelB]), []);
  await client.query("ROLLBACK");
  rollbackVerified = true;
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original canary failure.
  }
  throw error;
} finally {
  client.release();
  await closePostgres();
}

const result = {
  schemaVersion: "pyrosa.crm.live-tenant-context-canary.v1",
  status: rollbackVerified ? "accepted" : "rejected",
  environment: "development",
  application: "pyrosa-democrm",
  executedAt: new Date().toISOString(),
  durationMs: Date.now() - startedAt.valueOf(),
  subjectHash: sha256(subject),
  route: accesses.map((access, index) => ({
    step: ["A", "B", "A"][index],
    tenantId: access.tenantId,
    tenantKey: access.tenantKey,
    schemaName: access.schemaName,
    dictionaryVersion: access.dictionaryVersion,
    placementFingerprint: access.physicalFingerprint,
    decisionReferencesHash: sha256(
      JSON.stringify(access.decisionReferences)
    )
  })),
  assertions: {
    samePoolSession: true,
    tenantAInvisibleFromTenantB: true,
    tenantBInvisibleFromTenantA: true,
    rollbackVerified
  }
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

async function bind(client, access) {
  const searchPath = crmTenantSearchPath(access);
  await client.query("SELECT set_config('search_path', $1, true)", [
    searchPath
  ]);
  const observed = await client.query(
    "SELECT current_setting('search_path') AS search_path"
  );
  if (observed.rows[0]?.search_path !== searchPath) {
    fail("crm_canary_search_path_binding_failed");
  }
}

async function insertSentinel(client, id, label) {
  await client.query(
    `
      INSERT INTO crm_accounts (
        id, status, owner_id, search_text, record_json, version,
        created_at, updated_at, archived_at, account_type, external_ref
      )
      VALUES (
        $1, 'active', NULL, $2, $3::jsonb, 1,
        NOW(), NOW(), NULL, 'tenant-context-canary', NULL
      )
    `,
    [id, `tenant-context-canary-${label}`, JSON.stringify({ canary: label })]
  );
}

async function visibleSentinels(client, ids) {
  const result = await client.query(
    `
      SELECT id::text
      FROM crm_accounts
      WHERE id = ANY($1::uuid[])
      ORDER BY id
    `,
    [ids]
  );
  return result.rows.map((row) => String(row.id)).sort();
}

function assertVisibility(actual, expected) {
  const normalized = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(normalized)) {
    fail("crm_canary_cross_tenant_visibility_detected");
  }
}

function requiredTenant(values, prefix) {
  const id = requiredOpaque(values[`${prefix}-id`], `${prefix}-id`);
  const key = String(values[`${prefix}-key`] ?? "").trim();
  if (!/^[a-f0-9]{12}$/u.test(key)) {
    fail(`crm_canary_${prefix}_key_invalid`);
  }
  return { id, key };
}

function requiredOpaque(value, field) {
  const normalized = String(value ?? "").trim();
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/u.test(normalized)
  ) {
    fail(`crm_canary_${field}_invalid`);
  }
  return normalized;
}

function parseArgs(argv) {
  const values = { execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--execute") {
      values.execute = true;
      continue;
    }
    if (!token?.startsWith("--")) {
      fail("crm_canary_argument_invalid");
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`crm_canary_${key}_missing`);
    }
    values[key] = value;
    index += 1;
  }
  return values;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
