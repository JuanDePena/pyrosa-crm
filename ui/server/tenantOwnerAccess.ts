import { createHash } from "node:crypto";
import type { CrmServerConfig } from "./config.js";
import { CrmV1Error } from "./crmV1Domain.js";
import type { RequestContext } from "./http.js";
import type { CrmAccessContext, CrmIdentity } from "./crmV1Types.js";
import {
  TenantContextDecisionCache,
  type TenantContextInvalidation
} from "./tenantContextDecisionCache.js";

const applicationSlug = "pyrosa-democrm" as const;
const directoryCatalogContractVersion = "1.1.0" as const;
const directoryDecisionContractVersion = "2.0.0" as const;
const ownerContractVersion = "1.0.0" as const;
const visualCacheFreshMs = 30_000;
const visualCacheStaleMs = 120_000;
const visualCacheMaxEntries = 128;

export type TenantCatalogCandidate = {
  tenantId: string;
  tenantKey: string;
  displayName: string;
  decisionReference: string;
  decisionVersion: string;
  ownerExpiresAt: string;
};

export type TenantCatalogPage = {
  options: TenantCatalogCandidate[];
  hasMore: boolean;
  nextCursor: string | null;
  ownerExpiresAt: string;
  cache: "miss" | "fresh" | "stale";
};

type CatalogSelection =
  | { mode: "page"; query: string | null; cursor: string | null; limit: number }
  | { mode: "resolve"; tenant_key: string };

type OwnerDecision = {
  reference: string;
  version: string;
  expiresAt: string;
  cacheScope?: "subject" | "tenant";
};

type DirectoryProbe = OwnerDecision & {
  allowed: boolean;
  tenantId: string;
  tenantKey: string;
  membershipActive: boolean;
  applicationProjected: boolean;
  requiresNamedSeat: boolean;
  seatActive: boolean;
  reasons: string[];
  contextGeneration: string | null;
};

type StoreProbe = OwnerDecision & {
  allowed: boolean;
  entitlementActive: boolean;
};

type PlatformProbe = OwnerDecision & {
  allowed: boolean;
  tenantId: string;
  tenantKey: string;
  schemaName: string;
  physicalFingerprint: string;
  dictionaryVersion: string;
};

type IamProbe = OwnerDecision & {
  allowed: boolean;
};

type TokenOwner = "directoryCatalog" | "directoryDecision" | "directoryLegacy" | "store" | "platform";
type CachedToken = { token: string; expiresAtMs: number };
type CacheEntry = {
  freshUntil: number;
  staleUntil: number;
  page: TenantCatalogPage | null;
  inFlight: Promise<TenantCatalogPage> | null;
};

let tokenCache = new WeakMap<CrmServerConfig, Map<TokenOwner, CachedToken>>();
let pageCaches = new WeakMap<CrmServerConfig, Map<string, CacheEntry>>();
type CachedCrmAccess = {
  contextGeneration: string | null;
  expiresAt: string;
  tenantId: string;
  value: CrmAccessContext;
};
let decisionCaches = new WeakMap<CrmServerConfig, TenantContextDecisionCache<CachedCrmAccess>>();
const activeDecisionCaches = new Set<TenantContextDecisionCache<CachedCrmAccess>>();
type TenantScopedOwnerCacheEntry<T extends OwnerDecision> = {
  value: T | null;
  expiresAtMs: number;
  inFlight: Promise<T> | null;
};
type TenantScopedOwnerCaches = {
  store: Map<string, TenantScopedOwnerCacheEntry<StoreProbe>>;
  platform: Map<string, TenantScopedOwnerCacheEntry<PlatformProbe>>;
};
let tenantScopedOwnerCaches = new WeakMap<CrmServerConfig, TenantScopedOwnerCaches>();
const activeTenantScopedOwnerCaches = new Set<TenantScopedOwnerCaches>();

export function resetTenantOwnerAccessForTests(): void {
  tokenCache = new WeakMap();
  pageCaches = new WeakMap();
  for (const cache of activeDecisionCaches) cache.clear();
  activeDecisionCaches.clear();
  decisionCaches = new WeakMap();
  for (const caches of activeTenantScopedOwnerCaches) {
    caches.store.clear();
    caches.platform.clear();
  }
  activeTenantScopedOwnerCaches.clear();
  tenantScopedOwnerCaches = new WeakMap();
}

export function invalidateCrmTenantDecisionCaches(invalidation: TenantContextInvalidation): void {
  for (const cache of activeDecisionCaches) cache.invalidate(invalidation);
  const prefix = `${invalidation.tenantId}\u0000`;
  for (const caches of activeTenantScopedOwnerCaches) {
    for (const cache of [caches.store, caches.platform]) {
      for (const key of cache.keys()) {
        if (key.startsWith(prefix)) cache.delete(key);
      }
    }
  }
}

export async function loadTenantCatalogPage(
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  input: { query?: string | null; cursor?: string | null; limit?: number } = {}
): Promise<TenantCatalogPage> {
  requireBrowser(identity);
  const selection: CatalogSelection = {
    mode: "page",
    query: normalizeQuery(input.query),
    cursor: normalizeCursor(input.cursor),
    limit: normalizeLimit(input.limit ?? 24)
  };
  const key = JSON.stringify([
    identity.issuer,
    identity.subject,
    selection.query,
    selection.cursor,
    selection.limit
  ]);
  const cache = pageCache(config);
  const now = Date.now();
  const current = cache.get(key);
  if (current?.page && current.freshUntil > now) {
    touch(cache, key, current);
    return { ...structuredClone(current.page), cache: "fresh" };
  }
  if (current?.page && current.staleUntil > now) {
    if (!current.inFlight) {
      const inFlight = fetchCatalog(
        context,
        config,
        identity,
        selection
      ).then((page) => {
        savePage(cache, key, page);
        return page;
      }).catch((error) => {
        const latest = cache.get(key);
        if (latest) latest.inFlight = null;
        throw error;
      });
      current.inFlight = inFlight;
      void inFlight.catch(() => undefined);
    }
    touch(cache, key, current);
    return { ...structuredClone(current.page), cache: "stale" };
  }
  const page = current?.inFlight ??
    fetchCatalog(context, config, identity, selection);
  const result = await page;
  savePage(cache, key, result);
  return { ...structuredClone(result), cache: "miss" };
}

export async function resolveTenantCatalogCandidate(
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  tenantKey: string
): Promise<TenantCatalogCandidate | null> {
  requireBrowser(identity);
  const result = await fetchCatalog(context, config, identity, {
    mode: "resolve",
    tenant_key: normalizeTenantKey(tenantKey)
  });
  if (result.options.length > 1) {
    throw ownerError("directoryCatalog", "cardinality_invalid");
  }
  return result.options[0] ?? null;
}

export async function resolveInteractiveCrmAccess(
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  requiredCapability: string,
  candidate: TenantCatalogCandidate,
  options: { minimumCachedDecisionRemainingMs?: number } = {}
): Promise<CrmAccessContext> {
  requireCapability(requiredCapability);
  const cache = accessDecisionCache(config);
  const cached = await cache.resolve({
    applicationSlug,
    capability: requiredCapability,
    issuer: identity.issuer,
    principalType: "human",
    subject: identity.subject,
    tenantId: candidate.tenantId
  }, async () => {
    const value = await composeInteractiveCrmAccess(
      context,
      config,
      identity,
      requiredCapability,
      candidate
    );
    const expiresAt = value.ownerDecisions?.application.expiresAt;
    if (!expiresAt) throw new CrmV1Error(503, "crm.tenant_context.expiry_missing", "La decision compuesta no incluyo expiracion.", true);
    return {
      contextGeneration: value.contextGeneration ?? null,
      expiresAt,
      tenantId: value.tenantId,
      value
    };
  }, {
    minimumRemainingMs: options.minimumCachedDecisionRemainingMs
  });
  return cached.value;
}

async function composeInteractiveCrmAccess(
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  requiredCapability: string,
  candidate: TenantCatalogCandidate
): Promise<CrmAccessContext> {
  const [iam, directory, store, platform] = await Promise.all([
    requestIamDecision(context, config, identity, candidate, requiredCapability),
    requestDirectoryDecision(context, config, identity, candidate),
    resolveTenantScopedOwnerDecision(
      config,
      "store",
      `${candidate.tenantId}\u0000${requiredCapability}`,
      () => requestStoreDecision(context, config, identity, candidate, requiredCapability)
    ),
    resolveTenantScopedOwnerDecision(
      config,
      "platform",
      `${candidate.tenantId}\u0000placement`,
      () => requestPlatformDecision(context, config, candidate)
    )
  ]);
  if (!iam.allowed) {
    throw new CrmV1Error(403, "crm.iam.permission_denied", "IAM denegó la capacidad CRM solicitada.");
  }
  if (
    !directory.allowed ||
    !directory.membershipActive ||
    !directory.applicationProjected
  ) {
    throw new CrmV1Error(403, "crm.tenant.membership_required", "La membresía y proyección Directory activas son obligatorias.");
  }
  if (directory.requiresNamedSeat && !directory.seatActive) {
    throw new CrmV1Error(403, "crm.tenant.seat_required", "Directory no confirmó un asiento nominativo activo.");
  }
  if (!store.allowed || !store.entitlementActive) {
    throw new CrmV1Error(403, "crm.entitlement.inactive", "Store no confirmó un entitlement efectivo.");
  }
  if (!platform.allowed) {
    throw new CrmV1Error(503, "crm.platform.not_ready", "Platform no confirmó un placement CRM listo.", true);
  }
  if (
    directory.tenantId !== candidate.tenantId ||
    directory.tenantKey !== candidate.tenantKey ||
    platform.tenantId !== candidate.tenantId ||
    platform.tenantKey !== candidate.tenantKey
  ) {
    throw new CrmV1Error(409, "crm.tenant_context.owner_mismatch", "Los owners discrepan sobre el tenant solicitado.");
  }

  const observedAt = new Date().toISOString();
  const applicationVersion = `sha256:${digest(JSON.stringify({
    capability: requiredCapability,
    directory: directory.version,
    iam: iam.version,
    platform: platform.version,
    store: store.version
  }))}`;
  const earliestOwnerExpiry = earliestIso([
    iam.expiresAt,
    directory.expiresAt,
    store.expiresAt,
    platform.expiresAt
  ]);
  const applicationExpiry = new Date(
    Math.min(
      Date.parse(earliestOwnerExpiry),
      Date.parse(observedAt) + config.tenantContextDecisionCacheMaxMs
    )
  ).toISOString();
  const applicationReference = `crmapp:${digest(
    `${candidate.tenantId}\u0000${identity.subject}\u0000${requiredCapability}\u0000${applicationVersion}`
  )}`;

  return {
    tenantId: candidate.tenantId,
    tenantKey: candidate.tenantKey,
    displayName: candidate.displayName,
    schemaName: platform.schemaName,
    physicalFingerprint: platform.physicalFingerprint,
    dictionaryVersion: platform.dictionaryVersion,
    profileKey: "core",
    profileVersion: "1",
    timezone: "America/Santo_Domingo",
    locale: "es-DO",
    capabilities: [requiredCapability],
    authorizationDecisionId: applicationReference,
    contextVersion: "owner-composed:pending-context-version",
    contextGeneration: directory.contextGeneration,
    decisionReferences: {
      directory: directory.reference,
      store: store.reference,
      platform: platform.reference
    },
    ownerDecisions: {
      iam,
      directory,
      store,
      platform,
      application: {
        reference: applicationReference,
        version: applicationVersion,
        expiresAt: applicationExpiry
      }
    }
  };
}

async function resolveTenantScopedOwnerDecision<Owner extends "store" | "platform">(
  config: CrmServerConfig,
  owner: Owner,
  key: string,
  load: () => Promise<Owner extends "store" ? StoreProbe : PlatformProbe>
): Promise<Owner extends "store" ? StoreProbe : PlatformProbe> {
  const caches = tenantScopedCaches(config);
  const cache = caches[owner] as Map<string, TenantScopedOwnerCacheEntry<StoreProbe | PlatformProbe>>;
  const now = Date.now();
  const current = cache.get(key);
  if (current?.value && current.expiresAtMs > now) {
    return current.value as Owner extends "store" ? StoreProbe : PlatformProbe;
  }
  if (current?.inFlight) {
    return await current.inFlight as Owner extends "store" ? StoreProbe : PlatformProbe;
  }
  const entry: TenantScopedOwnerCacheEntry<StoreProbe | PlatformProbe> = {
    value: null,
    expiresAtMs: 0,
    inFlight: null
  };
  const inFlight = load().then((value) => {
    if (value.cacheScope !== "tenant") {
      throw ownerError(owner, "cache_scope_invalid");
    }
    entry.value = value;
    entry.expiresAtMs = Math.min(
      Date.parse(value.expiresAt),
      Date.now() + config.tenantContextDecisionCacheMaxMs
    );
    entry.inFlight = null;
    return value;
  }).catch((error) => {
    cache.delete(key);
    throw error;
  });
  entry.inFlight = inFlight;
  cache.set(key, entry);
  return await inFlight as Owner extends "store" ? StoreProbe : PlatformProbe;
}

function tenantScopedCaches(config: CrmServerConfig): TenantScopedOwnerCaches {
  const existing = tenantScopedOwnerCaches.get(config);
  if (existing) return existing;
  const caches: TenantScopedOwnerCaches = {
    store: new Map(),
    platform: new Map()
  };
  tenantScopedOwnerCaches.set(config, caches);
  activeTenantScopedOwnerCaches.add(caches);
  return caches;
}

function accessDecisionCache(config: CrmServerConfig): TenantContextDecisionCache<CachedCrmAccess> {
  const existing = decisionCaches.get(config);
  if (existing) return existing;
  const cache = new TenantContextDecisionCache<CachedCrmAccess>(
    config.tenantContextDecisionCacheMaxMs
  );
  decisionCaches.set(config, cache);
  activeDecisionCaches.add(cache);
  return cache;
}

function pageCache(config: CrmServerConfig): Map<string, CacheEntry> {
  let cache = pageCaches.get(config);
  if (!cache) {
    cache = new Map();
    pageCaches.set(config, cache);
  }
  return cache;
}

function savePage(cache: Map<string, CacheEntry>, key: string, page: TenantCatalogPage): void {
  const now = Date.now();
  const ownerExpiresAt = Date.parse(page.ownerExpiresAt);
  const staleUntil = Math.min(now + visualCacheStaleMs, ownerExpiresAt);
  cache.delete(key);
  cache.set(key, {
    page: { ...structuredClone(page), cache: "miss" },
    freshUntil: Math.min(now + visualCacheFreshMs, staleUntil),
    staleUntil,
    inFlight: null
  });
  while (cache.size > visualCacheMaxEntries) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== "string") break;
    cache.delete(oldest);
  }
}

function touch(cache: Map<string, CacheEntry>, key: string, value: CacheEntry): void {
  cache.delete(key);
  cache.set(key, value);
}

async function fetchCatalog(
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  selection: CatalogSelection
): Promise<TenantCatalogPage> {
  const body = {
    contract_version: directoryCatalogContractVersion,
    request_id: context.requestId,
    correlation_id: context.correlationId,
    application_slug: applicationSlug,
    identity: {
      issuer: normalizeIssuer(identity.issuer),
      subject: normalizeSubject(identity.subject)
    },
    selection
  };
  const payload = await postOauthJson(
    config,
    "directoryCatalog",
    endpoint(config.directoryInternalBaseUrl, "/internal/directory/v1/tenant-access-catalog"),
    body
  );
  assertExactKeys(payload, [
    "application_slug", "authority", "contract_version", "correlation_id",
    "expires_at", "observed_at", "request_id", "selection", "tenants"
  ]);
  if (
    payload.contract_version !== directoryCatalogContractVersion ||
    payload.request_id !== context.requestId ||
    payload.correlation_id !== context.correlationId ||
    payload.application_slug !== applicationSlug ||
    payload.authority !== "pyrosa-directory" ||
    !Array.isArray(payload.tenants)
  ) {
    throw ownerError("directoryCatalog", "response_invalid");
  }
  const ownerExpiresAt = futureIso(payload.expires_at);
  const responseSelection = record(payload.selection);
  assertExactKeys(responseSelection, [
    "cardinality", "has_more", "mode", "next_cursor"
  ]);
  if (
    responseSelection.mode !== selection.mode ||
    typeof responseSelection.has_more !== "boolean" ||
    (responseSelection.next_cursor !== null &&
      !/^offset:[0-9]+$/u.test(String(responseSelection.next_cursor)))
  ) {
    throw ownerError("directoryCatalog", "response_invalid");
  }
  const seen = new Set<string>();
  const options = payload.tenants.map((raw) => {
    const value = record(raw);
    assertExactKeys(value, [
      "application_projected", "decision_reference", "decision_version",
      "display_name", "membership_active", "projection_synced_at",
      "seat_active", "tenant_id", "tenant_key"
    ]);
    const tenantKey = normalizeTenantKey(value.tenant_key);
    if (
      seen.has(tenantKey) ||
      value.membership_active !== true ||
      value.application_projected !== true ||
      value.seat_active !== true
    ) {
      throw ownerError("directoryCatalog", "response_invalid");
    }
    seen.add(tenantKey);
    return {
      tenantId: opaque(value.tenant_id),
      tenantKey,
      displayName: boundedText(value.display_name, 180),
      decisionReference: prefixedDigest(value.decision_reference, "dirdec"),
      decisionVersion: sha256(value.decision_version),
      ownerExpiresAt
    };
  });
  return {
    options,
    hasMore: responseSelection.has_more,
    nextCursor: responseSelection.next_cursor === null
      ? null
      : String(responseSelection.next_cursor),
    ownerExpiresAt,
    cache: "miss"
  };
}

async function requestIamDecision(
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  candidate: TenantCatalogCandidate,
  capability: string
): Promise<IamProbe> {
  const token = String(config.iamPolicyDecisionToken ?? "").trim();
  if (token.length < 24) {
    throw ownerError("iam", "not_configured");
  }
  const payload = await postJson(
    "iam",
    safeUrl(config.iamPolicyDecisionUrl, "iam"),
    {
      iam_subject: normalizeSubject(identity.subject),
      tenant_key: candidate.tenantKey,
      capability,
      principal_type: identity.principalType,
      client_id: identity.principalType === "service" ? identity.clientId : null,
      resource: {
        application_slug: applicationSlug,
        operation: "tenant_context_access"
      }
    },
    config.accessTimeoutMs,
    {
      authorization: `Bearer ${token}`,
      "x-pyrosa-request-id": context.requestId,
      "x-pyrosa-service": applicationSlug
    }
  );
  assertExactKeys(payload, [
    "allowed", "bindingVersion", "capability", "decidedAt", "decisionId",
    "expiresAt", "policyVersion", "reasonCode", "subject", "tenantKey",
    "cacheScope"
  ]);
  if (
    typeof payload.allowed !== "boolean" ||
    payload.capability !== capability ||
    payload.subject !== identity.subject ||
    payload.tenantKey !== candidate.tenantKey ||
    payload.cacheScope !== "subject"
  ) {
    throw ownerError("iam", "response_invalid");
  }
  const policyVersion = nullableOpaque(payload.policyVersion);
  const bindingVersion = payload.bindingVersion === null
    ? null
    : positiveInteger(payload.bindingVersion);
  return {
    allowed: payload.allowed,
    cacheScope: "subject",
    reference: opaque(payload.decisionId),
    version: payload.allowed
      ? `iam-policy:${policyVersion ?? "global"}:binding:${bindingVersion ?? 0}`
      : `iam-denied:${opaque(payload.reasonCode)}`,
    expiresAt: futureIso(payload.expiresAt)
  };
}

async function requestDirectoryDecision(
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  candidate: TenantCatalogCandidate
): Promise<DirectoryProbe> {
  const primary = config.directoryDecisionMode === "v1"
    ? await requestDirectoryV1(context, config, identity, candidate)
    : await requestDirectoryV2(context, config, identity, candidate);
  if (config.directoryV1ShadowEnabled && config.directoryDecisionMode === "v2") {
    try {
      const shadow = await requestDirectoryV1(
        context,
        config,
        identity,
        candidate
      );
      logDirectoryShadow(primary, shadow, context);
    } catch {
      console.warn(
        `[crm_directory_shadow] request_id=${context.requestId} outcome=unavailable`
      );
    }
  }
  return primary;
}

async function requestDirectoryV2(
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  candidate: TenantCatalogCandidate
): Promise<DirectoryProbe> {
  const payload = await postOauthJson(config, "directoryDecision", safeUrl(
    config.directoryDecisionUrl,
    "directoryDecision"
  ), {
    contract_version: directoryDecisionContractVersion,
    request_id: context.requestId,
    correlation_id: context.correlationId,
    tenant_id: candidate.tenantId,
    application_slug: applicationSlug,
    identity: {
      issuer: normalizeIssuer(identity.issuer),
      subject: normalizeSubject(identity.subject),
      kind: identity.principalType === "service" ? "service" : "browser"
    }
  });
  const extendedGeneration = Object.hasOwn(payload, "context_generation") ||
    Object.hasOwn(payload, "context_projection_expires_at");
  assertExactKeys(payload, [
    "allowed", "application_projected", "application_slug", "authority",
    "contract_version", "correlation_id", "decision_reference",
    "decision_version", "expires_at", "membership_active", "observed_at",
    "projection_max_staleness_seconds", "projection_synced_at", "reasons",
    "request_id", "requires_named_seat", "seat_active", "tenant_id", "tenant_key",
    "cache_scope",
    ...(extendedGeneration
      ? ["context_generation", "context_projection_expires_at"]
      : [])
  ]);
  if (
    payload.contract_version !== directoryDecisionContractVersion ||
    payload.request_id !== context.requestId ||
    payload.correlation_id !== context.correlationId ||
    payload.authority !== "pyrosa-directory" ||
    payload.tenant_id !== candidate.tenantId ||
    payload.application_slug !== applicationSlug ||
    payload.cache_scope !== "subject" ||
    typeof payload.allowed !== "boolean" ||
    typeof payload.membership_active !== "boolean" ||
    typeof payload.application_projected !== "boolean" ||
    typeof payload.requires_named_seat !== "boolean" ||
    typeof payload.seat_active !== "boolean" ||
    !Array.isArray(payload.reasons) ||
    payload.reasons.some((reason) =>
      typeof reason !== "string" || !/^[a-z][a-z0-9_]{0,63}$/u.test(reason)
    )
  ) {
    throw ownerError("directoryDecision", "response_invalid");
  }
  return {
    allowed: payload.allowed,
    cacheScope: "subject",
    tenantId: opaque(payload.tenant_id),
    tenantKey: normalizeTenantKey(payload.tenant_key),
    membershipActive: payload.membership_active,
    applicationProjected: payload.application_projected,
    requiresNamedSeat: payload.requires_named_seat,
    seatActive: payload.seat_active,
    reasons: payload.reasons as string[],
    reference: prefixedDigest(payload.decision_reference, "dirdec"),
    version: sha256(payload.decision_version),
    expiresAt: futureIso(payload.expires_at),
    contextGeneration: extendedGeneration && payload.context_generation !== null
      ? contextGeneration(payload.context_generation)
      : null
  };
}

async function requestDirectoryV1(
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  candidate: TenantCatalogCandidate
): Promise<DirectoryProbe> {
  const payload = await postOauthJson(config, "directoryLegacy", safeUrl(
    config.directoryLegacyDecisionUrl,
    "directoryLegacy"
  ), {
    contract_version: ownerContractVersion,
    request_id: context.requestId,
    correlation_id: context.correlationId,
    tenant_id: candidate.tenantId,
    application_slug: applicationSlug,
    identity: {
      issuer: normalizeIssuer(identity.issuer),
      subject: normalizeSubject(identity.subject),
      kind: identity.kind,
      principal_type: identity.principalType,
      client_id: identity.clientId
    },
    requested_capability: "crm.dashboard.read"
  });
  if (
    payload.contract_version !== ownerContractVersion ||
    payload.request_id !== context.requestId ||
    payload.correlation_id !== context.correlationId ||
    payload.tenant_id !== candidate.tenantId ||
    payload.application_slug !== applicationSlug ||
    typeof payload.allowed !== "boolean" ||
    typeof payload.membership_active !== "boolean" ||
    typeof payload.seat_active !== "boolean"
  ) {
    throw ownerError("directoryLegacy", "response_invalid");
  }
  const compatibilityExpiry = new Date(Date.now() + 15_000).toISOString();
  return {
    allowed: payload.allowed,
    cacheScope: "subject",
    tenantId: candidate.tenantId,
    tenantKey: normalizeTenantKey(payload.tenant_key),
    membershipActive: payload.membership_active,
    applicationProjected: true,
    requiresNamedSeat: true,
    seatActive: payload.seat_active,
    reasons: payload.allowed ? [] : ["legacy_denied"],
    reference: opaque(payload.authorization_decision_id),
    version: `legacy-v1:${opaque(payload.authorization_decision_id)}`,
    expiresAt: compatibilityExpiry,
    contextGeneration: null
  };
}

async function requestStoreDecision(
  context: RequestContext,
  config: CrmServerConfig,
  identity: CrmIdentity,
  candidate: TenantCatalogCandidate,
  capability: string
): Promise<StoreProbe> {
  const payload = await postOauthJson(
    config,
    "store",
    endpoint(config.storeInternalBaseUrl, "/internal/store/v1/entitlement-decision"),
    {
      contract_version: ownerContractVersion,
      request_id: context.requestId,
      correlation_id: context.correlationId,
      tenant_id: candidate.tenantId,
      application_slug: applicationSlug,
      identity: {
        issuer: normalizeIssuer(identity.issuer),
        subject: normalizeSubject(identity.subject),
        kind: identity.kind,
        principal_type: identity.principalType,
        client_id: identity.clientId
      },
      requested_capability: capability
    }
  );
  if (
    payload.contract_version !== ownerContractVersion ||
    payload.request_id !== context.requestId ||
    payload.correlation_id !== context.correlationId ||
    payload.tenant_id !== candidate.tenantId ||
    payload.application_slug !== applicationSlug ||
    payload.requested_capability !== capability ||
    typeof payload.allowed !== "boolean" ||
    typeof payload.entitlement_active !== "boolean" ||
    payload.cache_scope !== "tenant"
  ) {
    throw ownerError("store", "response_invalid");
  }
  return {
    allowed: payload.allowed,
    cacheScope: "tenant",
    entitlementActive: payload.entitlement_active,
    reference: opaque(payload.authorization_decision_id),
    version: sha256(payload.decision_version),
    expiresAt: futureIso(payload.decision_expires_at)
  };
}

async function requestPlatformDecision(
  context: RequestContext,
  config: CrmServerConfig,
  candidate: TenantCatalogCandidate
): Promise<PlatformProbe> {
  const payload = await postOauthJson(
    config,
    "platform",
    safeUrl(config.platformTenantContextDecisionUrl, "platform"),
    {
      application_slug: applicationSlug,
      contract_version: ownerContractVersion,
      request_id: context.requestId,
      tenant_id: candidate.tenantId
    }
  );
  assertExactKeys(payload, [
    "application_slug", "contract_version", "database_name",
    "cache_scope",
    "decision_reference", "dictionary_version", "expires_at",
    "physical_fingerprint", "placement_version", "readiness_status", "ready",
    "request_id", "schema_name", "schema_scope", "status", "tenant_id", "tenant_key"
  ]);
  if (
    payload.application_slug !== applicationSlug ||
    payload.cache_scope !== "tenant" ||
    payload.contract_version !== ownerContractVersion ||
    payload.request_id !== context.requestId ||
    payload.tenant_id !== candidate.tenantId ||
    payload.tenant_key !== candidate.tenantKey ||
    payload.schema_scope !== "tenant-product" ||
    payload.readiness_status !== "ready" ||
    payload.ready !== true ||
    payload.status !== "active"
  ) {
    throw ownerError("platform", "response_invalid");
  }
  const schemaName = String(payload.schema_name ?? "").trim().toLowerCase();
  if (
    !/^pyrosa_(?:demo)?crm_[0-9a-f]{12}$/u.test(schemaName) ||
    !schemaName.endsWith(`_${candidate.tenantKey}`)
  ) {
    throw ownerError("platform", "schema_invalid");
  }
  return {
    allowed: true,
    cacheScope: "tenant",
    tenantId: candidate.tenantId,
    tenantKey: candidate.tenantKey,
    schemaName,
    physicalFingerprint: sha256(payload.physical_fingerprint),
    dictionaryVersion: sha256(payload.placement_version),
    reference: prefixedDigest(payload.decision_reference, "placement"),
    version: sha256(payload.placement_version),
    expiresAt: futureIso(payload.expires_at)
  };
}

async function postOauthJson(
  config: CrmServerConfig,
  owner: TokenOwner,
  url: URL,
  body: unknown
): Promise<Record<string, unknown>> {
  let token = await ownerToken(config, owner);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await postJson(owner, url, body, config.accessTimeoutMs, {
        authorization: `Bearer ${token}`
      });
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof OwnerHttpError &&
        error.status === 401
      ) {
        tokenMap(config).delete(owner);
        token = await ownerToken(config, owner);
        continue;
      }
      throw error;
    }
  }
  throw ownerError(owner, "decision_failed");
}

class OwnerHttpError extends CrmV1Error {
  constructor(readonly status: number, code: string, message: string, retryable: boolean) {
    super(status >= 500 ? 503 : status, code, message, retryable);
  }
}

async function postJson(
  owner: string,
  url: URL,
  body: unknown,
  timeoutMs: number,
  extraHeaders: Record<string, string>
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...extraHeaders
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw ownerError(owner, "unavailable", true);
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new OwnerHttpError(
        response.status,
        `crm.${owner}.rate_limited`,
        `El owner ${owner} limitó temporalmente la validación. DemoCRM reintentará de forma controlada.`,
        true
      );
    }
    throw new OwnerHttpError(
      response.status,
      `crm.${owner}.decision_failed`,
      `El owner ${owner} no pudo completar la decisión.`,
      response.status >= 500
    );
  }
  try {
    return record(await response.json());
  } catch {
    throw ownerError(owner, "response_invalid");
  }
}

async function ownerToken(
  config: CrmServerConfig,
  owner: TokenOwner
): Promise<string> {
  const cache = tokenMap(config);
  const current = cache.get(owner);
  if (current && current.expiresAtMs - 60_000 > Date.now()) return current.token;
  const oauth = ownerOauth(config, owner);
  let response: Response;
  try {
    response = await fetch(safeUrl(oauth.tokenUrl, owner), {
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
    throw ownerError(owner, "oauth_unavailable", true);
  }
  if (!response.ok) throw ownerError(owner, "oauth_rejected", true);
  const payload = record(await response.json());
  const token = String(payload.access_token ?? "");
  const expiresIn = Number(payload.expires_in);
  if (
    token.length < 20 ||
    /\s/u.test(token) ||
    String(payload.token_type ?? "").toLowerCase() !== "bearer" ||
    payload.scope !== oauth.scope ||
    !Number.isSafeInteger(expiresIn) ||
    expiresIn < 60 ||
    expiresIn > 3600
  ) {
    throw ownerError(owner, "oauth_response_invalid");
  }
  cache.set(owner, {
    token,
    expiresAtMs: Date.now() + expiresIn * 1000
  });
  return token;
}

function tokenMap(config: CrmServerConfig): Map<TokenOwner, CachedToken> {
  let map = tokenCache.get(config);
  if (!map) {
    map = new Map();
    tokenCache.set(config, map);
  }
  return map;
}

function ownerOauth(config: CrmServerConfig, owner: TokenOwner): {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  audience: string;
  scope: string;
} {
  const values = owner === "directoryCatalog"
    ? {
        tokenUrl: config.directoryOauthTokenUrl,
        clientId: config.directoryCatalogOauthClientId,
        clientSecret: config.directoryCatalogOauthClientSecret,
        audience: "pyrosa-directory",
        scope: "directory:tenant-access-catalog:read"
      }
    : owner === "directoryDecision"
      ? {
          tokenUrl: config.directoryOauthTokenUrl,
          clientId: config.directoryDecisionOauthClientId,
          clientSecret: config.directoryDecisionOauthClientSecret,
          audience: "pyrosa-directory",
          scope: "directory:application-access:decide"
        }
      : owner === "directoryLegacy"
        ? {
            tokenUrl: config.directoryOauthTokenUrl,
            clientId: config.directoryOauthClientId,
            clientSecret: config.directoryOauthClientSecret,
            audience: "pyrosa-directory",
            scope: "directory:crm-access:decide"
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
              tokenUrl: config.platformPlacementOauthTokenUrl,
              clientId: config.platformPlacementOauthClientId,
              clientSecret: config.platformPlacementOauthClientSecret,
              audience: config.platformPlacementOauthAudience,
              scope: config.platformPlacementOauthScope
            };
  const secret = String(values.clientSecret ?? "");
  if (secret.length < 32) throw ownerError(owner, "oauth_not_configured", true);
  return { ...values, clientSecret: secret };
}

function logDirectoryShadow(
  primary: DirectoryProbe,
  shadow: DirectoryProbe,
  context: RequestContext
): void {
  const matches =
    primary.allowed === shadow.allowed &&
    primary.tenantId === shadow.tenantId &&
    primary.tenantKey === shadow.tenantKey &&
    primary.membershipActive === shadow.membershipActive &&
    primary.seatActive === shadow.seatActive;
  console.info(
    `[crm_directory_shadow] request_id=${context.requestId} outcome=${matches ? "match" : "mismatch"} primary=v2 shadow=v1`
  );
}

function endpoint(base: string, pathname: string): URL {
  return safeUrl(new URL(pathname, base).toString(), pathname);
}

function safeUrl(value: string, owner: string): URL {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) throw new Error("unsafe");
    return url;
  } catch {
    throw ownerError(owner, "not_configured", true);
  }
}

function assertExactKeys(value: Record<string, unknown>, keys: string[]): void {
  const observed = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    observed.length !== expected.length ||
    expected.some((key, index) => key !== observed[index])
  ) {
    throw ownerError("contract", "response_invalid");
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw ownerError("contract", "response_invalid");
  }
  return value as Record<string, unknown>;
}

function requireBrowser(identity: CrmIdentity): void {
  if (identity.kind !== "browser" || identity.principalType !== "human") {
    throw new CrmV1Error(403, "crm.tenant_context.browser_required", "El catálogo interactivo requiere una sesión browser humana.");
  }
}

function requireCapability(value: string): void {
  if (!/^crm\.[a-z0-9]+(?:[._:-][a-z0-9]+)*$/u.test(value) || value.includes("*")) {
    throw new CrmV1Error(400, "crm.capability.invalid", "La capacidad CRM solicitada no es válida.");
  }
}

function normalizeIssuer(value: string): string {
  const url = safeUrl(value, "iam");
  if (url.pathname !== "/") throw ownerError("iam", "issuer_invalid");
  return url.origin;
}

function normalizeSubject(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._~-][A-Za-z0-9._~-]{0,199}$/u.test(normalized)) {
    throw ownerError("iam", "subject_invalid");
  }
  return normalized;
}

function normalizeTenantKey(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{12}$/u.test(normalized)) {
    throw ownerError("directory", "tenant_key_invalid");
  }
  return normalized;
}

function normalizeQuery(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return boundedText(value, 160);
}

function normalizeCursor(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value);
  if (!/^offset:[0-9]+$/u.test(normalized)) {
    throw new CrmV1Error(400, "crm.tenant_options.cursor_invalid", "El cursor del catálogo no es válido.");
  }
  return normalized;
}

function normalizeLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 50) {
    throw new CrmV1Error(400, "crm.tenant_options.limit_invalid", "El límite debe estar entre 1 y 50.");
  }
  return value;
}

function opaque(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:@/+~-]{0,199}$/u.test(normalized)) {
    throw ownerError("contract", "opaque_invalid");
  }
  return normalized;
}

function nullableOpaque(value: unknown): string | null {
  return value === null ? null : opaque(value);
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw ownerError("contract", "integer_invalid");
  }
  return Number(value);
}

function boundedText(value: unknown, max: number): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw ownerError("contract", "text_invalid");
  }
  return normalized;
}

function sha256(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/u.test(normalized)) {
    throw ownerError("contract", "version_invalid");
  }
  return normalized;
}

function contextGeneration(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!/^ctxgen:sha256:[0-9a-f]{64}$/u.test(normalized)) {
    throw ownerError("directoryDecision", "response_invalid");
  }
  return normalized;
}

function prefixedDigest(value: unknown, prefix: "dirdec" | "placement"): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!new RegExp(`^${prefix}:[0-9a-f]{64}$`, "u").test(normalized)) {
    throw ownerError("contract", "reference_invalid");
  }
  return normalized;
}

function futureIso(value: unknown): string {
  const epoch = Date.parse(String(value ?? ""));
  if (!Number.isFinite(epoch) || epoch <= Date.now()) {
    throw ownerError("contract", "expiry_invalid");
  }
  return new Date(epoch).toISOString();
}

function earliestIso(values: string[]): string {
  return new Date(Math.min(...values.map((value) => Date.parse(value)))).toISOString();
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function ownerError(owner: string, suffix: string, retryable = false): CrmV1Error {
  return new CrmV1Error(
    retryable ? 503 : 502,
    `crm.${owner}.${suffix}`,
    `El contrato del owner ${owner} no pudo validarse.`,
    retryable
  );
}
