import type { IncomingMessage } from "node:http";
import { CrmAuthError } from "./auth.js";
import type { CrmServerConfig } from "./config.js";

export type CrmApiPrincipal = {
  kind: "oauth-api";
  issuer: string;
  subject: string;
  audience: string;
  clientId: string;
  principalType: "human" | "service";
  roles: string[];
  scopes: string[];
  expiresAt: string;
};

type Introspection = Record<string, unknown> & {
  active?: boolean; token_type?: string; issuer?: string; iss?: string;
  sub?: string; aud?: string | string[]; client_id?: string;
  client_record_id?: string; client_slug?: string; principal_type?: string; scope?: string;
  exp?: number; iat?: number; roles?: unknown; groups?: unknown;
};

export function hasApiAuthorization(req: IncomingMessage): boolean {
  return req.headers.authorization !== undefined;
}

export async function authenticateCrmApiBearer(
  req: IncomingMessage,
  config: CrmServerConfig,
  requiredScopes: string[] = [config.oauthApiReadScope]
): Promise<CrmApiPrincipal> {
  if (!config.oauthApiEnabled) throw new CrmAuthError(503, "oauth_api_disabled", "El resource server OAuth de CRM no esta habilitado.");
  if (!config.oauthApiClientId || !config.oauthApiClientSecret || !config.oauthApiIntrospectionUrl) {
    throw new CrmAuthError(503, "oauth_api_not_configured", "La introspeccion IAM de CRM no esta configurada.");
  }
  const introspectionUrl = validateIntrospectionEndpoint(config.oauthApiIntrospectionUrl, config.oauthApiIssuer);
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? ""));
  if (!match?.[1]?.trim()) throw new CrmAuthError(401, "bearer_token_missing", "Se requiere un bearer IAM.");

  let response: Response;
  try {
    response = await fetch(introspectionUrl, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${config.oauthApiClientId}:${config.oauthApiClientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json"
      },
      body: new URLSearchParams({ token: match[1].trim(), token_type_hint: "access_token" }),
      signal: AbortSignal.timeout(config.oauthApiTimeoutMs)
    });
  } catch {
    throw new CrmAuthError(503, "iam_introspection_unavailable", "IAM no pudo validar el bearer de CRM.");
  }
  if (!response.ok) throw new CrmAuthError(503, "iam_introspection_unavailable", "IAM no pudo validar el bearer de CRM.");

  let token: Introspection;
  try {
    const payload = await response.json() as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid payload");
    token = payload as Introspection;
  } catch {
    throw new CrmAuthError(503, "iam_introspection_invalid", "IAM devolvio una respuesta de introspeccion invalida.");
  }
  const now = Math.floor(Date.now() / 1000);
  const issuer = strictString(token.issuer ?? token.iss)?.replace(/\/+$/, "");
  const audiences = Array.isArray(token.aud) ? token.aud.filter(isString) : strictString(token.aud) ? [String(token.aud)] : [];
  const scopes = splitClaim(token.scope);
  const subject = strictString(token.sub);
  const clientId = strictString(token.client_record_id) ?? strictString(token.client_id);
  const clientSlug = strictString(token.client_slug) ?? strictString(token.client_id);
  const expiresAt = Number(token.exp);
  const issuedAt = Number(token.iat);

  if (token.active !== true) throw new CrmAuthError(401, "bearer_token_inactive", "El bearer IAM no esta activo.");
  if (token.token_type !== "access_token") throw new CrmAuthError(401, "bearer_token_type_invalid", "IAM no devolvio un access token.");
  if (issuer !== config.oauthApiIssuer.replace(/\/+$/, "")) throw new CrmAuthError(401, "bearer_token_issuer_invalid", "Issuer IAM invalido.");
  if (!audiences.includes(config.oauthApiAudience)) throw new CrmAuthError(401, "bearer_token_audience_invalid", "Audience CRM invalida.");
  if (typeof token.exp !== "number" || !Number.isFinite(expiresAt) || expiresAt <= now) throw new CrmAuthError(401, "bearer_token_expired", "El bearer IAM expiro.");
  if (typeof token.iat !== "number" || !Number.isFinite(issuedAt) || issuedAt > now + 60 || issuedAt > expiresAt) throw new CrmAuthError(401, "bearer_token_iat_invalid", "El bearer IAM no declara un tiempo de emision valido.");
  if (!subject || !clientId || !clientSlug) throw new CrmAuthError(401, "bearer_token_principal_invalid", "El bearer IAM no declara principal canonico.");
  if (token.principal_type !== "human" && token.principal_type !== "service") throw new CrmAuthError(401, "bearer_token_principal_invalid", "Tipo de principal IAM invalido.");
  if (token.principal_type === "service" && subject !== `client:${clientSlug}`) throw new CrmAuthError(401, "bearer_token_principal_invalid", "El subject IAM no corresponde al slug del servicio.");
  if (!requiredScopes.every((scope) => scopes.includes(scope))) throw new CrmAuthError(403, "oauth_scope_missing", "El principal no tiene el scope CRM requerido.");

  return {
    kind: "oauth-api", issuer, subject, audience: config.oauthApiAudience, clientId,
    principalType: token.principal_type,
    roles: unique([...claimList(token.roles), ...claimList(token.groups)]),
    scopes, expiresAt: new Date(expiresAt * 1000).toISOString()
  };
}

function optionalString(value: unknown): string | null { const normalized = String(value ?? "").trim(); return normalized || null; }
function splitClaim(value: unknown): string[] { return typeof value === "string" ? unique(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)) : []; }
function claimList(value: unknown): string[] { return Array.isArray(value) ? value.filter(isString).map((item) => item.trim()).filter(Boolean) : []; }
function isString(value: unknown): value is string { return typeof value === "string"; }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function strictString(value: unknown): string | null { return typeof value === "string" ? optionalString(value) : null; }

function validateIntrospectionEndpoint(endpoint: string, issuer: string): string {
  let url: URL; let issuerUrl: URL;
  try { url = new URL(endpoint); issuerUrl = new URL(issuer); }
  catch { throw new CrmAuthError(503, "oauth_api_not_configured", "El endpoint de introspeccion IAM es invalido."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.origin !== issuerUrl.origin) {
    throw new CrmAuthError(503, "oauth_api_not_configured", "El endpoint de introspeccion debe ser HTTPS y del mismo origin que IAM.");
  }
  return url.toString();
}
