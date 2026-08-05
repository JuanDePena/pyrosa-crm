import assert from "node:assert/strict";
import test from "node:test";

import type { CrmSession } from "./auth.js";
import type { CrmAccessContext } from "./crmV1Types.js";
import {
  assertTenantContextGenerationStable,
  composeInteractiveTenantContext
} from "./tenantContext.js";

const generation = `ctxgen:sha256:${"a".repeat(64)}`;

test("DemoCRM stores Directory generation and rejects a late mismatched decision", () => {
  const session = {
    sid: "session_tenant_generation_00000000001",
    iamIdentity: { issuer: "https://iam.pyrosa.com.do", subject: "subject" },
    expiresAt: "2099-08-05T00:00:00.000Z"
  } as CrmSession;
  const access = {
    tenantId: "tenant-generation",
    tenantKey: "0123456789ab",
    schemaName: "pyrosa_democrm_0123456789ab",
    physicalFingerprint: `sha256:${"b".repeat(64)}`,
    dictionaryVersion: "2026.08.05.0",
    contextGeneration: generation,
    ownerDecisions: Object.fromEntries(
      ["iam", "directory", "store", "platform", "application"].map((owner) => [
        owner,
        { reference: `${owner}-decision`, version: `${owner}-version`, expiresAt: "2099-08-05T00:00:00.000Z" }
      ])
    )
  } as unknown as CrmAccessContext;
  const context = composeInteractiveTenantContext({
    session,
    access,
    contextVersion: "context-version-generation-0001",
    requireContextGeneration: true,
    now: new Date("2026-08-05T12:00:00.000Z")
  });
  assert.equal(context.contextGeneration, generation);
  assert.doesNotThrow(() => assertTenantContextGenerationStable(context, access, true));
  assert.throws(
    () => assertTenantContextGenerationStable(
      context,
      { ...access, contextGeneration: `ctxgen:sha256:${"c".repeat(64)}` },
      true
    ),
    { code: "crm.tenant_context.stale" }
  );
});

test("DemoCRM fails closed when generation is required but absent", () => {
  const session = {
    sid: "session_tenant_generation_00000000002",
    iamIdentity: { issuer: "https://iam.pyrosa.com.do", subject: "subject" },
    expiresAt: "2099-08-05T00:00:00.000Z"
  } as CrmSession;
  const access = {
    tenantId: "tenant-generation",
    tenantKey: "0123456789ab",
    schemaName: "pyrosa_democrm_0123456789ab",
    physicalFingerprint: `sha256:${"b".repeat(64)}`,
    dictionaryVersion: "2026.08.05.0",
    ownerDecisions: Object.fromEntries(
      ["iam", "directory", "store", "platform", "application"].map((owner) => [
        owner,
        { reference: `${owner}-decision`, version: `${owner}-version`, expiresAt: "2099-08-05T00:00:00.000Z" }
      ])
    )
  } as unknown as CrmAccessContext;
  assert.throws(() => composeInteractiveTenantContext({
    session,
    access,
    contextVersion: "context-version-generation-0002",
    requireContextGeneration: true,
    now: new Date("2026-08-05T12:00:00.000Z")
  }), { code: "crm.tenant_context.generation_unavailable" });
});
