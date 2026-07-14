import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type CrmServerConfig = {
  appRoot: string;
  distDir: string;
  host: string;
  port: number;
  version: string;
  branch: string;
  healthPath: string;
  healthDetails: boolean;
  accessLog: boolean;
  dbDsn: string | null;
  dbHost: string;
  dbPort: number;
  dbDatabase: string;
  dbUser: string;
  dbPassword: string;
  dbConnectTimeoutMs: number;
  dbStatementTimeoutMs: number;
  platformBaseUrl: string;
  platformInternalBaseUrl: string;
  iamBaseUrl: string;
  iamInternalBaseUrl: string;
  iamClientSlug: string;
  iamClientSecret: string | null;
  iamCallbackUrl: string;
  iamSessionCheckMs: number;
  oauthApiEnabled: boolean;
  oauthApiIssuer: string;
  oauthApiIntrospectionUrl: string;
  oauthApiClientId: string | null;
  oauthApiClientSecret: string | null;
  oauthApiAudience: string;
  oauthApiReadScope: string;
  oauthApiTimeoutMs: number;
  accountsBaseUrl: string;
  accountsInternalBaseUrl: string;
};

export const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const runtimeDir = dirname(fileURLToPath(import.meta.url));

export function loadConfig(): CrmServerConfig {
  const appRoot = resolve(process.env.PYROSA_CRM_UI_APP_ROOT || resolve(runtimeDir, "../.."));
  const distDir = resolve(process.env.PYROSA_CRM_UI_DIST_DIR || join(appRoot, "dist"));
  const dsn = normalizeOptionalString(process.env.PYROSA_CRM_DB_DSN);
  const discreteDb = dsn ? parsePostgresDsn(dsn) : null;

  return {
    appRoot,
    distDir,
    host: process.env.PYROSA_CRM_UI_HOST || "127.0.0.1",
    port: parsePositiveInteger(process.env.PYROSA_CRM_UI_PORT, 10166),
    version: normalizeOptionalString(process.env.PYROSA_CRM_VERSION) ?? "v2606",
    branch: normalizeOptionalString(process.env.PYROSA_CRM_BRANCH) ?? "main",
    healthPath: process.env.PYROSA_CRM_UI_HEALTH_PATH || "/__pyrosa_crm_health",
    healthDetails: parseBoolean(process.env.PYROSA_CRM_UI_HEALTH_DETAILS, false),
    accessLog: process.env.PYROSA_CRM_UI_ACCESS_LOG !== "0",
    dbDsn: dsn,
    dbHost: process.env.PYROSA_CRM_DB_HOST || discreteDb?.host || "127.0.0.1",
    dbPort: parsePositiveInteger(process.env.PYROSA_CRM_DB_PORT, Number(discreteDb?.port ?? 5432)),
    dbDatabase: process.env.PYROSA_CRM_DB_DATABASE || discreteDb?.database || "app_pyrosa_democrm",
    dbUser: process.env.PYROSA_CRM_DB_USER || discreteDb?.user || "app_pyrosa_democrm",
    dbPassword: process.env.PYROSA_CRM_DB_PASSWORD || discreteDb?.password || "",
    dbConnectTimeoutMs: parsePositiveInteger(process.env.PYROSA_CRM_DB_CONNECT_TIMEOUT_MS, 5000),
    dbStatementTimeoutMs: parsePositiveInteger(process.env.PYROSA_CRM_DB_STATEMENT_TIMEOUT_MS, 15000),
    platformBaseUrl:
      normalizeOptionalString(process.env.PYROSA_CRM_PLATFORM_BASE_URL) ??
      "https://platform.pyrosa.com.do",
    platformInternalBaseUrl:
      normalizeOptionalString(process.env.PYROSA_CRM_PLATFORM_INTERNAL_BASE_URL) ??
      "https://platform.pyrosa.com.do",
    iamBaseUrl:
      normalizeOptionalString(process.env.PYROSA_CRM_IAM_BASE_URL) ??
      "https://iam.pyrosa.com.do",
    iamInternalBaseUrl:
      normalizeOptionalString(process.env.PYROSA_CRM_IAM_INTERNAL_BASE_URL) ??
      "https://iam.pyrosa.com.do",
    iamClientSlug:
      normalizeOptionalString(process.env.PYROSA_CRM_IAM_CLIENT_SLUG) ??
      "crm",
    iamClientSecret:
      normalizeOptionalString(process.env.PYROSA_CRM_IAM_CLIENT_SECRET),
    iamCallbackUrl:
      normalizeOptionalString(process.env.PYROSA_CRM_IAM_CALLBACK_URL) ??
      "https://democrm.pyrosa.com.do/auth/callback",
    iamSessionCheckMs: parsePositiveInteger(process.env.PYROSA_CRM_IAM_SESSION_CHECK_MS, 30000),
    oauthApiEnabled: parseBoolean(process.env.PYROSA_CRM_OAUTH_API_ENABLED, false),
    oauthApiIssuer: normalizeOptionalString(process.env.PYROSA_CRM_OAUTH_API_ISSUER) ?? "https://iam.pyrosa.com.do",
    oauthApiIntrospectionUrl: normalizeOptionalString(process.env.PYROSA_CRM_OAUTH_API_INTROSPECTION_URL) ?? "https://iam.pyrosa.com.do/oauth/introspect",
    oauthApiClientId: normalizeOptionalString(process.env.PYROSA_CRM_OAUTH_API_CLIENT_ID),
    oauthApiClientSecret: normalizeOptionalString(process.env.PYROSA_CRM_OAUTH_API_CLIENT_SECRET),
    oauthApiAudience: normalizeOptionalString(process.env.PYROSA_CRM_OAUTH_API_AUDIENCE) ?? "pyrosa-crm",
    oauthApiReadScope: normalizeOptionalString(process.env.PYROSA_CRM_OAUTH_API_READ_SCOPE) ?? "crm.read",
    oauthApiTimeoutMs: parsePositiveInteger(process.env.PYROSA_CRM_OAUTH_API_TIMEOUT_MS, 4000),
    accountsBaseUrl:
      normalizeOptionalString(process.env.PYROSA_CRM_ACCOUNTS_BASE_URL) ??
      "https://accounts.pyrosa.com.do",
    accountsInternalBaseUrl:
      normalizeOptionalString(process.env.PYROSA_CRM_ACCOUNTS_INTERNAL_BASE_URL) ??
      "https://accounts.pyrosa.com.do"
  };
}

export function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeOptionalString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

type ParsedPostgresDsn = {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
};

function parsePostgresDsn(value: string): ParsedPostgresDsn | null {
  try {
    const url = new URL(value);
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, ""),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password)
    };
  } catch {
    return null;
  }
}
