import assert from "node:assert/strict";
import test from "node:test";

import {
  TenantContextDecisionCache,
  TenantContextDecisionCacheError,
  type TenantContextCacheableDecision
} from "./tenantContextDecisionCache.js";

const identity = {
  applicationSlug: "pyrosa-democrm", capability: "crm.access", issuer: "https://iam.pyrosa.com.do",
  principalType: "human", subject: "user-1", tenantId: "tenant-1"
};

test("deduplicates misses and rejects an old generation after invalidation", async () => {
  const now = Date.parse("2026-08-11T00:00:00.000Z");
  let calls = 0;
  const cache = new TenantContextDecisionCache<TenantContextCacheableDecision & { serial: number }>(30_000, 8, () => now);
  const loader = async () => ({
    contextGeneration: `ctxgen:sha256:${"a".repeat(64)}`,
    expiresAt: new Date(now + 60_000).toISOString(), tenantId: "tenant-1", serial: ++calls
  });
  const results = await Promise.all([cache.resolve(identity, loader), cache.resolve(identity, loader)]);
  assert.equal(results[0].serial, results[1].serial);
  assert.equal(calls, 1);
  cache.invalidate({ contextGeneration: `ctxgen:sha256:${"b".repeat(64)}`, projectionVersion: 2, tenantId: "tenant-1" });
  await assert.rejects(() => cache.resolve(identity, loader), TenantContextDecisionCacheError);
});

test("refreshes a cached decision inside the proactive renewal window", async () => {
  const now = Date.parse("2026-08-11T00:00:00.000Z");
  let calls = 0;
  const cache = new TenantContextDecisionCache<
    TenantContextCacheableDecision & { serial: number }
  >(30_000, 8, () => now);
  const loader = async () => ({
    expiresAt: new Date(now + 20_000 + calls * 20_000).toISOString(),
    tenantId: "tenant-1",
    serial: ++calls
  });
  assert.equal((await cache.resolve(identity, loader)).serial, 1);
  assert.equal(
    (
      await cache.resolve(identity, loader, {
        minimumRemainingMs: 15_000
      })
    ).serial,
    1
  );
  assert.equal(
    (
      await cache.resolve(identity, loader, {
        minimumRemainingMs: 25_000
      })
    ).serial,
    2
  );
});
