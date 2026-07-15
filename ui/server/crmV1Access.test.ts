import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { afterEach, test } from "node:test";
import type { CrmSession } from "./auth.js";
import { loadConfig, type CrmServerConfig } from "./config.js";
import {
  identityFromPrincipal,
  resetCrmOwnerTokenProvidersForTests,
  resolveCrmAccess
} from "./crmV1Access.js";
import { createRequestContext } from "./http.js";
import type { CrmIdentity } from "./crmV1Types.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetCrmOwnerTokenProvidersForTests();
});

const identity: CrmIdentity = {
  kind: "oauth-api",
  issuer: "https://iam.pyrosa.test",
  subject: "client:synthetic-test",
  roles: ["supervisor"],
  scopes: ["crm.cases.read", "crm.dashboard.read"]
};

const tenantId = "tenant-test";
const tenantKey = "8ef427da9f0e";

function request(overrides: Record<string, string> = {}) {
  return {
    headers: {
      "x-pyrosa-tenant-id": tenantId,
      "x-request-id": "request-crm-access-001",
      "x-correlation-id": "correlation-crm-access-001",
      ...overrides
    }
  } as unknown as IncomingMessage;
}

function config(overrides: Partial<CrmServerConfig> = {}): CrmServerConfig {
  return {
    ...loadConfig(),
    directoryInternalBaseUrl: "https://directory.pyrosa.test",
    storeInternalBaseUrl: "https://store.pyrosa.test",
    platformInternalBaseUrl: "https://platform.pyrosa.test",
    iamBaseUrl: "https://iam.pyrosa.test",
    directoryOauthTokenUrl: "https://iam.pyrosa.test/oauth/token",
    directoryOauthClientSecret: "directory-owner-secret-with-at-least-32-bytes",
    storeOauthTokenUrl: "https://iam.pyrosa.test/oauth/token",
    storeOauthClientSecret: "store-owner-secret-with-at-least-32-bytes-long",
    platformOauthTokenUrl: "https://iam.pyrosa.test/oauth/token",
    platformOauthClientSecret: "platform-owner-secret-with-at-least-32-bytes",
    accessTimeoutMs: 1000,
    ...overrides
  };
}

function resolveAccess(
  req: IncomingMessage,
  configured: CrmServerConfig,
  principal: CrmIdentity,
  capability: string
) {
  return resolveCrmAccess(req, createRequestContext(req), configured, principal, capability);
}

test("uses exact snake_case v1 requests and three isolated client_credentials grants", async () => {
  const oauthRequests: Array<{ clientId: string; body: string }> = [];
  const ownerRequests: Array<{ owner: Owner; authorization: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      const clientId = basicClientId(init);
      oauthRequests.push({ clientId, body: String(init?.body) });
      return tokenResponse(ownerForClient(clientId), 1);
    }
    const owner = ownerForHost(url.hostname);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    ownerRequests.push({ owner, authorization: new Headers(init?.headers).get("authorization") ?? "", body });
    return decisionResponse(owner, body);
  };

  const req = request();
  const context = createRequestContext(req);
  const result = await resolveCrmAccess(req, context, config(), identity, "crm.cases.read");

  assert.equal(result.schemaName, `pyrosa_democrm_${tenantKey}`);
  assert.deepEqual(result.capabilities, ["crm.cases.read", "crm.dashboard.read"]);
  assert.deepEqual(oauthRequests.map((entry) => entry.clientId).sort(), [
    "client-pyrosa-crm",
    "client-pyrosa-democrm",
    "client-pyrosa-democrm-store-entitlements"
  ]);
  assert.equal(new Set(oauthRequests.map((entry) => entry.body)).size, 3);
  assert.ok(oauthRequests.some((entry) => entry.body === "audience=pyrosa-directory&grant_type=client_credentials&scope=directory%3Acrm-access%3Adecide"));
  assert.ok(oauthRequests.some((entry) => entry.body === "audience=pyrosa-store&grant_type=client_credentials&scope=store.entitlement.decide"));
  assert.ok(oauthRequests.some((entry) => entry.body === "audience=pyrosa-platform&grant_type=client_credentials&scope=platform.provisioning.readiness.consume"));
  assert.equal(ownerRequests.length, 3);
  assert.equal(new Set(ownerRequests.map((entry) => entry.authorization)).size, 3, "owners must never share a bearer");
  for (const entry of ownerRequests) {
    assert.deepEqual(Object.keys(entry.body).sort(), [
      "application_slug", "contract_version", "correlation_id", "identity",
      "request_id", "requested_capability", "tenant_id"
    ]);
    assert.deepEqual(entry.body.identity, {
      issuer: "https://iam.pyrosa.test",
      subject: "synthetic-test",
      kind: "oauth-api"
    });
    assert.equal(entry.body.contract_version, "1.0.0");
    assert.equal(entry.body.request_id, "request-crm-access-001");
    assert.equal(entry.body.correlation_id, "correlation-crm-access-001");
    assert.equal(entry.body.tenant_id, tenantId);
    assert.equal(entry.body.application_slug, "pyrosa-democrm");
    assert.equal(entry.body.requested_capability, "crm.cases.read");
    assert.equal(JSON.stringify(entry.body).includes("roles"), false);
  }
});

test("reuses the generated RequestContext identifiers for every owner decision", async () => {
  const observed: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return tokenResponse(ownerForClient(basicClientId(init)), 1);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    observed.push(body);
    return decisionResponse(ownerForHost(url.hostname), body);
  };
  const req = request({ "x-request-id": "bad", "x-correlation-id": "bad" });
  const context = createRequestContext(req);

  await resolveCrmAccess(req, context, config(), identity, "crm.cases.read");

  assert.match(context.requestId, /^[0-9a-f-]{36}$/u);
  assert.equal(context.correlationId, context.requestId);
  assert.equal(observed.length, 3);
  assert.ok(observed.every((body) => body.request_id === context.requestId));
  assert.ok(observed.every((body) => body.correlation_id === context.correlationId));
});

test("legacy crm.read maps only the explicit closed read capability allowlist", async () => {
  const configured = config();
  const legacyIdentity = { ...identity, scopes: ["crm.read"] };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return tokenResponse(ownerForClient(basicClientId(init)), 1);
    const owner = ownerForHost(url.hostname);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const payload = decisionPayload(owner, body);
    if (owner === "directory") {
      payload.capabilities = [
        "crm.dashboard.read",
        "crm.accounts.read",
        "crm.config.read",
        "crm.future.read",
        "crm.sensitive.read",
        "crm.exports.read",
        "crm.accounts.write"
      ];
    }
    return json(payload);
  };

  const allowed = await resolveAccess(request(), configured, legacyIdentity, "crm.dashboard.read");
  assert.deepEqual(allowed.capabilities, ["crm.dashboard.read", "crm.accounts.read", "crm.config.read"]);
  await assert.rejects(
    resolveAccess(request({ "x-request-id": "request-crm-access-future" }), configured, legacyIdentity, "crm.future.read"),
    hasCode("crm.permission.denied")
  );
});

test("caches each owner token independently across access decisions", async () => {
  const configured = config();
  const tokenCalls: Record<Owner, number> = { directory: 0, store: 0, platform: 0 };
  let decisionCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      const owner = ownerForClient(basicClientId(init));
      tokenCalls[owner] += 1;
      return tokenResponse(owner, tokenCalls[owner]);
    }
    decisionCalls += 1;
    return decisionResponse(ownerForHost(url.hostname), JSON.parse(String(init?.body)));
  };

  await resolveAccess(request(), configured, identity, "crm.cases.read");
  await resolveAccess(request({ "x-request-id": "request-crm-access-002" }), configured, identity, "crm.cases.read");

  assert.deepEqual(tokenCalls, { directory: 1, store: 1, platform: 1 });
  assert.equal(decisionCalls, 6);
});

test("invalidates only the rejected owner token and retries its decision once after 401", async () => {
  const tokenCalls: Record<Owner, number> = { directory: 0, store: 0, platform: 0 };
  const decisionCalls: Record<Owner, number> = { directory: 0, store: 0, platform: 0 };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      const owner = ownerForClient(basicClientId(init));
      tokenCalls[owner] += 1;
      return tokenResponse(owner, tokenCalls[owner]);
    }
    const owner = ownerForHost(url.hostname);
    decisionCalls[owner] += 1;
    if (owner === "directory" && decisionCalls.directory === 1) {
      return new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 });
    }
    return decisionResponse(owner, JSON.parse(String(init?.body)));
  };

  await resolveAccess(request(), config(), identity, "crm.cases.read");

  assert.deepEqual(tokenCalls, { directory: 2, store: 1, platform: 1 });
  assert.deepEqual(decisionCalls, { directory: 2, store: 1, platform: 1 });
});

test("does not retry a second 401 or fall back to a static/shared bearer", async () => {
  let directoryDecisions = 0;
  let directoryTokens = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      const owner = ownerForClient(basicClientId(init));
      if (owner === "directory") directoryTokens += 1;
      return tokenResponse(owner, owner === "directory" ? directoryTokens : 1);
    }
    const owner = ownerForHost(url.hostname);
    if (owner === "directory") {
      directoryDecisions += 1;
      return new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 });
    }
    return decisionResponse(owner, JSON.parse(String(init?.body)));
  };

  await assert.rejects(
    resolveAccess(request(), config(), identity, "crm.cases.read"),
    hasCode("crm.directory.decision_failed")
  );
  assert.equal(directoryTokens, 2);
  assert.equal(directoryDecisions, 2);
});

test("fails closed when an owner response changes case, shape or echoed context", async () => {
  for (const mutation of ["camel", "tenant", "request"] as const) {
    resetCrmOwnerTokenProvidersForTests();
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/oauth/token") return tokenResponse(ownerForClient(basicClientId(init)), 1);
      const owner = ownerForHost(url.hostname);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const response = decisionPayload(owner, body);
      if (owner === "directory" && mutation === "camel") {
        (response as Record<string, unknown>).membershipActive = (response as Record<string, unknown>).membership_active;
        delete (response as Record<string, unknown>).membership_active;
      }
      if (owner === "store" && mutation === "tenant") (response as Record<string, unknown>).tenant_id = "tenant-hostile";
      if (owner === "platform" && mutation === "request") (response as Record<string, unknown>).request_id = "request-hostile";
      return json(response);
    };
    await assert.rejects(
      resolveAccess(request(), config(), identity, "crm.cases.read"),
      hasCode("crm.access.response_invalid")
    );
  }
});

test("requires owner-specific positive decisions rather than inferring effective access", async () => {
  for (const deniedOwner of ["directory", "store", "platform"] as const) {
    resetCrmOwnerTokenProvidersForTests();
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/oauth/token") return tokenResponse(ownerForClient(basicClientId(init)), 1);
      const owner = ownerForHost(url.hostname);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const payload = decisionPayload(owner, body);
      if (owner === deniedOwner) {
        (payload as Record<string, unknown>).allowed = false;
        if (owner === "directory") (payload as Record<string, unknown>).membership_active = false;
        if (owner === "store") (payload as Record<string, unknown>).entitlement_active = false;
        if (owner === "platform") (payload as Record<string, unknown>).ready = false;
      }
      return json(payload);
    };
    const expected = deniedOwner === "directory"
      ? "crm.tenant.membership_required"
      : deniedOwner === "store"
        ? "crm.entitlement.inactive"
        : "crm.platform.not_ready";
    await assert.rejects(resolveAccess(request(), config(), identity, "crm.cases.read"), hasCode(expected));
  }
});

test("rejects invalid token responses and missing owner credentials without fallback", async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      const owner = ownerForClient(basicClientId(init));
      if (owner === "store") {
        return json({ access_token: "oauth-store-token-0123456789", token_type: "Bearer", expires_in: 300, scope: "store.entitlement.decide extra" });
      }
      return tokenResponse(owner, 1);
    }
    return decisionResponse(ownerForHost(url.hostname), JSON.parse(String(init?.body)));
  };
  await assert.rejects(
    resolveAccess(request(), config(), identity, "crm.cases.read"),
    hasCode("crm.owner_oauth.response_invalid")
  );

  resetCrmOwnerTokenProvidersForTests();
  await assert.rejects(
    resolveAccess(request(), config({ storeOauthClientSecret: null }), identity, "crm.cases.read"),
    hasCode("crm.store.oauth_not_configured")
  );
});

test("normalizes browser identity to the IAM HTTPS issuer and a stable opaque subject", () => {
  const session = {
    user: { id: 42, role: "tenant_admin" }
  } as unknown as CrmSession;
  assert.deepEqual(identityFromPrincipal(session, config()), {
    kind: "browser",
    issuer: "https://iam.pyrosa.test",
    subject: "iam-user-42",
    roles: ["tenant_admin"],
    scopes: []
  });
  assert.throws(
    () => identityFromPrincipal(session, config({ iamBaseUrl: "http://iam.pyrosa.test" })),
    hasCode("crm.identity.invalid")
  );
});

type Owner = "directory" | "store" | "platform";

function ownerForClient(clientId: string): Owner {
  if (clientId === "client-pyrosa-democrm") return "directory";
  if (clientId === "client-pyrosa-democrm-store-entitlements") return "store";
  if (clientId === "client-pyrosa-crm") return "platform";
  throw new Error(`unexpected client ${clientId}`);
}

function ownerForHost(hostname: string): Owner {
  if (hostname.startsWith("directory.")) return "directory";
  if (hostname.startsWith("store.")) return "store";
  if (hostname.startsWith("platform.")) return "platform";
  throw new Error(`unexpected owner host ${hostname}`);
}

function basicClientId(init?: RequestInit): string {
  const authorization = new Headers(init?.headers).get("authorization") ?? "";
  const encoded = authorization.replace(/^Basic\s+/u, "");
  return Buffer.from(encoded, "base64").toString("utf8").split(":", 1)[0];
}

function tokenResponse(owner: Owner, sequence: number): Response {
  const scope = owner === "directory"
    ? "directory:crm-access:decide"
    : owner === "store"
      ? "store.entitlement.decide"
      : "platform.provisioning.readiness.consume";
  return json({
    access_token: `oauth-${owner}-${sequence}-token-0123456789abcdef`,
    token_type: "Bearer",
    expires_in: 300,
    scope
  });
}

function decisionResponse(owner: Owner, requestBody: Record<string, unknown>): Response {
  return json(decisionPayload(owner, requestBody));
}

function decisionPayload(owner: Owner, body: Record<string, unknown>): Record<string, unknown> {
  const echo = {
    contract_version: body.contract_version,
    request_id: body.request_id,
    correlation_id: body.correlation_id,
    tenant_id: body.tenant_id,
    application_slug: body.application_slug
  };
  if (owner === "directory") {
    return {
      ...echo,
      tenant_key: tenantKey,
      allowed: true,
      membership_active: true,
      seat_active: true,
      display_name: "Tenant sintetico",
      roles: ["supervisor"],
      capabilities: ["crm.cases.read", "crm.dashboard.read"],
      authorization_decision_id: "directory-decision-synthetic",
      profile_key: "healthcare-call-center",
      profile_version: "1",
      timezone: "America/Santo_Domingo",
      locale: "es-DO"
    };
  }
  if (owner === "store") {
    return {
      ...echo,
      requested_capability: body.requested_capability,
      allowed: true,
      entitlement_active: true,
      seat_active: true,
      requires_named_seat: true,
      subscription_kind: "trial",
      subscription_status: "active",
      trial_status: "consumed",
      entitlement_status: "effective",
      starts_at: "2026-07-15T00:00:00.000Z",
      ends_at: "2026-08-14T00:00:00.000Z",
      reason_code: "allowed",
      authorization_decision_id: "store-decision-synthetic"
    };
  }
  return {
    ...echo,
    allowed: true,
    authorization_decision_id: "platform-readiness-synthetic",
    dictionary_version: "2.0.1",
    physical_fingerprint: `sha256:${"a".repeat(64)}`,
    readiness_status: "ready",
    ready: true,
    schema_name: `pyrosa_democrm_${tenantKey}`
  };
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code
  );
}
