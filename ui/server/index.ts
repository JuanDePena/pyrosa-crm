import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  CrmAuthError,
  buildLoginRedirect,
  buildLogoutRedirect,
  clearSessionCookie,
  createSessionFromTicket,
  decodeState,
  loadCrmSession,
  normalizeReturnTo,
  setSessionCookie,
  type CrmSession
} from "./auth.js";
import { loadConfig, type CrmServerConfig } from "./config.js";
import { closePostgres, loadDatabaseStatus } from "./db.js";
import {
  applyCommonHeaders,
  assertStaticShellExists,
  createRequestContext,
  logAccess,
  sendJson,
  sendText,
  serveStatic
} from "./http.js";
import { buildActionPreview, buildCrmContracts } from "./contracts.js";
import { authenticateCrmApiBearer, hasApiAuthorization, type CrmApiPrincipal } from "./oauthApiAuth.js";
import { handleCrmV1, resolveBootstrapContext, sendCrmV1Error } from "./crmV1Http.js";
import { CrmV1Error } from "./crmV1Domain.js";
import {
  assertReleaseFresh,
  assertReleaseMatchesConfig,
  CrmArtifactConsistencyError,
  inspectReleaseFreshness,
  publicReleaseIdentity,
  type CrmRuntimeRelease
} from "./release.js";

export function createCrmServer(release: CrmRuntimeRelease, config: CrmServerConfig = loadConfig()) {
  assertReleaseMatchesConfig(release, config);
  const server = createServer((req, res) => {
    void handleRequest(req, res, config, release).catch((error) => {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      if (error instanceof CrmArtifactConsistencyError) {
        const requestId = runtimeRequestId(res);
        console.error(
          `[crm_artifact_inconsistent] request_id=${requestId} code=${error.code} release_id=${release.releaseId}`
        );
        sendJson(res, 503, {
          error: {
            code: "crm.artifact.inconsistent",
            message: "PYROSA CRM detecto una mezcla de artefactos y detuvo la solicitud.",
            occurredAt: new Date().toISOString(),
            requestId,
            retryable: false
          },
          release: {
            releaseId: release.releaseId,
            commit: release.commit
          }
        });
        return;
      }
      if (error instanceof CrmAuthError) {
        if (isCrmV1Request(req)) {
          sendCrmV1Error(
            res,
            {
              headOnly: String(req.method ?? "GET").toUpperCase() === "HEAD",
              requestId: runtimeRequestId(res)
            },
            new CrmV1Error(error.status, error.code, error.message, error.status >= 500)
          );
          return;
        }
        sendJson(res, error.status, {
          ok: false,
          error: error.code,
          message: error.message
        });
        return;
      }
      const requestId = runtimeRequestId(res);
      if (error instanceof CrmV1Error) {
        sendJson(res, error.status, {
          error: {
            code: error.code,
            message: error.message,
            occurredAt: new Date().toISOString(),
            requestId,
            retryable: error.retryable,
            fields: error.fields
          }
        });
        return;
      }
      console.error(`[crm_runtime_error] request_id=${requestId}`, error);
      sendJson(res, 500, {
        error: {
          code: "crm.internal.error",
          message: "PYROSA CRM no pudo completar la solicitud.",
          occurredAt: new Date().toISOString(),
          requestId,
          retryable: true
        }
      });
    });
  });

  server.requestTimeout = 120000;
  server.headersTimeout = 65000;
  server.keepAliveTimeout = 5000;

  return server;
}

function runtimeRequestId(res: ServerResponse): string {
  const value = String(res.getHeader("x-request-id") ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{2,127}$/u.test(value) ? value : randomUUID();
}

export function startServer(
  release: CrmRuntimeRelease,
  config: CrmServerConfig = loadConfig()
): ReturnType<typeof createCrmServer> {
  assertStaticShellExists(config);

  const server = createCrmServer(release, config);
  server.listen(config.port, config.host, () => {
    console.log(
      `PYROSA CRM listening on http://${config.host}:${config.port} release_id=${release.releaseId} commit=${release.commit}`
    );
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      console.log(`PYROSA CRM received ${signal}; closing server`);
      server.close((error) => {
        if (error) {
          console.error(`PYROSA CRM shutdown failed: ${error.message}`);
          void closePostgres().finally(() => process.exit(1));
          return;
        }
        void closePostgres().finally(() => process.exit(0));
      });
    });
  }

  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: CrmServerConfig,
  release: CrmRuntimeRelease
): Promise<void> {
  const context = createRequestContext(req);
  applyCommonHeaders(res, context.requestId, context.correlationId);
  logAccess(req, res, context, config);
  const artifact = inspectReleaseFreshness(
    release,
    context.url.pathname === config.healthPath
  );

  if (context.url.pathname === config.healthPath) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method Not Allowed");
      return;
    }
    const db = await loadDatabaseStatus(config);
    const payload: Record<string, unknown> = {
      ok: db.ok === true && artifact.ok,
      service: "pyrosa-crm",
      version: config.version,
      branch: config.branch,
      releaseId: release.releaseId,
      commit: release.commit,
      release: publicReleaseIdentity(release),
      artifact,
      database: db
    };
    if (config.healthDetails) {
      payload.distDir = config.distDir;
      payload.platform = buildPlatformContracts(config);
    }
    sendJson(res, db.ok === true && artifact.ok ? 200 : 503, payload, context.headOnly);
    return;
  }

  assertReleaseFresh(release);

  if (isLoginPath(context.url.pathname)) {
    if (!allowGetOrHead(req, res)) {
      return;
    }
    const session = await loadCrmSession(req, res, config);
    if (session) {
      sendRedirect(res, 302, "/ui", context.headOnly);
      return;
    }
    const returnTo = normalizeReturnTo(context.url.searchParams.get("return_to") ?? "/ui");
    sendRedirect(res, 302, buildLoginRedirect(config, returnTo), context.headOnly);
    return;
  }

  if (context.url.pathname === "/auth/callback") {
    if (!allowGetOrHead(req, res)) {
      return;
    }
    const ticket = context.url.searchParams.get("ticket");
    if (!ticket) {
      sendText(res, 400, "Falta el ticket de autenticacion.\n");
      return;
    }
    const state = decodeState(context.url.searchParams.get("state"));
    const session = await createSessionFromTicket(req, config, ticket);
    setSessionCookie(req, res, config, session);
    sendRedirect(res, 302, state?.returnTo ?? "/ui", context.headOnly);
    return;
  }

  if (context.url.pathname === "/logout" || context.url.pathname === "/auth/logout") {
    if (!allowGetOrHead(req, res)) {
      return;
    }
    clearSessionCookie(req, res);
    sendRedirect(res, 302, buildLogoutRedirect(req, config), context.headOnly);
    return;
  }

  if (context.url.pathname === "/") {
    if (!allowGetOrHead(req, res)) {
      return;
    }
    const session = await loadCrmSession(req, res, config);
    sendRedirect(res, 302, session ? "/ui" : "/auth/login", context.headOnly);
    return;
  }

  if (context.url.pathname === "/api/crm/session") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method Not Allowed");
      return;
    }
    const session = await requireCrmSession(req, res, config, context.headOnly);
    if (!session) {
      return;
    }
    sendJson(
      res,
      200,
      {
        ok: true,
        session: publicSession(
          session,
          config.defaultTenantId ? { id: config.defaultTenantId } : null
        )
      },
      context.headOnly
    );
    return;
  }

  if (context.url.pathname === "/api/crm/bootstrap") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method Not Allowed");
      return;
    }
    const session = await requireCrmSession(req, res, config, context.headOnly);
    if (!session) {
      return;
    }
    const crmContext = await resolveBootstrapContext(req, context, config, session);
    sendJson(
      res,
      200,
      {
        app: {
          name: "PYROSA CRM",
          version: config.version,
          branch: config.branch,
          releaseId: release.releaseId,
          commit: release.commit
        },
        platform: buildPlatformContracts(config),
        auth: {
          mode: "delegated-ui-auth",
          session: publicSession(session, {
            id: crmContext.tenantId,
            label: crmContext.displayName
          })
        },
        context: {
          activeTenantId: crmContext.tenantId,
          tenantKey: crmContext.tenantKey,
          displayName: crmContext.displayName,
          profileKey: crmContext.profileKey,
          profileVersion: crmContext.profileVersion,
          timezone: crmContext.timezone,
          locale: crmContext.locale,
          dictionaryVersion: crmContext.dictionaryVersion,
          capabilities: crmContext.capabilities
        },
        modules: [
          { key: "accounts", label: "Cuentas", status: "canary" },
          { key: "contacts", label: "Contactos", status: "canary" },
          { key: "cases", label: "Casos", status: "canary" },
          { key: "activities", label: "Actividades", status: "canary" },
          { key: "appointments", label: "Agenda", status: "canary" },
          { key: "opportunities", label: "Oportunidades", status: "canary" },
          { key: "reports", label: "Reportes", status: "canary" }
        ]
      },
      context.headOnly
    );
    return;
  }

  if (context.url.pathname === "/api/crm/v1" || context.url.pathname.startsWith("/api/crm/v1/")) {
    const principal = await requireCrmV1Identity(req, res, config, context);
    if (!principal) return;
    await handleCrmV1(req, res, config, context, principal);
    return;
  }

  if (context.url.pathname === "/api/crm/contracts") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method Not Allowed");
      return;
    }
    const session = await requireCrmApiIdentity(req, res, config, context.headOnly);
    if (!session) {
      return;
    }
    sendJson(res, 200, buildCrmContracts(config, session), context.headOnly);
    return;
  }

  if (context.url.pathname === "/api/crm/contracts/action-preview") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method Not Allowed");
      return;
    }
    const session = await requireCrmApiIdentity(req, res, config, context.headOnly);
    if (!session) {
      return;
    }
    void session;
    const preview = buildActionPreview(
      String(context.url.searchParams.get("scope") ?? ""),
      String(context.url.searchParams.get("record_id") ?? ""),
      String(context.url.searchParams.get("action") ?? "")
    );
    if (!preview) {
      sendJson(
        res,
        404,
        {
          ok: false,
          error: "contract_action_not_found",
          message: "No existe una accion contract-first para el registro solicitado."
        },
        context.headOnly
      );
      return;
    }
    sendJson(res, 200, preview, context.headOnly);
    return;
  }

  if (context.url.pathname.startsWith("/api/")) {
    sendJson(res, 404, { ok: false, error: "not_found", message: "Ruta API no encontrada." });
    return;
  }

  if (context.url.pathname.startsWith("/assets/") || context.url.pathname.startsWith("/public/")) {
    serveStatic(req, res, context.url.pathname, config, release);
    return;
  }

  if (context.url.pathname === "/ui" || context.url.pathname.startsWith("/ui/")) {
    const session = await loadCrmSession(req, res, config);
    if (!session) {
      const returnTo = encodeURIComponent(normalizeReturnTo(withQuery(context.url)));
      sendRedirect(res, 302, `/auth/login?return_to=${returnTo}`, context.headOnly);
      return;
    }
    serveStatic(req, res, context.url.pathname, config, release);
    return;
  }

  sendText(res, 404, "Not Found");
}

function buildPlatformContracts(config: CrmServerConfig) {
  return {
    platform: {
      service: "pyrosa-platform",
      publicBaseUrl: config.platformBaseUrl,
      internalBaseUrl: config.platformInternalBaseUrl,
      owns: ["catalogo de apps", "gobierno visual", "contratos runtime", "estado operativo"]
    },
    iam: {
      service: "pyrosa-iam",
      publicBaseUrl: config.iamBaseUrl,
      internalBaseUrl: config.iamInternalBaseUrl,
      auth: {
        mode: "delegated-ui-auth",
        clientSlug: config.iamClientSlug,
        callbackUrl: config.iamCallbackUrl,
        sessionCheckMs: config.iamSessionCheckMs
      },
      owns: ["autenticacion", "MFA", "tickets ui-auth", "sesiones globales"]
    },
    accounts: {
      service: "pyrosa-accounts",
      publicBaseUrl: config.accountsBaseUrl,
      internalBaseUrl: config.accountsInternalBaseUrl,
      owns: ["centro de cuenta", "perfil de usuario", "preferencias", "autoservicio"]
    }
  };
}

function allowGetOrHead(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === "GET" || req.method === "HEAD") {
    return true;
  }
  sendText(res, 405, "Method Not Allowed");
  return false;
}

async function requireCrmSession(
  req: IncomingMessage,
  res: ServerResponse,
  config: CrmServerConfig,
  headOnly = false
): Promise<CrmSession | null> {
  const session = await loadCrmSession(req, res, config);
  if (!session) {
    sendJson(res, 401, { ok: false, error: "auth_required", message: "Autenticacion requerida." }, headOnly);
    return null;
  }
  return session;
}

async function requireCrmApiIdentity(
  req: IncomingMessage,
  res: ServerResponse,
  config: CrmServerConfig,
  headOnly = false
): Promise<CrmSession | CrmApiPrincipal | null> {
  if (hasApiAuthorization(req)) return authenticateCrmApiBearer(req, config);
  return requireCrmSession(req, res, config, headOnly);
}

async function requireCrmV1Identity(
  req: IncomingMessage,
  res: ServerResponse,
  config: CrmServerConfig,
  context: ReturnType<typeof createRequestContext>
): Promise<CrmSession | CrmApiPrincipal | null> {
  if (hasApiAuthorization(req)) return authenticateCrmApiBearer(req, config);
  const session = await loadCrmSession(req, res, config);
  if (!session) {
    sendCrmV1Error(
      res,
      context,
      new CrmV1Error(401, "auth_required", "Autenticacion requerida.")
    );
    return null;
  }
  return session;
}

function sendRedirect(res: ServerResponse, status: number, location: string, headOnly = false): void {
  const body = `Redirecting to ${location}\n`;
  res.statusCode = status;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Length", headOnly ? "0" : String(Buffer.byteLength(body)));
  res.end(headOnly ? undefined : body);
}

function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/auth/login";
}

function isCrmV1Request(req: IncomingMessage): boolean {
  const pathname = String(req.url ?? "").split("?", 1)[0];
  return pathname === "/api/crm/v1" || pathname.startsWith("/api/crm/v1/");
}

function withQuery(url: URL): string {
  return `${url.pathname}${url.search}`;
}

export function publicSession(
  session: CrmSession,
  tenant: { id: string; label?: string } | null = null
) {
  return {
    csrfToken: session.csrf,
    sid: session.sid,
    expiresAt: session.expiresAt,
    uiAuthSessionId: session.uiAuthSessionId,
    uiAuthAuthenticatedAt: session.uiAuthAuthenticatedAt,
    ...(tenant ? { tenant } : {}),
    user: session.user
  };
}
