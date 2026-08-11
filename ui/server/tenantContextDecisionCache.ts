export type TenantContextDecisionIdentity = {
  applicationSlug: string;
  capability: string;
  issuer: string;
  principalType: string;
  subject: string;
  tenantId: string;
};

export type TenantContextCacheableDecision = {
  contextGeneration?: string | null;
  expiresAt: string;
  tenantId: string;
};

export type TenantContextInvalidation = {
  contextGeneration: string;
  projectionVersion: number;
  tenantId: string;
};

export type TenantContextDecisionCacheResolveOptions = {
  minimumRemainingMs?: number;
};

export class TenantContextDecisionCacheError extends Error {
  constructor(readonly code: "tenant_context_generation_stale" | "tenant_context_expiry_invalid") {
    super(code);
    this.name = "TenantContextDecisionCacheError";
  }
}

type CacheEntry<T> = { expiresAtMs: number; tenantId: string; value: T };
type KnownHead = { contextGeneration: string; projectionVersion: number };

export class TenantContextDecisionCache<T extends TenantContextCacheableDecision> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();
  private readonly heads = new Map<string, KnownHead>();

  constructor(
    private readonly maxLifetimeMs = 30_000,
    private readonly maxEntries = 256,
    private readonly clock: () => number = Date.now
  ) {}

  async resolve(
    identity: TenantContextDecisionIdentity,
    loader: () => Promise<T>,
    options: TenantContextDecisionCacheResolveOptions = {}
  ): Promise<T> {
    const key = keyOf(identity);
    const cached = this.entries.get(key);
    const minimumRemainingMs = normalizeMinimumRemainingMs(
      options.minimumRemainingMs
    );
    if (
      cached &&
      cached.expiresAtMs - this.clock() > minimumRemainingMs &&
      this.matchesHead(cached.value)
    ) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.value;
    }
    this.entries.delete(key);
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const pending = loader().then((value) => {
      if (value.tenantId !== identity.tenantId || !this.matchesHead(value)) {
        throw new TenantContextDecisionCacheError("tenant_context_generation_stale");
      }
      const ownerExpiryMs = Date.parse(value.expiresAt);
      const nowMs = this.clock();
      if (!Number.isFinite(ownerExpiryMs) || ownerExpiryMs <= nowMs) {
        throw new TenantContextDecisionCacheError("tenant_context_expiry_invalid");
      }
      if ((value as T & { allowed?: boolean }).allowed === false) return value;
      this.entries.set(key, {
        expiresAtMs: Math.min(ownerExpiryMs, nowMs + this.maxLifetimeMs),
        tenantId: value.tenantId,
        value
      });
      while (this.entries.size > this.maxEntries) {
        const oldest = this.entries.keys().next().value as string | undefined;
        if (!oldest) break;
        this.entries.delete(oldest);
      }
      return value;
    }).finally(() => {
      if (this.inflight.get(key) === pending) this.inflight.delete(key);
    });
    this.inflight.set(key, pending);
    return pending;
  }

  invalidate(value: TenantContextInvalidation): boolean {
    const current = this.heads.get(value.tenantId);
    if (current && value.projectionVersion < current.projectionVersion) return false;
    if (current && value.projectionVersion === current.projectionVersion && value.contextGeneration === current.contextGeneration) return false;
    this.heads.set(value.tenantId, {
      contextGeneration: value.contextGeneration,
      projectionVersion: value.projectionVersion
    });
    for (const [key, entry] of this.entries) {
      if (entry.tenantId === value.tenantId) this.entries.delete(key);
    }
    return true;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
    this.heads.clear();
  }

  get size(): number { return this.entries.size; }

  private matchesHead(value: T): boolean {
    const head = this.heads.get(value.tenantId);
    return !head || value.contextGeneration === head.contextGeneration;
  }
}

function normalizeMinimumRemainingMs(value: number | undefined): number {
  if (value === undefined) return 0;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function keyOf(identity: TenantContextDecisionIdentity): string {
  return [identity.issuer, identity.subject, identity.principalType, identity.applicationSlug, identity.tenantId, identity.capability].join("\u001f");
}
