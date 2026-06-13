import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CrmServerConfig } from "./config.js";

export type CrmSessionUser = {
  id: number;
  email: string;
  displayName: string;
  role: string;
  locale: string;
  timezone: string;
  status: string;
  primaryEmail: CrmPrimaryEmail;
  security: CrmSecuritySignals;
};

export type CrmPrimaryEmail = {
  email: string;
  verifiedAt: string | null;
  isVerified: boolean;
};

export type CrmSecuritySignals = {
  mfaRequired: boolean;
  activeMfaMethods: number;
};

export type CrmSession = {
  sid: string;
  user: CrmSessionUser;
  csrf: string;
  uiAuthSessionId: string;
  uiAuthParentSessionId: string | null;
  uiAuthAuthenticatedAt: string;
  uiAuthLastCheckedAt: string;
  expiresAt: string;
};

type UiAuthExchangeResult = {
  session?: {
    sessionId?: string;
    parentSessionId?: string | null;
    authenticatedAt?: string;
    expiresAt?: string;
  };
  user?: {
    id?: number;
    email?: string;
    displayName?: string | null;
    role?: string;
    locale?: string;
    timezone?: string;
    status?: string;
  };
  primaryEmail?: {
    email?: string;
    verifiedAt?: string | null;
    isVerified?: boolean;
  } | null;
  security?: {
    mfaRequired?: boolean;
    activeMfaMethods?: number;
  } | null;
};

type UiAuthIntrospectionResult = {
  active?: boolean;
  session?: UiAuthExchangeResult["session"] | null;
  user?: UiAuthExchangeResult["user"] | null;
  primaryEmail?: UiAuthExchangeResult["primaryEmail"] | null;
  security?: UiAuthExchangeResult["security"] | null;
};

const sessionCookieName = "PYROSA_CRM_SESSION";
const sessionTtlMs = 24 * 60 * 60 * 1000;

export class CrmAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function buildLoginRedirect(config: CrmServerConfig, returnTo: string): string {
  assertAuthConfigured(config);
  const authorizeUrl = new URL("/ui-auth/authorize", ensureAbsoluteUrl(config.iamBaseUrl));
  authorizeUrl.searchParams.set("client", config.iamClientSlug);
  authorizeUrl.searchParams.set("return_to", ensureAbsoluteUrl(config.iamCallbackUrl));
  authorizeUrl.searchParams.set("state", encodeState({ returnTo: normalizeReturnTo(returnTo) }));
  return authorizeUrl.toString();
}

export function buildLogoutRedirect(req: IncomingMessage, config: CrmServerConfig): string {
  const logoutUrl = new URL("/logout", ensureAbsoluteUrl(config.iamBaseUrl));
  logoutUrl.searchParams.set("return_to", absoluteUrl(req, "/auth/login"));
  return logoutUrl.toString();
}

export async function createSessionFromTicket(
  req: IncomingMessage,
  config: CrmServerConfig,
  ticket: string
): Promise<CrmSession> {
  const exchange = await postUiAuthJson<UiAuthExchangeResult>(req, config, "/internal/ui-auth/exchange-ticket", {
    ticket: normalizeOpaqueToken(ticket, "ticket")
  });
  return normalizeExchange(exchange);
}

export async function loadCrmSession(
  req: IncomingMessage,
  res: ServerResponse | null,
  config: CrmServerConfig
): Promise<CrmSession | null> {
  const rawCookie = parseCookies(req.headers.cookie)[sessionCookieName];
  const session = rawCookie ? verifySessionCookie(config, rawCookie) : null;
  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt).valueOf() <= Date.now()) {
    if (res) {
      clearSessionCookie(req, res);
    }
    return null;
  }

  const lastCheckedAt = new Date(session.uiAuthLastCheckedAt).valueOf();
  if (
    Number.isFinite(lastCheckedAt) &&
    Date.now() - lastCheckedAt < config.iamSessionCheckMs &&
    sessionHasStrictIdentitySignals(session)
  ) {
    return session;
  }

  try {
    const introspection = await postUiAuthJson<UiAuthIntrospectionResult>(
      req,
      config,
      "/internal/ui-auth/introspect-session",
      {
        sessionId: session.uiAuthSessionId,
        touch: true
      }
    );
    if (!introspection.active || !introspection.session || !introspection.user) {
      if (res) {
        clearSessionCookie(req, res);
      }
      return null;
    }

    const refreshed = normalizeExchange(
      {
        session: introspection.session,
        user: introspection.user,
        primaryEmail: introspection.primaryEmail ?? session.user.primaryEmail,
        security: introspection.security ?? session.user.security
      },
      session
    );
    if (res) {
      setSessionCookie(req, res, config, refreshed);
    }
    return refreshed;
  } catch (error) {
    if (error instanceof CrmAuthError && error.status >= 400 && error.status < 500) {
      if (res) {
        clearSessionCookie(req, res);
      }
      return null;
    }
    return session;
  }
}

export function setSessionCookie(
  req: IncomingMessage,
  res: ServerResponse,
  config: CrmServerConfig,
  session: CrmSession
): void {
  appendSetCookie(
    res,
    serializeCookie(sessionCookieName, signSessionCookie(config, session), {
      httpOnly: true,
      maxAge: Math.trunc(sessionTtlMs / 1000),
      path: "/",
      sameSite: "Lax",
      secure: isSecureRequest(req)
    })
  );
}

export function clearSessionCookie(req: IncomingMessage, res: ServerResponse): void {
  appendSetCookie(
    res,
    serializeCookie(sessionCookieName, "", {
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "Lax",
      secure: isSecureRequest(req)
    })
  );
}

export function encodeState(state: { returnTo: string }): string {
  return Buffer.from(JSON.stringify({ returnTo: normalizeReturnTo(state.returnTo) }), "utf8").toString("base64url");
}

export function decodeState(rawState: string | null | undefined): { returnTo: string } | null {
  const normalized = String(rawState ?? "").trim();
  if (!normalized) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(normalized, "base64url").toString("utf8")) as { returnTo?: unknown };
    return { returnTo: normalizeReturnTo(String(parsed.returnTo ?? "")) };
  } catch {
    throw new CrmAuthError(400, "auth_state_invalid", "El parametro state no tiene un formato valido.");
  }
}

export function normalizeReturnTo(value: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "/") {
    return "/ui";
  }
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/ui";
  }
  if (normalized.startsWith("/auth/") || normalized.startsWith("/logout") || normalized.startsWith("/api/")) {
    return "/ui";
  }
  return normalized;
}

export function absoluteUrl(req: IncomingMessage, path: string): string {
  const proto = String(req.headers["x-forwarded-proto"] ?? "").trim().toLowerCase() === "https" ? "https" : "http";
  const host = String(req.headers.host ?? "").trim() || "democrm.pyrosa.com.do";
  return new URL(path, `${proto}://${host}`).toString();
}

function normalizeExchange(input: UiAuthExchangeResult, existingSession?: CrmSession): CrmSession {
  const userId = Number(input.user?.id ?? 0);
  const sessionId = String(input.session?.sessionId ?? "").trim();
  if (!Number.isInteger(userId) || userId <= 0 || !sessionId) {
    throw new CrmAuthError(502, "ui_auth_exchange_invalid", "Pyrosa IAM devolvio una sesion incompleta.");
  }

  const fallbackEmail = String(input.user?.email ?? "");
  return {
    sid: existingSession?.sid ?? randomBytes(16).toString("hex"),
    user: {
      id: userId,
      email: fallbackEmail,
      displayName: String(input.user?.displayName ?? input.user?.email ?? "Usuario"),
      role: String(input.user?.role ?? "user"),
      locale: String(input.user?.locale ?? "es"),
      timezone: String(input.user?.timezone ?? "America/Santo_Domingo"),
      status: String(input.user?.status ?? "active"),
      primaryEmail: normalizePrimaryEmail(input.primaryEmail ?? existingSession?.user.primaryEmail, fallbackEmail),
      security: normalizeSecuritySignals(input.security ?? existingSession?.user.security)
    },
    csrf: existingSession?.csrf ?? randomBytes(16).toString("hex"),
    uiAuthSessionId: sessionId,
    uiAuthParentSessionId: input.session?.parentSessionId ?? null,
    uiAuthAuthenticatedAt: String(input.session?.authenticatedAt ?? new Date().toISOString()),
    uiAuthLastCheckedAt: new Date().toISOString(),
    expiresAt: String(input.session?.expiresAt ?? new Date(Date.now() + sessionTtlMs).toISOString())
  };
}

function normalizePrimaryEmail(
  input: UiAuthExchangeResult["primaryEmail"] | undefined | null,
  fallbackEmail: string
): CrmPrimaryEmail {
  const email = String(input?.email ?? fallbackEmail ?? "").trim();
  const verifiedAt = normalizeOptionalIso(input?.verifiedAt);
  return {
    email,
    verifiedAt,
    isVerified: Boolean(input?.isVerified === true && verifiedAt !== null)
  };
}

function normalizeSecuritySignals(input: UiAuthExchangeResult["security"] | undefined | null): CrmSecuritySignals {
  const activeMfaMethods = Number(input?.activeMfaMethods ?? 0);
  return {
    mfaRequired: input?.mfaRequired === true,
    activeMfaMethods: Number.isInteger(activeMfaMethods) && activeMfaMethods >= 0 ? activeMfaMethods : 0
  };
}

function sessionHasStrictIdentitySignals(session: CrmSession): boolean {
  return Boolean(session.user.primaryEmail && session.user.security);
}

function normalizeOptionalIso(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (text === "") {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

async function postUiAuthJson<ResponsePayload>(
  req: IncomingMessage,
  config: CrmServerConfig,
  path: string,
  payload: Record<string, unknown>
): Promise<ResponsePayload> {
  assertAuthConfigured(config);
  const response = await fetch(new URL(path, ensureAbsoluteUrl(config.iamInternalBaseUrl)), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pyrosa-auth-client": config.iamClientSlug,
      "x-pyrosa-auth-client-secret": String(config.iamClientSecret ?? ""),
      ...forwardedRequestHeaders(req)
    },
    body: JSON.stringify({
      ...payload,
      ...forwardedRequestBody(req)
    })
  });

  const text = await response.text();
  const parsed = parseJson(text);
  if (!response.ok) {
    const errorPayload = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : null;
    throw new CrmAuthError(
      response.status,
      typeof errorPayload?.code === "string" ? errorPayload.code : "ui_auth_failed",
      typeof errorPayload?.message === "string" ? errorPayload.message : `Pyrosa IAM respondio ${response.status}.`
    );
  }
  return parsed as ResponsePayload;
}

function assertAuthConfigured(config: CrmServerConfig): void {
  if (!ensureAbsoluteUrl(config.iamBaseUrl)) {
    throw new CrmAuthError(503, "iam_base_missing", "Falta configurar Pyrosa IAM publico.");
  }
  if (!ensureAbsoluteUrl(config.iamInternalBaseUrl)) {
    throw new CrmAuthError(503, "iam_internal_missing", "Falta configurar Pyrosa IAM interno.");
  }
  if (!config.iamClientSlug.trim()) {
    throw new CrmAuthError(503, "iam_client_missing", "Falta configurar el client_slug.");
  }
  if (!String(config.iamClientSecret ?? "").trim()) {
    throw new CrmAuthError(503, "iam_secret_missing", "Falta configurar el secreto delegado.");
  }
  if (!ensureAbsoluteUrl(config.iamCallbackUrl)) {
    throw new CrmAuthError(503, "iam_callback_missing", "Falta configurar la callback.");
  }
}

function signSessionCookie(config: CrmServerConfig, session: CrmSession): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${signature(config, payload)}`;
}

function verifySessionCookie(config: CrmServerConfig, value: string): CrmSession | null {
  const [payload, signed] = value.split(".");
  if (!payload || !signed) {
    return null;
  }
  const expected = signature(config, payload);
  const expectedBuffer = Buffer.from(expected);
  const signedBuffer = Buffer.from(signed);
  if (expectedBuffer.length !== signedBuffer.length || !timingSafeEqual(expectedBuffer, signedBuffer)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CrmSession;
    return parsed?.sid && parsed?.user && parsed?.uiAuthSessionId ? parsed : null;
  } catch {
    return null;
  }
}

function signature(config: CrmServerConfig, payload: string): string {
  return createHmac("sha256", String(config.iamClientSecret ?? ""))
    .update(payload)
    .digest("base64url");
}

function ensureAbsoluteUrl(value: string): string {
  try {
    const parsed = new URL(String(value ?? "").trim());
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function normalizeOpaqueToken(value: string, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9:_-]{8,256}$/.test(normalized)) {
    throw new CrmAuthError(400, "validation_error", `${label} no tiene un formato valido.`);
  }
  return normalized;
}

function forwardedRequestHeaders(req: IncomingMessage): Record<string, string> {
  const remoteIp = getClientIp(req);
  const userAgent = normalizeHeader(req.headers["user-agent"]);
  return {
    ...(remoteIp ? { "x-pyrosa-auth-remote-ip": remoteIp } : {}),
    ...(userAgent ? { "x-pyrosa-auth-user-agent": userAgent } : {})
  };
}

function forwardedRequestBody(req: IncomingMessage): Record<string, string> {
  const remoteIp = getClientIp(req);
  const userAgent = normalizeHeader(req.headers["user-agent"]);
  return {
    ...(remoteIp ? { remoteIp } : {}),
    ...(userAgent ? { userAgent } : {})
  };
}

function getClientIp(req: IncomingMessage): string | null {
  const forwarded = normalizeHeader(req.headers["x-forwarded-for"]);
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return req.socket.remoteAddress ?? null;
}

function normalizeHeader(value: string | string[] | undefined): string | null {
  const normalized = String(Array.isArray(value) ? value[0] : value ?? "").trim();
  return normalized ? normalized : null;
}

function parseJson(body: string): unknown {
  const normalized = body.trim();
  if (!normalized) {
    return {};
  }
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new CrmAuthError(502, "ui_auth_invalid_json", "Pyrosa IAM devolvio JSON invalido.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of String(header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  }
  return cookies;
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
  }
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  return parts.join("; ");
}

function appendSetCookie(res: ServerResponse, value: string): void {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", value);
    return;
  }
  res.setHeader("Set-Cookie", Array.isArray(existing) ? [...existing, value] : [String(existing), value]);
}

function isSecureRequest(req: IncomingMessage): boolean {
  return String(req.headers["x-forwarded-proto"] ?? "").trim().toLowerCase() === "https";
}
