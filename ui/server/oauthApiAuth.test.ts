import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import { loadConfig } from "./config.js";
import { authenticateCrmApiBearer, hasApiAuthorization } from "./oauthApiAuth.js";

const request = { headers: { authorization: "Bearer opaque-crm-token" } } as IncomingMessage;
const base = {
  active: true, token_type: "access_token", issuer: "https://iam.pyrosa.com.do",
  aud: "pyrosa-crm", iat: Math.floor(Date.now() / 1000) - 1,
  exp: Math.floor(Date.now() / 1000) + 300,
  sub: "subject-crm-1", client_record_id: "client-api-consumer",
  client_id: "api-consumer", principal_type: "human", scope: "crm.read",
  roles: ["crm.viewer"]
};

function config() {
  return {
    ...loadConfig(), oauthApiEnabled: true,
    oauthApiClientId: "client-pyrosa-crm-resource-server",
    oauthApiClientSecret: "test-only-secret",
    oauthApiIntrospectionUrl: "https://iam.pyrosa.com.do/oauth/introspect"
  };
}

test("CRM derives its API principal from exact IAM introspection", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(base), { status: 200 });
  try {
    const principal = await authenticateCrmApiBearer(request, config());
    assert.equal(principal.subject, "subject-crm-1");
    assert.deepEqual(principal.scopes, ["crm.read"]);
  } finally { globalThis.fetch = originalFetch; }
});

for (const [label, payload, code] of [
  ["revoked", { ...base, active: false }, "bearer_token_inactive"],
  ["expired", { ...base, exp: Math.floor(Date.now() / 1000) - 1 }, "bearer_token_expired"],
  ["string expiry", { ...base, exp: String(Math.floor(Date.now() / 1000) + 300) }, "bearer_token_expired"],
  ["other issuer", { ...base, issuer: "https://accounts.pyrosa.com.do" }, "bearer_token_issuer_invalid"],
  ["other audience", { ...base, aud: "pyrosa-erp" }, "bearer_token_audience_invalid"],
  ["missing issue time", { ...base, iat: undefined }, "bearer_token_iat_invalid"],
  ["null issue time", { ...base, iat: null }, "bearer_token_iat_invalid"],
  ["future issue time", { ...base, iat: Math.floor(Date.now() / 1000) + 120 }, "bearer_token_iat_invalid"],
  ["non-string subject", { ...base, sub: {} }, "bearer_token_principal_invalid"],
  ["mismatched service subject", { ...base, principal_type: "service", client_slug: "crm-worker", sub: "client:other" }, "bearer_token_principal_invalid"],
  ["missing scope", { ...base, scope: "profile:read" }, "oauth_scope_missing"]
] as const) {
  test(`CRM rejects ${label}`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
    try { await assert.rejects(() => authenticateCrmApiBearer(request, config()), { code }); }
    finally { globalThis.fetch = originalFetch; }
  });
}

test("CRM fails closed on IAM degradation and disabled cutover", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("unavailable"); };
  try {
    await assert.rejects(() => authenticateCrmApiBearer(request, config()), { code: "iam_introspection_unavailable" });
    await assert.rejects(() => authenticateCrmApiBearer(request, { ...config(), oauthApiEnabled: false }), { code: "oauth_api_disabled" });
  } finally { globalThis.fetch = originalFetch; }
});

test("CRM treats every Authorization header as API auth and never falls back to browser session", async () => {
  const basic = { headers: { authorization: "Basic dXNlcjpwYXNz" } } as IncomingMessage;
  const empty = { headers: { authorization: "" } } as IncomingMessage;
  assert.equal(hasApiAuthorization(basic), true);
  assert.equal(hasApiAuthorization(empty), true);
  assert.equal(hasApiAuthorization({ headers: {} } as IncomingMessage), false);
  await assert.rejects(() => authenticateCrmApiBearer(basic, config()), { code: "bearer_token_missing" });
});

test("CRM maps malformed IAM introspection JSON to a fail-closed 503", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("not-json", { status: 200 });
  try {
    await assert.rejects(() => authenticateCrmApiBearer(request, config()), { code: "iam_introspection_invalid", status: 503 });
  } finally { globalThis.fetch = originalFetch; }
});

test("CRM never sends its Basic secret to a hostile introspection URL", async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; return new Response("{}", { status: 200 }); };
  try {
    await assert.rejects(
      () => authenticateCrmApiBearer(request, { ...config(), oauthApiIntrospectionUrl: "https://attacker.example/introspect" }),
      { code: "oauth_api_not_configured", status: 503 }
    );
    assert.equal(fetched, false);
  } finally { globalThis.fetch = originalFetch; }
});
