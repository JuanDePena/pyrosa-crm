import type { IncomingMessage } from "node:http";
import type { CrmSession } from "./auth.js";
import type { CrmServerConfig } from "./config.js";
import { CrmV1Error, assertCapability } from "./crmV1Domain.js";
import type { RequestContext } from "./http.js";
import type { CrmApiPrincipal } from "./oauthApiAuth.js";
import type { CrmAccessContext, CrmIdentity } from "./crmV1Types.js";

const contractVersion = "1.0.0" as const;
const applicationSlug = "pyrosa-democrm" as const;
const legacyCrmReadCapabilities = new Set([
  "crm.accounts.read",
  "crm.activities.read",
  "crm.appointments.read",
  "crm.cases.read",
  "crm.config.read",
  "crm.contacts.read",
  "crm.dashboard.read",
  "crm.imports.read",
  "crm.opportunities.read",
  "crm.reports.read"
]);

type DecisionRequest = {
  contract_version: typeof contractVersion;
  request_id: string;
  correlation_id: string;
  tenant_id: string;
  application_slug: typeof applicationSlug;
  identity: { issuer: string; subject: string; kind: "browser" | "oauth-api" };
  requested_capability: string;
};

type DirectoryDecision = {
  contract_version: typeof contractVersion;
  request_id: string;
  correlation_id: string;
  tenant_id: string;
  tenant_key: string;
  application_slug: typeof applicationSlug;
  allowed: boolean;
  membership_active: boolean;
  seat_active: boolean;
  display_name: string;
  roles: string[];
  capabilities: string[];
  authorization_decision_id: string;
  profile_key: string | null;
  profile_version: string | null;
  timezone: string | null;
  locale: string | null;
};

type StoreDecision = {
  contract_version: typeof contractVersion;
  request_id: string;
  correlation_id: string;
  tenant_id: string;
  application_slug: typeof applicationSlug;
  requested_capability: string;
  allowed: boolean;
  entitlement_active: boolean;
  seat_active: boolean;
  requires_named_seat: boolean;
  subscription_kind: "trial" | "paid" | "missing" | "ambiguous";
  subscription_status: string;
  trial_status: string;
  entitlement_status: string;
  starts_at: string | null;
  ends_at: string | null;
  reason_code: string;
  authorization_decision_id: string;
};

type PlatformDecision = {
  allowed: boolean;
  application_slug: typeof applicationSlug;
  authorization_decision_id: string;
  contract_version: typeof contractVersion;
  correlation_id: string;
  dictionary_version: string | null;
  physical_fingerprint: string | null;
  readiness_status: string;
  ready: boolean;
  request_id: string;
  schema_name: string | null;
  tenant_id: string;
};

type Owner = "directory" | "store" | "platform";
type OwnerOauthConfig = {
  audience: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  tokenUrl: string;
};
type CachedToken = { value: string; expiresAtMs: number };
type OwnerTokenProvider = { getToken(): Promise<string>; invalidate(): void };

const ownerContract = {
  directory: {
    audience: "pyrosa-directory",
    clientId: "client-pyrosa-democrm",
    scope: "directory:crm-access:decide"
  },
  store: {
    audience: "pyrosa-store",
    clientId: "client-pyrosa-democrm-store-entitlements",
    scope: "store.entitlement.decide"
  },
  platform: {
    audience: "pyrosa-platform",
    clientId: "client-pyrosa-crm",
    scope: "platform.provisioning.readiness.consume"
  }
} as const;

let tokenProviders = new WeakMap<CrmServerConfig, Map<Owner, OwnerTokenProvider>>();

export function resetCrmOwnerTokenProvidersForTests(): void {
  tokenProviders = new WeakMap<CrmServerConfig, Map<Owner, OwnerTokenProvider>>();
}

export function identityFromPrincipal(
  principal: CrmSession | CrmApiPrincipal,
  config: CrmServerConfig
): CrmIdentity {
  if ((principal as CrmApiPrincipal).kind === "oauth-api") {
    const api = principal as CrmApiPrincipal;
    return {
      kind: "oauth-api",
      issuer: normalizeHttpsIssuer(api.issuer),
      subject: api.subject,
      roles: api.roles,
      scopes: api.scopes
    };
  }
  const session = principal as CrmSession;
  if (!Number.isSafeInteger(session.user.id) || session.user.id <= 0) {
    throw responseError("crm.identity.invalid", "IAM no devolvio una identidad browser valida.");
  }
  return {
    kind: "browser",
    issuer: normalizeHttpsIssuer(config.iamBaseUrl),
    subject: `iam-user-${session.user.id}`,
    roles: [session.user.role],
    scopes: []
  };
}

export async function resolveCrmAccess(
  req: IncomingMessage,
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  requiredCapability: string
): Promise<CrmAccessContext> {
  const tenantId = requestedTenant(req, config);
  if (!/^crm\.[a-z0-9]+(?:[._:-][a-z0-9]+)*$/u.test(requiredCapability) || requiredCapability.includes("*")) {
    throw responseError("crm.capability.invalid", "La capacidad CRM solicitada no es valida.");
  }
  const identityIssuer = normalizeHttpsIssuer(identity.issuer);
  if (identityIssuer !== normalizeHttpsIssuer(config.iamBaseUrl)) {
    throw responseError("crm.identity.invalid", "El issuer de la identidad no coincide con la autoridad IAM configurada.");
  }
  const body: DecisionRequest = {
    contract_version: contractVersion,
    request_id: context.requestId,
    correlation_id: context.correlationId,
    tenant_id: tenantId,
    application_slug: applicationSlug,
    identity: {
      issuer: identityIssuer,
      subject: ownerIdentitySubject(identity.subject),
      kind: identity.kind
    },
    requested_capability: requiredCapability
  };

  const [directory, store, platform] = await Promise.all([
    postDecision(config, "directory", config.directoryInternalBaseUrl, "/internal/directory/v1/crm-access-decision", body),
    postDecision(config, "store", config.storeInternalBaseUrl, "/internal/store/v1/entitlement-decision", body),
    postDecision(config, "platform", config.platformInternalBaseUrl, "/internal/platform/v1/application-readiness-decision", body)
  ]);

  const directoryDecision = validateDirectoryDecision(directory, body);
  const storeDecision = validateStoreDecision(store, body);
  const platformDecision = validatePlatformDecision(platform, body);

  if (
    directoryDecision.allowed !== true ||
    directoryDecision.membership_active !== true
  ) {
    throw new CrmV1Error(403, "crm.tenant.membership_required", "La membresia activa del tenant es obligatoria.");
  }
  if (directoryDecision.seat_active !== true) {
    throw new CrmV1Error(403, "crm.tenant.seat_required", "La aplicacion requiere un asiento activo.");
  }
  if (
    storeDecision.allowed !== true ||
    storeDecision.entitlement_active !== true ||
    storeDecision.entitlement_status !== "effective"
  ) {
    throw new CrmV1Error(403, "crm.entitlement.inactive", "La suscripcion no habilita CRM para este tenant.");
  }
  if (
    platformDecision.allowed !== true ||
    platformDecision.ready !== true ||
    platformDecision.readiness_status !== "ready"
  ) {
    throw new CrmV1Error(503, "crm.platform.not_ready", "El schema CRM del tenant aun no esta listo.", true);
  }

  const tenantKey = tenantKeyValue(directoryDecision.tenant_key);
  const schemaName = schemaValue(platformDecision.schema_name, tenantKey);
  const directoryCapabilities = directoryDecision.capabilities;
  const capabilities = identity.kind === "oauth-api"
    ? directoryCapabilities.filter((capability) => oauthAllows(identity.scopes, capability))
    : directoryCapabilities;
  assertCapability(capabilities, requiredCapability);
  return {
    tenantId,
    tenantKey,
    displayName: directoryDecision.display_name,
    schemaName,
    dictionaryVersion: opaque(platformDecision.dictionary_version, "dictionary_version"),
    profileKey: directoryDecision.profile_key ?? "core",
    profileVersion: directoryDecision.profile_version ?? "1",
    timezone: directoryDecision.timezone ?? "America/Santo_Domingo",
    locale: directoryDecision.locale ?? "es-DO",
    capabilities,
    authorizationDecisionId: directoryDecision.authorization_decision_id
  };
}

function requestedTenant(req: IncomingMessage, config: CrmServerConfig): string {
  const header = Array.isArray(req.headers["x-pyrosa-tenant-id"])
    ? req.headers["x-pyrosa-tenant-id"][0]
    : req.headers["x-pyrosa-tenant-id"];
  const value = String(header ?? config.defaultTenantId ?? "").trim();
  if (!/^[A-Za-z0-9_.:-]{3,128}$/.test(value)) {
    throw new CrmV1Error(400, "crm.tenant.required", "No se pudo resolver un tenant autorizado para la solicitud.");
  }
  return value;
}

async function postDecision(
  config: CrmServerConfig,
  owner: Owner,
  baseUrl: string,
  pathname: string,
  body: DecisionRequest
): Promise<unknown> {
  const url = ownerUrl(baseUrl, pathname, owner);
  const provider = tokenProvider(config, owner);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await provider.getToken();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.accessTimeoutMs)
      });
    } catch {
      throw new CrmV1Error(503, `crm.${owner}.unavailable`, `El owner ${owner} no esta disponible.`, true);
    }
    if (response.status === 401 && attempt === 0) {
      provider.invalidate();
      continue;
    }
    if (!response.ok) {
      throw new CrmV1Error(
        response.status >= 500 ? 503 : 403,
        `crm.${owner}.decision_failed`,
        `El owner ${owner} no pudo autorizar la solicitud.`,
        response.status >= 500
      );
    }
    try {
      const payload = await response.json() as unknown;
      if (!isRecord(payload)) throw new Error("invalid");
      return payload;
    } catch {
      throw responseError(`crm.${owner}.response_invalid`, `El owner ${owner} devolvio una respuesta invalida.`);
    }
  }
  throw new CrmV1Error(403, `crm.${owner}.decision_failed`, `El owner ${owner} no pudo autorizar la solicitud.`);
}

function tokenProvider(config: CrmServerConfig, owner: Owner): OwnerTokenProvider {
  let byOwner = tokenProviders.get(config);
  if (!byOwner) {
    byOwner = new Map<Owner, OwnerTokenProvider>();
    tokenProviders.set(config, byOwner);
  }
  let provider = byOwner.get(owner);
  if (!provider) {
    provider = createOwnerTokenProvider(config, ownerOauthConfig(config, owner));
    byOwner.set(owner, provider);
  }
  return provider;
}

function createOwnerTokenProvider(config: CrmServerConfig, oauth: OwnerOauthConfig): OwnerTokenProvider {
  let cached: CachedToken | null = null;
  let pending: Promise<CachedToken> | null = null;

  async function requestToken(): Promise<CachedToken> {
    let response: Response;
    try {
      response = await fetch(oauth.tokenUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Basic ${Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          audience: oauth.audience,
          grant_type: "client_credentials",
          scope: oauth.scope
        }),
        signal: AbortSignal.timeout(config.accessTimeoutMs)
      });
    } catch {
      throw new CrmV1Error(503, "crm.owner_oauth.unavailable", "IAM no pudo emitir la credencial OAuth de un owner CRM.", true);
    }
    if (!response.ok) {
      throw new CrmV1Error(503, "crm.owner_oauth.rejected", "IAM rechazo la credencial OAuth de un owner CRM.", true);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw responseError("crm.owner_oauth.response_invalid", "IAM devolvio una respuesta OAuth invalida.");
    }
    if (!isRecord(payload)) {
      throw responseError("crm.owner_oauth.response_invalid", "IAM devolvio una respuesta OAuth invalida.");
    }
    const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
    const tokenType = typeof payload.token_type === "string" ? payload.token_type.toLowerCase() : "";
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : Number.NaN;
    if (
      accessToken.length < 20 ||
      accessToken !== accessToken.trim() ||
      /\s/u.test(accessToken) ||
      tokenType !== "bearer" ||
      !Number.isInteger(expiresIn) ||
      expiresIn < 60 ||
      expiresIn > 3600 ||
      payload.scope !== oauth.scope
    ) {
      throw responseError("crm.owner_oauth.response_invalid", "IAM devolvio una credencial OAuth incompleta.");
    }
    return { value: accessToken, expiresAtMs: Date.now() + expiresIn * 1000 };
  }

  return {
    async getToken() {
      if (cached && cached.expiresAtMs - 60_000 > Date.now()) return cached.value;
      pending ??= requestToken().finally(() => { pending = null; });
      cached = await pending;
      return cached.value;
    },
    invalidate() {
      cached = null;
    }
  };
}

function ownerOauthConfig(config: CrmServerConfig, owner: Owner): OwnerOauthConfig {
  const values = owner === "directory"
    ? {
        tokenUrl: config.directoryOauthTokenUrl,
        clientId: config.directoryOauthClientId,
        clientSecret: config.directoryOauthClientSecret,
        audience: config.directoryOauthAudience,
        scope: config.directoryOauthScope
      }
    : owner === "store"
      ? {
          tokenUrl: config.storeOauthTokenUrl,
          clientId: config.storeOauthClientId,
          clientSecret: config.storeOauthClientSecret,
          audience: config.storeOauthAudience,
          scope: config.storeOauthScope
        }
      : {
          tokenUrl: config.platformOauthTokenUrl,
          clientId: config.platformOauthClientId,
          clientSecret: config.platformOauthClientSecret,
          audience: config.platformOauthAudience,
          scope: config.platformOauthScope
        };
  const expected = ownerContract[owner];
  if (
    values.clientId !== expected.clientId ||
    values.audience !== expected.audience ||
    values.scope !== expected.scope ||
    !values.clientSecret ||
    Buffer.byteLength(values.clientSecret, "utf8") < 32
  ) {
    throw new CrmV1Error(503, `crm.${owner}.oauth_not_configured`, `OAuth2 client_credentials para ${owner} no esta configurado.`, true);
  }
  return {
    tokenUrl: validateTokenUrl(values.tokenUrl, config.iamBaseUrl, owner),
    clientId: values.clientId,
    clientSecret: values.clientSecret,
    audience: values.audience,
    scope: values.scope
  };
}

function validateTokenUrl(value: string, issuerValue: string, owner: Owner): string {
  let tokenUrl: URL;
  let issuer: URL;
  try {
    tokenUrl = new URL(value);
    issuer = new URL(issuerValue);
  } catch {
    throw new CrmV1Error(503, `crm.${owner}.oauth_not_configured`, `El endpoint OAuth de ${owner} no es valido.`, true);
  }
  if (
    issuer.protocol !== "https:" ||
    tokenUrl.protocol !== "https:" ||
    tokenUrl.origin !== issuer.origin ||
    tokenUrl.username ||
    tokenUrl.password ||
    tokenUrl.search ||
    tokenUrl.hash
  ) {
    throw new CrmV1Error(503, `crm.${owner}.oauth_not_configured`, `El endpoint OAuth de ${owner} debe pertenecer al origin IAM HTTPS.`, true);
  }
  return tokenUrl.toString();
}

function validateDirectoryDecision(value: unknown, request: DecisionRequest): DirectoryDecision {
  const decision = exactRecord(value, [
    "contract_version", "request_id", "correlation_id", "tenant_id", "tenant_key",
    "application_slug", "allowed", "membership_active", "seat_active", "display_name",
    "roles", "capabilities", "authorization_decision_id", "profile_key", "profile_version",
    "timezone", "locale"
  ]);
  assertEcho(decision, request);
  return {
    contract_version: contractVersion,
    request_id: request.request_id,
    correlation_id: request.correlation_id,
    tenant_id: request.tenant_id,
    tenant_key: tenantKeyValue(decision.tenant_key),
    application_slug: applicationSlug,
    allowed: booleanValue(decision.allowed),
    membership_active: booleanValue(decision.membership_active),
    seat_active: booleanValue(decision.seat_active),
    display_name: boundedText(decision.display_name, "display_name", 180),
    roles: strictStringList(decision.roles, "roles"),
    capabilities: strictStringList(decision.capabilities, "capabilities", /^crm\./u),
    authorization_decision_id: opaque(decision.authorization_decision_id, "authorization_decision_id"),
    profile_key: nullableText(decision.profile_key, "profile_key", 160),
    profile_version: nullableText(decision.profile_version, "profile_version", 80),
    timezone: nullableText(decision.timezone, "timezone", 80),
    locale: nullableText(decision.locale, "locale", 32)
  };
}

function validateStoreDecision(value: unknown, request: DecisionRequest): StoreDecision {
  const decision = exactRecord(value, [
    "contract_version", "request_id", "correlation_id", "tenant_id", "application_slug",
    "requested_capability", "allowed", "entitlement_active", "seat_active",
    "requires_named_seat", "subscription_kind", "subscription_status", "trial_status",
    "entitlement_status", "starts_at", "ends_at", "reason_code", "authorization_decision_id"
  ]);
  assertEcho(decision, request);
  if (decision.requested_capability !== request.requested_capability) invalidOwnerResponse();
  const subscriptionKind = boundedText(decision.subscription_kind, "subscription_kind", 32);
  if (!["trial", "paid", "missing", "ambiguous"].includes(subscriptionKind)) invalidOwnerResponse();
  return {
    contract_version: contractVersion,
    request_id: request.request_id,
    correlation_id: request.correlation_id,
    tenant_id: request.tenant_id,
    application_slug: applicationSlug,
    requested_capability: request.requested_capability,
    allowed: booleanValue(decision.allowed),
    entitlement_active: booleanValue(decision.entitlement_active),
    seat_active: booleanValue(decision.seat_active),
    requires_named_seat: booleanValue(decision.requires_named_seat),
    subscription_kind: subscriptionKind as StoreDecision["subscription_kind"],
    subscription_status: boundedText(decision.subscription_status, "subscription_status", 64),
    trial_status: boundedText(decision.trial_status, "trial_status", 64),
    entitlement_status: boundedText(decision.entitlement_status, "entitlement_status", 64),
    starts_at: nullableIsoDate(decision.starts_at),
    ends_at: nullableIsoDate(decision.ends_at),
    reason_code: opaque(decision.reason_code, "reason_code"),
    authorization_decision_id: opaque(decision.authorization_decision_id, "authorization_decision_id")
  };
}

function validatePlatformDecision(value: unknown, request: DecisionRequest): PlatformDecision {
  const decision = exactRecord(value, [
    "allowed", "application_slug", "authorization_decision_id", "contract_version",
    "correlation_id", "dictionary_version", "physical_fingerprint", "readiness_status",
    "ready", "request_id", "schema_name", "tenant_id"
  ]);
  assertEcho(decision, request);
  const fingerprint = nullableText(decision.physical_fingerprint, "physical_fingerprint", 80);
  if (fingerprint !== null && !/^sha256:[a-f0-9]{64}$/u.test(fingerprint)) invalidOwnerResponse();
  return {
    allowed: booleanValue(decision.allowed),
    application_slug: applicationSlug,
    authorization_decision_id: opaque(decision.authorization_decision_id, "authorization_decision_id"),
    contract_version: contractVersion,
    correlation_id: request.correlation_id,
    dictionary_version: nullableText(decision.dictionary_version, "dictionary_version", 80),
    physical_fingerprint: fingerprint,
    readiness_status: boundedText(decision.readiness_status, "readiness_status", 64),
    ready: booleanValue(decision.ready),
    request_id: request.request_id,
    schema_name: nullableText(decision.schema_name, "schema_name", 63),
    tenant_id: request.tenant_id
  };
}

function assertEcho(value: Record<string, unknown>, request: DecisionRequest): void {
  if (
    value.contract_version !== request.contract_version ||
    value.request_id !== request.request_id ||
    value.correlation_id !== request.correlation_id ||
    value.tenant_id !== request.tenant_id ||
    value.application_slug !== request.application_slug
  ) invalidOwnerResponse();
}

function oauthAllows(scopes: string[], capability: string): boolean {
  if (scopes.includes(capability)) return true;
  return scopes.includes("crm.read") && legacyCrmReadCapabilities.has(capability);
}

function normalizeHttpsIssuer(value: unknown): string {
  let issuer: URL;
  try {
    issuer = new URL(String(value ?? ""));
  } catch {
    throw responseError("crm.identity.invalid", "El issuer IAM de la identidad no es valido.");
  }
  if (
    issuer.protocol !== "https:" ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    issuer.pathname !== "/"
  ) {
    throw responseError("crm.identity.invalid", "El issuer de la identidad debe ser el origin IAM HTTPS.");
  }
  return issuer.origin;
}

function ownerIdentitySubject(value: string): string {
  const subject = value.startsWith("client:") ? value.slice("client:".length) : value;
  if (subject.length < 3 || subject.length > 160 || !/^[A-Za-z0-9._~-]+$/u.test(subject)) {
    throw responseError("crm.identity.invalid", "El subject IAM no es un identificador opaco valido.");
  }
  return subject;
}

function ownerUrl(baseUrl: string, pathname: string, owner: Owner): URL {
  try {
    const base = new URL(baseUrl);
    const url = new URL(pathname, base);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.origin !== base.origin ||
      url.pathname !== pathname
    ) throw new Error("unsafe");
    return url;
  } catch {
    throw new CrmV1Error(503, `crm.${owner}.not_configured`, `El owner ${owner} no esta configurado.`, true);
  }
}

function tenantKeyValue(value: unknown): string {
  const key = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{12}$/u.test(key)) invalidOwnerResponse();
  return key;
}

function schemaValue(value: unknown, tenantKey: string): string {
  const schema = String(value ?? "").trim().toLowerCase();
  if (!/^pyrosa_(?:demo)?crm_[a-f0-9]{12}$/u.test(schema) || !schema.endsWith(`_${tenantKey}`)) {
    throw responseError("crm.platform.schema_invalid", "Platform devolvio un schema CRM invalido.");
  }
  return schema;
}

function exactRecord(value: unknown, fields: string[]): Record<string, unknown> {
  if (!isRecord(value)) invalidOwnerResponse();
  const observed = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (observed.length !== expected.length || expected.some((field, index) => observed[index] !== field)) {
    invalidOwnerResponse();
  }
  return value;
}

function strictStringList(value: unknown, field: string, pattern?: RegExp): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) invalidOwnerResponse();
  const normalized = value.map((item) => String(item).trim());
  if (
    normalized.some((item) => !item || item.length > 160 || item.includes("*") || (pattern && !pattern.test(item))) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw responseError("crm.access.response_invalid", `${field} no es valido.`);
  }
  return normalized;
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") invalidOwnerResponse();
  return value;
}

function boundedText(value: unknown, field: string, maxLength: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw responseError("crm.access.response_invalid", `${field} no es valido.`);
  }
  return normalized;
}

function nullableText(value: unknown, field: string, maxLength: number): string | null {
  if (value === null) return null;
  return boundedText(value, field, maxLength);
}

function nullableIsoDate(value: unknown): string | null {
  if (value === null) return null;
  const normalized = boundedText(value, "date", 64);
  if (!Number.isFinite(Date.parse(normalized))) invalidOwnerResponse();
  return normalized;
}

function opaque(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:@/+~-]{0,199}$/u.test(normalized)) {
    throw responseError("crm.access.response_invalid", `${field} no es valido.`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidOwnerResponse(): never {
  throw responseError("crm.access.response_invalid", "Un owner devolvio un contrato CRM inconsistente.");
}

function responseError(code: string, message: string): CrmV1Error {
  return new CrmV1Error(502, code, message);
}
