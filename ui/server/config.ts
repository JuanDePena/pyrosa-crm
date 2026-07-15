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
  directoryInternalBaseUrl: string;
  storeInternalBaseUrl: string;
  directoryOauthTokenUrl: string;
  directoryOauthClientId: string;
  directoryOauthClientSecret: string | null;
  directoryOauthAudience: string;
  directoryOauthScope: string;
  storeOauthTokenUrl: string;
  storeOauthClientId: string;
  storeOauthClientSecret: string | null;
  storeOauthAudience: string;
  storeOauthScope: string;
  platformOauthTokenUrl: string;
  platformOauthClientId: string;
  platformOauthClientSecret: string | null;
  platformOauthAudience: string;
  platformOauthScope: string;
  accessTimeoutMs: number;
  defaultTenantId: string | null;
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
  const iamBaseUrl = normalizeOptionalString(process.env.PYROSA_CRM_IAM_BASE_URL) ?? "https://iam.pyrosa.com.do";
  const oauthTokenUrl = new URL("/oauth/token", iamBaseUrl).toString();

  return {
    appRoot,
    distDir,
    host: process.env.PYROSA_CRM_UI_HOST || "127.0.0.1",
    port: parsePositiveInteger(process.env.PYROSA_CRM_UI_PORT, 10166),
    version: normalizeOptionalString(process.env.PYROSA_CRM_VERSION) ?? "v2607",
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
    iamBaseUrl,
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
      "https://accounts.pyrosa.com.do",
    directoryInternalBaseUrl:
      normalizeOptionalString(process.env.PYROSA_CRM_DIRECTORY_INTERNAL_BASE_URL) ??
      "https://directory.pyrosa.com.do",
    storeInternalBaseUrl:
      normalizeOptionalString(process.env.PYROSA_CRM_STORE_INTERNAL_BASE_URL) ??
      "https://store.pyrosa.com.do",
    directoryOauthTokenUrl: normalizeOptionalString(process.env.PYROSA_CRM_DIRECTORY_OAUTH_TOKEN_URL) ?? oauthTokenUrl,
    directoryOauthClientId:
      normalizeOptionalString(process.env.PYROSA_CRM_DIRECTORY_OAUTH_CLIENT_ID) ??
      "client-pyrosa-democrm",
    directoryOauthClientSecret: normalizeOptionalString(process.env.PYROSA_CRM_DIRECTORY_OAUTH_CLIENT_SECRET),
    directoryOauthAudience:
      normalizeOptionalString(process.env.PYROSA_CRM_DIRECTORY_OAUTH_AUDIENCE) ??
      "pyrosa-directory",
    directoryOauthScope:
      normalizeOptionalString(process.env.PYROSA_CRM_DIRECTORY_OAUTH_SCOPE) ??
      "directory:crm-access:decide",
    storeOauthTokenUrl: normalizeOptionalString(process.env.PYROSA_CRM_STORE_OAUTH_TOKEN_URL) ?? oauthTokenUrl,
    storeOauthClientId:
      normalizeOptionalString(process.env.PYROSA_CRM_STORE_OAUTH_CLIENT_ID) ??
      "client-pyrosa-democrm-store-entitlements",
    storeOauthClientSecret: normalizeOptionalString(process.env.PYROSA_CRM_STORE_OAUTH_CLIENT_SECRET),
    storeOauthAudience:
      normalizeOptionalString(process.env.PYROSA_CRM_STORE_OAUTH_AUDIENCE) ??
      "pyrosa-store",
    storeOauthScope:
      normalizeOptionalString(process.env.PYROSA_CRM_STORE_OAUTH_SCOPE) ??
      "store.entitlement.decide",
    platformOauthTokenUrl: normalizeOptionalString(process.env.PYROSA_CRM_PLATFORM_OAUTH_TOKEN_URL) ?? oauthTokenUrl,
    platformOauthClientId:
      normalizeOptionalString(process.env.PYROSA_CRM_PLATFORM_OAUTH_CLIENT_ID) ??
      "client-pyrosa-crm",
    platformOauthClientSecret: normalizeOptionalString(process.env.PYROSA_CRM_PLATFORM_OAUTH_CLIENT_SECRET),
    platformOauthAudience:
      normalizeOptionalString(process.env.PYROSA_CRM_PLATFORM_OAUTH_AUDIENCE) ??
      "pyrosa-platform",
    platformOauthScope:
      normalizeOptionalString(process.env.PYROSA_CRM_PLATFORM_OAUTH_SCOPE) ??
      "platform.provisioning.readiness.consume",
    accessTimeoutMs: parsePositiveInteger(process.env.PYROSA_CRM_ACCESS_TIMEOUT_MS, 4000),
    defaultTenantId: normalizeOptionalString(process.env.PYROSA_CRM_DEFAULT_TENANT_ID)
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
