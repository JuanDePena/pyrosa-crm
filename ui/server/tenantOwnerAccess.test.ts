import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { afterEach, test } from "node:test";
import { loadConfig, type CrmServerConfig } from "./config.js";
import { createRequestContext } from "./http.js";
import {
  loadTenantCatalogPage,
  resetTenantOwnerAccessForTests,
  resolveInteractiveCrmAccess
} from "./tenantOwnerAccess.js";
import type { CrmIdentity } from "./crmV1Types.js";

const originalFetch = globalThis.fetch;
const tenantKey = "8ef427da9f0e";
const tenantId = "tenant-alpha";
const identity: CrmIdentity = {
  kind: "browser",
  issuer: "https://iam.pyrosa.test",
  subject: "subject-alpha",
  principalType: "human",
  clientId: null,
  roles: [],
  scopes: []
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetTenantOwnerAccessForTests();
});

test("catalog page is lazy, paginated and cached without owner decision fan-out", async () => {
  const observed: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    observed.push(url.pathname);
    if (url.pathname === "/oauth/token") {
      return tokenResponse(
        basicClientId(init),
        "directory:tenant-access-catalog:read"
      );
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.deepEqual(body.selection, {
      mode: "page",
      query: "alpha",
      cursor: null,
      limit: 12
    });
    return json(catalogResponse(body));
  };
  const context = requestContext();
  const configured = config();
  const first = await loadTenantCatalogPage(context, configured, identity, {
    query: "alpha",
    limit: 12
  });
  const second = await loadTenantCatalogPage(context, configured, identity, {
    query: "alpha",
    limit: 12
  });

  assert.equal(first.cache, "miss");
  assert.equal(second.cache, "fresh");
  assert.deepEqual(observed, [
    "/oauth/token",
    "/internal/directory/v1/tenant-access-catalog"
  ]);
  assert.equal(first.options[0]?.tenantKey, tenantKey);
});

test("interactive access composes IAM, Directory v2, Store and Platform with real expiries", async () => {
  const ownerCalls: string[] = [];
  const tokenCalls: Array<{ clientId: string; scope: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      const clientId = basicClientId(init);
      const scope = new URLSearchParams(String(init?.body)).get("scope") ?? "";
      tokenCalls.push({ clientId, scope });
      return tokenResponse(clientId, scope);
    }
    ownerCalls.push(url.pathname);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (url.pathname === "/api/iam/policy/decisions") {
      return json({
        allowed: true,
        cacheScope: "subject",
        bindingVersion: 7,
        capability: "crm.dashboard.read",
        decidedAt: "2026-07-30T00:00:00.000Z",
        decisionId: "iam-decision-alpha",
        expiresAt: "2099-07-30T00:00:30.000Z",
        policyVersion: "pyrosa.standard-tenant@4",
        reasonCode: "allowed",
        subject: body.iam_subject,
        tenantKey
      });
    }
    if (url.pathname.endsWith("/application-access-decision")) {
      return json({
        allowed: true,
        application_projected: true,
        cache_scope: "subject",
        application_slug: "pyrosa-democrm",
        authority: "pyrosa-directory",
        contract_version: "2.0.0",
        correlation_id: body.correlation_id,
        decision_reference: `dirdec:${"a".repeat(64)}`,
        decision_version: `sha256:${"b".repeat(64)}`,
        expires_at: "2099-07-30T00:00:40.000Z",
        membership_active: true,
        observed_at: "2026-07-30T00:00:00.000Z",
        projection_max_staleness_seconds: 300,
        projection_synced_at: "2026-07-30T00:00:00.000Z",
        reasons: [],
        request_id: body.request_id,
        requires_named_seat: true,
        seat_active: true,
        tenant_id: tenantId,
        tenant_key: tenantKey
      });
    }
    if (url.pathname.endsWith("/crm-access-decision")) {
      return json({
        contract_version: "1.0.0",
        request_id: body.request_id,
        correlation_id: body.correlation_id,
        tenant_id: tenantId,
        tenant_key: tenantKey,
        application_slug: "pyrosa-democrm",
        allowed: false,
        membership_active: false,
        seat_active: false,
        authorization_decision_id: "directory-v1-shadow-denied"
      });
    }
    if (url.pathname.endsWith("/entitlement-decision")) {
      return json({
        contract_version: "1.0.0",
        cache_scope: "tenant",
        request_id: body.request_id,
        correlation_id: body.correlation_id,
        tenant_id: tenantId,
        application_slug: "pyrosa-democrm",
        requested_capability: "crm.dashboard.read",
        allowed: true,
        entitlement_active: true,
        decision_expires_at: "2099-07-30T00:00:50.000Z",
        decision_version: `sha256:${"c".repeat(64)}`,
        authorization_decision_id: "store-decision-alpha"
      });
    }
    return json({
      application_slug: "pyrosa-democrm",
      cache_scope: "tenant",
      contract_version: "1.0.0",
      database_name: "app_pyrosa_democrm",
      decision_reference: `placement:${"d".repeat(64)}`,
      dictionary_version: "2026.07.30.0",
      expires_at: "2099-07-30T00:01:00.000Z",
      physical_fingerprint: `sha256:${"e".repeat(64)}`,
      placement_version: `sha256:${"f".repeat(64)}`,
      readiness_status: "ready",
      ready: true,
      request_id: body.request_id,
      schema_name: `pyrosa_democrm_${tenantKey}`,
      schema_scope: "tenant-product",
      status: "active",
      tenant_id: tenantId,
      tenant_key: tenantKey
    });
  };

  const configured = config();
  const access = await resolveInteractiveCrmAccess(
    requestContext(),
    configured,
    identity,
    "crm.dashboard.read",
    {
      tenantId,
      tenantKey,
      displayName: "Alpha",
      decisionReference: `dirdec:${"1".repeat(64)}`,
      decisionVersion: `sha256:${"2".repeat(64)}`,
      ownerExpiresAt: "2099-07-30T00:01:00.000Z"
    }
  );

  assert.deepEqual(ownerCalls.sort(), [
    "/api/iam/policy/decisions",
    "/internal/directory/v1/crm-access-decision",
    "/internal/directory/v2/application-access-decision",
    "/internal/platform/v1/schema-placement/resolve",
    "/internal/store/v1/entitlement-decision"
  ]);
  assert.equal(
    access.ownerDecisions?.iam.expiresAt,
    "2099-07-30T00:00:30.000Z"
  );
  assert.equal(
    access.ownerDecisions?.directory.expiresAt,
    "2099-07-30T00:00:40.000Z"
  );
  assert.notEqual(
    access.ownerDecisions?.iam.reference,
    access.ownerDecisions?.directory.reference
  );
  assert.deepEqual(
    tokenCalls.find((entry) => entry.scope === "platform.schema.resolve"),
    {
      clientId: "client-pyrosa-democrm-platform",
      scope: "platform.schema.resolve"
    }
  );

  await resolveInteractiveCrmAccess(
    requestContext(),
    configured,
    { ...identity, subject: "subject-beta" },
    "crm.dashboard.read",
    {
      tenantId,
      tenantKey,
      displayName: "Alpha",
      decisionReference: `dirdec:${"1".repeat(64)}`,
      decisionVersion: `sha256:${"2".repeat(64)}`,
      ownerExpiresAt: "2099-07-30T00:01:00.000Z"
    }
  );
  assert.equal(ownerCalls.filter((path) => path.includes("policy/decisions")).length, 2);
  assert.equal(ownerCalls.filter((path) => path.includes("application-access-decision")).length, 2);
  assert.equal(ownerCalls.filter((path) => path.includes("crm-access-decision")).length, 2);
  assert.equal(ownerCalls.filter((path) => path.includes("entitlement-decision")).length, 1);
  assert.equal(ownerCalls.filter((path) => path.includes("schema-placement")).length, 1);
});

function config(overrides: Partial<CrmServerConfig> = {}): CrmServerConfig {
  return {
    ...loadConfig(),
    iamBaseUrl: "https://iam.pyrosa.test",
    iamPolicyDecisionUrl: "https://iam.pyrosa.test/api/iam/policy/decisions",
    iamPolicyDecisionToken: "iam-policy-token-dedicated-democrm",
    directoryInternalBaseUrl: "https://directory.pyrosa.test",
    directoryDecisionUrl:
      "https://directory.pyrosa.test/internal/directory/v2/application-access-decision",
    directoryV1ShadowEnabled: true,
    directoryOauthTokenUrl: "https://iam.pyrosa.test/oauth/token",
    directoryOauthClientSecret:
      "directory-legacy-secret-at-least-32-bytes",
    directoryCatalogOauthClientSecret:
      "directory-catalog-secret-at-least-32-bytes",
    directoryDecisionOauthClientSecret:
      "directory-decision-secret-at-least-32-bytes",
    storeInternalBaseUrl: "https://store.pyrosa.test",
    storeOauthTokenUrl: "https://iam.pyrosa.test/oauth/token",
    storeOauthClientSecret: "store-decision-secret-at-least-32-bytes",
    platformTenantContextDecisionUrl:
      "https://platform.pyrosa.test/internal/platform/v1/schema-placement/resolve",
    platformOauthTokenUrl: "https://iam.pyrosa.test/oauth/token",
    platformOauthClientSecret:
      "platform-decision-secret-at-least-32-bytes",
    platformPlacementOauthTokenUrl: "https://iam.pyrosa.test/oauth/token",
    platformPlacementOauthClientSecret:
      "platform-placement-secret-at-least-32-bytes",
    accessTimeoutMs: 1000,
    ...overrides
  };
}

function requestContext() {
  return createRequestContext({
    headers: {
      "x-request-id": "request-tenant-owner-access",
      "x-correlation-id": "correlation-tenant-owner-access"
    }
  } as unknown as IncomingMessage);
}

function catalogResponse(body: Record<string, unknown>) {
  return {
    application_slug: "pyrosa-democrm",
    authority: "pyrosa-directory",
    contract_version: "1.1.0",
    correlation_id: body.correlation_id,
    expires_at: "2099-07-30T00:01:00.000Z",
    observed_at: "2026-07-30T00:00:00.000Z",
    request_id: body.request_id,
    selection: {
      cardinality: "single",
      has_more: false,
      mode: "page",
      next_cursor: null
    },
    tenants: [{
      application_projected: true,
      decision_reference: `dirdec:${"a".repeat(64)}`,
      decision_version: `sha256:${"b".repeat(64)}`,
      display_name: "Alpha",
      membership_active: true,
      projection_synced_at: "2026-07-30T00:00:00.000Z",
      seat_active: true,
      tenant_id: tenantId,
      tenant_key: tenantKey
    }]
  };
}

function basicClientId(init?: RequestInit): string {
  const authorization =
    new Headers(init?.headers).get("authorization") ?? "";
  return Buffer.from(
    authorization.replace(/^Basic\s+/u, ""),
    "base64"
  ).toString("utf8").split(":", 1)[0] ?? "";
}

function tokenResponse(clientId: string, scope: string): Response {
  return json({
    access_token: `token-${clientId}-0123456789abcdef`,
    token_type: "Bearer",
    expires_in: 300,
    scope
  });
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
