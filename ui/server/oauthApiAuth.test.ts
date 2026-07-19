import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CrmSession } from "./auth.js";
import { loadConfig } from "./config.js";
import { closePostgres } from "./db.js";
import { createCrmServer, publicSession } from "./index.js";
import { authenticateCrmApiBearer, hasApiAuthorization } from "./oauthApiAuth.js";
import {
  assertClientArtifactFile,
  assertReleaseMatchesConfig,
  inspectReleaseFreshness,
  publicReleaseIdentity,
  type CrmRuntimeRelease
} from "./release.js";

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

test("CRM v1 auth failures emitted before the handler use the nested v1 error envelope", async () => {
  await withServer({ ...config(), accessLog: false, oauthApiEnabled: false }, async (baseUrl) => {
    const requestId = "request-auth-envelope-001";
    const response = await fetch(`${baseUrl}/api/crm/v1/dashboard-summary`, {
      headers: {
        authorization: "Bearer opaque-crm-token",
        "x-correlation-id": "correlation-auth-envelope-001",
        "x-request-id": requestId
      }
    });
    const payload = await response.json() as { error?: Record<string, unknown>; ok?: unknown };
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-request-id"), requestId);
    assert.equal(response.headers.get("x-correlation-id"), "correlation-auth-envelope-001");
    assert.equal(payload.ok, undefined);
    assert.equal(payload.error?.code, "oauth_api_disabled");
    assert.equal(payload.error?.requestId, requestId);

    const anonymous = await fetch(`${baseUrl}/api/crm/v1`);
    const anonymousPayload = await anonymous.json() as { error?: Record<string, unknown> };
    assert.equal(anonymous.status, 401);
    assert.equal(anonymousPayload.error?.code, "auth_required");
    assert.equal(anonymousPayload.error?.requestId, anonymous.headers.get("x-request-id"));
  });
});

test("publicSession and bootstrap session payload redact the private IAM issuer and subject", () => {
  const session = {
    sid: "session-synthetic",
    csrf: "csrf-synthetic",
    expiresAt: "2026-07-16T00:00:00.000Z",
    uiAuthSessionId: "ui-auth-synthetic",
    uiAuthAuthenticatedAt: "2026-07-15T00:00:00.000Z",
    iamIdentity: {
      issuer: "https://iam.private.invalid",
      subject: "opaque-private-subject"
    },
    user: {
      id: 1,
      email: "synthetic@example.invalid",
      displayName: "Synthetic",
      role: "tenant_admin",
      locale: "es",
      timezone: "America/Santo_Domingo",
      status: "active",
      primaryEmail: {
        email: "synthetic@example.invalid",
        verifiedAt: null,
        isVerified: false
      },
      security: { mfaRequired: false, activeMfaMethods: 0 },
      issuer: "https://hostile-extra.invalid",
      subject: "hostile-extra-subject",
      iamIssuer: "https://hostile-alias.invalid",
      iamSubject: "hostile-alias-subject"
    }
  } as unknown as CrmSession;
  const exposed = publicSession(session, { id: "tenant-single-canary" });
  assert.deepEqual(exposed.tenant, { id: "tenant-single-canary" });
  assert.equal(exposed.csrfToken, "csrf-synthetic");
  assert.equal("tenant" in publicSession(session), false);
  assert.equal("iamIdentity" in exposed, false);
  assert.equal("issuer" in exposed.user, false);
  assert.equal("subject" in exposed.user, false);
  assert.equal("iamIssuer" in exposed.user, false);
  assert.equal("iamSubject" in exposed.user, false);
  const serialized = JSON.stringify(exposed);
  assert.equal(serialized.includes("opaque-private-subject"), false);
  assert.equal(serialized.includes("iam.private.invalid"), false);
});

test("runtime release identity fails closed on dirty source, version skew and changed manifest", () => {
  const configured = config();
  const release = testRelease(configured);
  assert.doesNotThrow(() => assertReleaseMatchesConfig(release, configured));
  assert.throws(
    () => assertReleaseMatchesConfig({ ...release, sourceDirty: true }, configured),
    { code: "crm.artifact.source_dirty" }
  );
  assert.throws(
    () => assertReleaseMatchesConfig({ ...release, version: "v9999" }, configured),
    { code: "crm.artifact.version_mismatch" }
  );
  assert.throws(
    () => assertReleaseMatchesConfig({ ...release, branch: "other" }, configured),
    { code: "crm.artifact.branch_mismatch" }
  );
  assert.deepEqual(inspectReleaseFreshness({ ...release, manifestSha256: "0".repeat(64) }), {
    ok: false,
    code: "crm.artifact.manifest_changed"
  });
  assert.deepEqual(inspectReleaseFreshness(release, true), {
    ok: false,
    code: "crm.artifact.client_changed"
  });
  assert.deepEqual(publicReleaseIdentity(release), {
    releaseId: release.releaseId,
    version: configured.version,
    commit: release.commit,
    branch: configured.branch,
    sourceDirty: false,
    manifestSha256: release.manifestSha256,
    clientSha256: release.client.sha256,
    serverSha256: release.server.sha256
  });
});

test("runtime release rejects a client file whose bytes differ from the loaded BFF release", () => {
  const configured = config();
  const release = testRelease(configured);
  const filePath = fileURLToPath(import.meta.url);
  const content = readFileSync(filePath);
  const relativePath = basename(filePath);
  const client = {
    ...release.client,
    rootPath: dirname(filePath),
    fileCount: 1,
    bytes: content.byteLength,
    files: {
      [relativePath]: {
        size: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex")
      }
    }
  };
  assert.doesNotThrow(() => assertClientArtifactFile(filePath, { ...release, client }));
  assert.throws(
    () => assertClientArtifactFile(filePath, {
      ...release,
      client: {
        ...client,
        files: { [relativePath]: { ...client.files[relativePath], sha256: "0".repeat(64) } }
      }
    }),
    { code: "crm.artifact.client_file_mismatch" }
  );
});

test("health exposes the verified release even when an independent dependency is unavailable", async () => {
  const distDir = mkdtempSync(resolve(tmpdir(), "pyrosa-crm-health-"));
  const configured = {
    ...config(),
    accessLog: false,
    distDir,
    dbDsn: null,
    dbHost: "127.0.0.1",
    dbPort: 1,
    dbConnectTimeoutMs: 50
  };
  try {
    await withServer(configured, async (baseUrl) => {
      const release = testRelease(configured);
      const response = await fetch(`${baseUrl}${configured.healthPath}`);
      const payload = await response.json() as {
        artifact?: unknown;
        commit?: unknown;
        releaseId?: unknown;
        release?: { clientSha256?: unknown; serverSha256?: unknown };
      };
      assert.equal(response.status, 503);
      assert.equal(payload.releaseId, release.releaseId);
      assert.equal(payload.commit, release.commit);
      assert.deepEqual(payload.artifact, { ok: true });
      assert.equal(payload.release?.clientSha256, release.client.sha256);
      assert.equal(payload.release?.serverSha256, release.server.sha256);
    });
  } finally {
    await closePostgres();
    rmSync(distDir, { recursive: true, force: true });
  }
});

test("artifact drift renders the shared public landing for documents and preserves JSON for APIs", async () => {
  const distDir = mkdtempSync(resolve(tmpdir(), "pyrosa-crm-artifact-landing-"));
  const manifestPath = resolve(distDir, "release-manifest.json");
  writeFileSync(manifestPath, "verified-release\n");
  const configured = { ...config(), accessLog: false, distDir };
  const release = {
    ...testRelease(configured),
    manifestPath,
    manifestSha256: createHash("sha256").update(readFileSync(manifestPath)).digest("hex")
  };
  const server = createCrmServer(release, configured);
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address() as AddressInfo;

  try {
    writeFileSync(manifestPath, "changed-release\n");
    const documentResponse = await fetch(`http://127.0.0.1:${address.port}/`, {
      headers: { Accept: "text/html" }
    });
    const documentBody = await documentResponse.text();
    assert.equal(documentResponse.status, 503);
    assert.match(String(documentResponse.headers.get("content-type")), /^text\/html/u);
    assert.match(String(documentResponse.headers.get("content-security-policy")), /default-src 'none'/u);
    assert.match(documentBody, /data-py-internal-error-landing="true"/u);
    assert.match(documentBody, /DemoCRM no está disponible/u);
    assert.match(documentBody, /crm\.artifact\.inconsistent/u);
    assert.doesNotMatch(documentBody, /changed-release|release-manifest\.json/u);

    const apiResponse = await fetch(`http://127.0.0.1:${address.port}/api/crm/bootstrap`, {
      headers: { Accept: "text/html" }
    });
    const apiPayload = await apiResponse.json() as { error?: { code?: unknown } };
    assert.equal(apiResponse.status, 503);
    assert.match(String(apiResponse.headers.get("content-type")), /^application\/json/u);
    assert.equal(apiPayload.error?.code, "crm.artifact.inconsistent");
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    rmSync(distDir, { recursive: true, force: true });
  }
});

async function withServer(
  configured: ReturnType<typeof config>,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createCrmServer(testRelease(configured), configured);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function testRelease(configured: ReturnType<typeof config>): CrmRuntimeRelease {
  const manifestPath = fileURLToPath(import.meta.url);
  const manifestSha256 = createHash("sha256").update(readFileSync(manifestPath)).digest("hex");
  const artifact = {
    root: ".",
    rootPath: configured.distDir,
    fileCount: 0,
    bytes: 0,
    sha256: "1".repeat(64),
    files: {}
  };
  return {
    schemaVersion: 1,
    application: "pyrosa-democrm",
    releaseId: "pyrosa-democrm/test/0123456789ab/1111111111111111",
    version: configured.version,
    commit: "0123456789abcdef0123456789abcdef01234567",
    branch: configured.branch,
    sourceDirty: false,
    generatedAt: "2026-07-15T00:00:00.000Z",
    aggregateSha256: "1".repeat(64),
    manifestPath,
    manifestSha256,
    client: artifact,
    server: {
      ...artifact,
      entry: "index.js",
      entryPath: manifestPath
    },
    launcher: artifact
  };
}
