import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { afterEach, test } from "node:test";
import {
  createSessionFromTicket,
  loadCrmSession,
  type CrmSession
} from "./auth.js";
import { loadConfig, type CrmServerConfig } from "./config.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("ticket exchange preserves the canonical IAM identity including a one-character opaque subject", async () => {
  globalThis.fetch = async () => json(exchangePayload({
    issuer: "https://iam.pyrosa.test/",
    subject: "1"
  }));

  const session = await createSessionFromTicket(request(), config(), "ticket_synthetic_001");

  assert.deepEqual(session.iamIdentity, {
    issuer: "https://iam.pyrosa.test",
    subject: "1"
  });
});

for (const [label, identity] of [
  ["missing identity", undefined],
  ["another issuer", { issuer: "https://accounts.pyrosa.test", subject: "usr_synthetic" }],
  ["blank subject", { issuer: "https://iam.pyrosa.test", subject: " " }],
  ["padded subject", { issuer: "https://iam.pyrosa.test", subject: " usr_synthetic " }],
  ["oversized subject", { issuer: "https://iam.pyrosa.test", subject: "a".repeat(201) }]
] as const) {
  test(`ticket exchange rejects ${label}`, async () => {
    globalThis.fetch = async () => json(exchangePayload(identity));

    await assert.rejects(
      () => createSessionFromTicket(request(), config(), "ticket_synthetic_001"),
      { code: "ui_auth_identity_invalid", status: 502 }
    );
  });
}

test("ticket exchange rejects identity aliases nested in user", async () => {
  const payload = exchangePayload(undefined);
  globalThis.fetch = async () => json({
    ...payload,
    user: {
      ...payload.user,
      issuer: "https://iam.pyrosa.test",
      subject: "1",
      iamIssuer: "https://iam.pyrosa.test",
      iamSubject: "1"
    }
  });

  await assert.rejects(
    () => createSessionFromTicket(request(), config(), "ticket_synthetic_001"),
    { code: "ui_auth_identity_invalid", status: 502 }
  );
});

test("signed legacy cookies without a canonical IAM identity fail closed", async () => {
  const configured = config();
  const legacy = { ...sessionFixture(), iamIdentity: undefined };
  let introspected = false;
  globalThis.fetch = async () => {
    introspected = true;
    throw new Error("legacy cookie must not reach IAM");
  };

  const loaded = await loadCrmSession(cookieRequest(legacy, configured), null, configured);

  assert.equal(loaded, null);
  assert.equal(introspected, false);
});

test("session introspection transport failures fail closed instead of retaining the local session", async () => {
  const configured = config();
  const session = sessionFixture({ uiAuthLastCheckedAt: new Date(0).toISOString() });
  globalThis.fetch = async () => {
    throw new Error("synthetic IAM outage");
  };

  await assert.rejects(
    () => loadCrmSession(cookieRequest(session, configured), null, configured),
    { code: "crm.auth.introspection_unavailable", status: 503 }
  );
});

for (const [label, identity] of [
  ["missing identity", undefined],
  ["invalid issuer", { issuer: "https://accounts.pyrosa.test", subject: "1" }]
] as const) {
  test(`session introspection rejects ${label} instead of retaining the prior identity`, async () => {
    const configured = config();
    const session = sessionFixture({ uiAuthLastCheckedAt: new Date(0).toISOString() });
    globalThis.fetch = async () => json({
      active: true,
      ...exchangePayload(identity)
    });

    await assert.rejects(
      () => loadCrmSession(cookieRequest(session, configured), null, configured),
      { code: "ui_auth_identity_invalid", status: 502 }
    );
  });
}

function config(): CrmServerConfig {
  return {
    ...loadConfig(),
    iamBaseUrl: "https://iam.pyrosa.test",
    iamInternalBaseUrl: "https://iam-internal.pyrosa.test",
    iamClientSlug: "crm",
    iamClientSecret: "synthetic-ui-auth-secret-with-32-bytes",
    iamCallbackUrl: "https://crm.pyrosa.test/auth/callback",
    iamSessionCheckMs: 30_000
  };
}

function request(cookie?: string): IncomingMessage {
  return {
    headers: cookie ? { cookie } : {},
    socket: { remoteAddress: "127.0.0.1" }
  } as unknown as IncomingMessage;
}

function cookieRequest(session: unknown, configured: CrmServerConfig): IncomingMessage {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = createHmac("sha256", String(configured.iamClientSecret ?? ""))
    .update(payload)
    .digest("base64url");
  return request(`PYROSA_CRM_SESSION=${encodeURIComponent(`${payload}.${signature}`)}`);
}

function sessionFixture(overrides: Partial<CrmSession> = {}): CrmSession {
  return {
    sid: "crm-session-synthetic",
    user: {
      id: 1,
      email: "synthetic@example.invalid",
      displayName: "Synthetic User",
      role: "tenant_admin",
      locale: "es",
      timezone: "America/Santo_Domingo",
      status: "active",
      primaryEmail: {
        email: "synthetic@example.invalid",
        verifiedAt: "2026-07-15T00:00:00.000Z",
        isVerified: true
      },
      security: { mfaRequired: false, activeMfaMethods: 0 }
    },
    iamIdentity: { issuer: "https://iam.pyrosa.test", subject: "1" },
    csrf: "csrf-synthetic",
    uiAuthSessionId: "authsess_synthetic",
    uiAuthParentSessionId: "authsess_parent_synthetic",
    uiAuthAuthenticatedAt: "2026-07-15T00:00:00.000Z",
    uiAuthLastCheckedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides
  };
}

function exchangePayload(identity: { issuer: string; subject: string } | undefined) {
  return {
    session: {
      sessionId: "authsess_synthetic",
      parentSessionId: "authsess_parent_synthetic",
      authenticatedAt: "2026-07-15T00:00:00.000Z",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    },
    user: {
      id: 1,
      email: "synthetic@example.invalid",
      displayName: "Synthetic User",
      role: "tenant_admin",
      locale: "es",
      timezone: "America/Santo_Domingo",
      status: "active"
    },
    ...(identity ? { identity } : {}),
    primaryEmail: {
      email: "synthetic@example.invalid",
      verifiedAt: "2026-07-15T00:00:00.000Z",
      isVerified: true
    },
    security: { mfaRequired: false, activeMfaMethods: 0 }
  };
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
