import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { dirname, resolve } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { CrmSession } from "./auth.js";
import { CrmV1Error } from "./crmV1Domain.js";
import type { CrmAccessContext } from "./crmV1Types.js";
import {
  TENANT_CONTEXT_SWITCH_REQUEST_SCHEMA,
  assertBoundBrowserTenantContext,
  composeInteractiveTenantContext,
  createInitialTenantState,
  createTenantWorkContext,
  deriveContextVersion,
  loadCrmTenantSession,
  normalizeOptions,
  parseTenantContextSwitchRequest,
  resetCrmTenantSessionsForTests,
  saveCrmTenantSession,
  switchPayloadHash,
  tenantNamespace
} from "./tenantContext.js";

const seal = "tenant-context-test-secret-at-least-32-bytes";
const tenantKey = "8ef427da9f0e";
const contractRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../contracts/tenant-context/v1"
);

beforeEach(() => resetCrmTenantSessionsForTests());

test("browser authority is the server session plus exact contextVersion, never tenant headers", () => {
  const session = crmSession();
  const access = crmAccess();
  const version = deriveContextVersion(
    seal,
    session.sid,
    tenantKey,
    "bootstrap",
    "nonce"
  );
  const state = createInitialTenantState(session, seal, [
    {
      tenantId: access.tenantId,
      tenantKey,
      label: access.displayName,
      status: "ready",
      reason: null
    }
  ]);
  state.interactive = composeInteractiveTenantContext({
    session,
    access: { ...access, contextVersion: version },
    contextVersion: version
  });
  saveCrmTenantSession(session, state);

  const bound = assertBoundBrowserTenantContext(
    request({
      "x-pyrosa-tenant-context-version": version,
      "x-pyrosa-tenant-id": "attacker-controlled"
    }),
    session,
    loadCrmTenantSession(session)!
  );
  assert.equal(bound.tenantId, access.tenantId);
  assert.equal(bound.tenantKey, tenantKey);

  assert.throws(
    () =>
      assertBoundBrowserTenantContext(
        request({ "x-pyrosa-tenant-id": access.tenantId }),
        session,
        state
      ),
    hasCode("crm.tenant_context.header_required")
  );
});

test("switch contract is exact, idempotency-bound and rejects unknown fields", () => {
  const requestBody = {
    schemaVersion: TENANT_CONTEXT_SWITCH_REQUEST_SCHEMA,
    idempotencyKey: "switch-request-0001",
    tenantKey,
    expectedContextVersion: `ctxv1.${"a".repeat(43)}`
  };
  assert.deepEqual(parseTenantContextSwitchRequest(requestBody), requestBody);
  assert.equal(
    switchPayloadHash(requestBody),
    switchPayloadHash({ ...requestBody })
  );
  assert.notEqual(
    switchPayloadHash(requestBody),
    switchPayloadHash({
      ...requestBody,
      tenantKey: "62645c2f125c"
    })
  );
  assert.throws(
    () => parseTenantContextSwitchRequest({ ...requestBody, tenantId: "evil" }),
    hasCode("crm.tenant_context.request_invalid")
  );
});

test("options, async work and external namespaces preserve the tenant boundary", () => {
  const access = crmAccess();
  const options = normalizeOptions([
    {
      tenantId: "tenant-b",
      tenantKey: "62645c2f125c",
      label: "Beta",
      status: "ready",
      reason: null
    },
    {
      tenantId: access.tenantId,
      tenantKey,
      label: "Alpha",
      status: "ready",
      reason: null
    }
  ]);
  assert.deepEqual(options.map((option) => option.label), ["Alpha", "Beta"]);
  assert.throws(
    () => normalizeOptions([options[0], options[0]]),
    hasCode("crm.tenant_context.option_duplicate")
  );

  const work = createTenantWorkContext({
    access,
    operation: "crm.job.export",
    correlationId: "correlation-tenant-test",
    idempotencyKey: "idempotency-tenant-test"
  });
  assert.equal(work.tenantKey, tenantKey);
  assert.equal(work.decisionReference, access.authorizationDecisionId);
  assert.equal(work.placementFingerprint, access.physicalFingerprint);
  assert.equal("contextVersion" in work, false);
  assert.equal("authorizationDecisionReference" in work, false);
  assert.equal(
    tenantNamespace(access, "file", "export/report.csv"),
    "pyrosa-democrm:8ef427da9f0e:file:export/report.csv"
  );
});

test("TenantWorkContext implementation matches the canonical schema and fixture", async () => {
  const [schemaBytes, fixtureBytes] = await Promise.all([
    readFile(resolve(contractRoot, "tenant-work-context.schema.json"), "utf8"),
    readFile(resolve(contractRoot, "conformance-fixtures.json"), "utf8")
  ]);
  const schema = JSON.parse(schemaBytes) as ObjectJsonSchema;
  const fixture = JSON.parse(fixtureBytes) as {
    workContext: { valid: Record<string, unknown> };
  };
  const canonical = fixture.workContext.valid;
  const access = {
    ...crmAccess(),
    tenantId: String(canonical.tenantId),
    tenantKey: String(canonical.tenantKey),
    authorizationDecisionId: String(canonical.decisionReference),
    physicalFingerprint: String(canonical.placementFingerprint)
  };
  const work = createTenantWorkContext({
    access,
    operation: String(canonical.operation),
    correlationId: String(canonical.correlationId),
    idempotencyKey: String(canonical.idempotencyKey),
    now: new Date(String(canonical.enqueuedAt))
  });

  assert.deepEqual(work, {
    ...canonical,
    application: "pyrosa-democrm",
    enqueuedAt: new Date(String(canonical.enqueuedAt)).toISOString()
  });
  assertMatchesObjectSchema(work, schema);
  assert.throws(
    () =>
      assertMatchesObjectSchema(
        { ...work, contextVersion: access.contextVersion },
        schema
      ),
    /unexpected properties: contextVersion/u
  );
  assert.throws(
    () =>
      assertMatchesObjectSchema(
        {
          ...work,
          authorizationDecisionReference: work.decisionReference
        },
        schema
      ),
    /unexpected properties: authorizationDecisionReference/u
  );
});

function crmSession(): CrmSession {
  return {
    sid: "session_tenant_context_0000000000001",
    user: {
      id: 1,
      email: "it@pyrosa.com.do",
      displayName: "IT",
      role: "superadmin",
      locale: "es",
      timezone: "America/Santo_Domingo",
      status: "active",
      primaryEmail: {
        email: "it@pyrosa.com.do",
        verifiedAt: "2026-07-27T00:00:00.000Z",
        isVerified: true
      },
      security: {
        mfaRequired: true,
        activeMfaMethods: 2
      }
    },
    iamIdentity: {
      issuer: "https://iam.pyrosa.com.do",
      subject: "3"
    },
    csrf: "csrf-token-at-least-32-characters-long",
    uiAuthSessionId: "ui-auth-session-0001",
    uiAuthParentSessionId: null,
    uiAuthAuthenticatedAt: "2026-07-27T00:00:00.000Z",
    uiAuthLastCheckedAt: "2026-07-27T00:00:00.000Z",
    expiresAt: "2099-07-27T00:00:00.000Z"
  };
}

function crmAccess(): CrmAccessContext {
  return {
    tenantId: "tenant-alpha",
    tenantKey,
    displayName: "Alpha",
    schemaName: `pyrosa_democrm_${tenantKey}`,
    dictionaryVersion: "2026.07.27.0",
    profileKey: "core",
    profileVersion: "1",
    timezone: "America/Santo_Domingo",
    locale: "es-DO",
    capabilities: ["crm.dashboard.read"],
    authorizationDecisionId: "decision-application-alpha",
    physicalFingerprint: `sha256:${"a".repeat(64)}`,
    contextVersion: `ctxv1.${"b".repeat(43)}`,
    decisionReferences: {
      directory: "decision-directory-alpha",
      store: "decision-store-alpha",
      platform: "decision-platform-alpha"
    }
  };
}

function request(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof CrmV1Error && error.code === code;
}

type JsonSchemaProperty = {
  const?: string;
  type?: "string";
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  format?: "date-time";
};

type ObjectJsonSchema = {
  type: "object";
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, JsonSchemaProperty>;
};

function assertMatchesObjectSchema(
  value: Record<string, unknown>,
  schema: ObjectJsonSchema
): void {
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);

  const actualKeys = Object.keys(value);
  const unexpected = actualKeys.filter(
    (key) => !Object.hasOwn(schema.properties, key)
  );
  assert.deepEqual(unexpected, [], `unexpected properties: ${unexpected.join(", ")}`);
  for (const required of schema.required) {
    assert.equal(
      Object.hasOwn(value, required),
      true,
      `missing required property: ${required}`
    );
  }

  for (const [property, definition] of Object.entries(schema.properties)) {
    if (!Object.hasOwn(value, property)) continue;
    const current = value[property];
    if (definition.const !== undefined) {
      assert.equal(current, definition.const, `${property} does not match const`);
    }
    if (definition.type === "string") {
      assert.equal(typeof current, "string", `${property} is not a string`);
      const text = current as string;
      if (definition.minLength !== undefined) {
        assert.ok(
          text.length >= definition.minLength,
          `${property} is shorter than minLength`
        );
      }
      if (definition.maxLength !== undefined) {
        assert.ok(
          text.length <= definition.maxLength,
          `${property} is longer than maxLength`
        );
      }
      if (definition.pattern !== undefined) {
        assert.match(text, new RegExp(definition.pattern, "u"), property);
      }
      if (definition.format === "date-time") {
        assert.equal(
          Number.isNaN(Date.parse(text)),
          false,
          `${property} is not date-time`
        );
      }
    }
  }
}
