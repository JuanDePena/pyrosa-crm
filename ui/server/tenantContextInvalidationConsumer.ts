import type { TenantContextInvalidation } from "./tenantContextDecisionCache.js";

export type DirectoryInvalidationConsumerConfig = {
  ackUrl: string | null; audience: string | null; claimUrl: string | null;
  clientId: string | null; clientSecret: string | null;
  consumer: "pyrosa-demoerp" | "pyrosa-democrm" | "pyrosa-newsync";
  enabled: boolean; pollMs: number; scope: string | null; timeoutMs: number; tokenUrl: string | null;
};

type Delivery = { eventId: string; invalidation: TenantContextInvalidation; leaseToken: string };

export function createDirectoryInvalidationConsumer(
  config: DirectoryInvalidationConsumerConfig,
  invalidate: (value: TenantContextInvalidation) => void,
  fetcher: typeof fetch = fetch,
  logger: Pick<Console, "error" | "info"> = console
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let token: { expiresAtMs: number; value: string } | null = null;
  const setting = (value: string | null, name: string) => {
    const normalized = String(value ?? "").trim();
    if (!normalized) throw new Error(`tenant_context_invalidation_${name}_not_configured`);
    return normalized;
  };
  const request = (url: string, init: RequestInit) => fetcher(url, {
    ...init, signal: AbortSignal.timeout(config.timeoutMs)
  });
  const loadToken = async () => {
    if (token && token.expiresAtMs > Date.now() + 10_000) return token.value;
    const clientId = setting(config.clientId, "client_id");
    const secret = setting(config.clientSecret, "client_secret");
    const response = await request(setting(config.tokenUrl, "token_url"), {
      body: new URLSearchParams({
        audience: setting(config.audience, "audience"), grant_type: "client_credentials", scope: setting(config.scope, "scope")
      }),
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      method: "POST"
    });
    const body = record(await response.json());
    if (!response.ok) throw new Error(`tenant_context_invalidation_token_${response.status}`);
    const expiresIn = Number(body.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 86_400) throw new Error("tenant_context_invalidation_token_expiry_invalid");
    token = { expiresAtMs: Date.now() + expiresIn * 1000, value: opaque(body.access_token, "access_token") };
    return token.value;
  };
  const runOnce = async (): Promise<number> => {
    if (!config.enabled) return config.pollMs;
    const accessToken = await loadToken();
    const headers = { accept: "application/json", authorization: `Bearer ${accessToken}`, "x-pyrosa-consumer": config.consumer };
    const claimUrl = new URL(setting(config.claimUrl, "claim_url"));
    claimUrl.searchParams.set("limit", "25");
    const response = await request(claimUrl.toString(), { headers, method: "GET" });
    if (!response.ok) {
      if (response.status === 401) token = null;
      throw new Error(`tenant_context_invalidation_claim_${response.status}`);
    }
    const body = record(await response.json());
    if (body.consumer !== config.consumer || !Array.isArray(body.deliveries)) throw new Error("tenant_context_invalidation_claim_invalid");
    const deliveries = body.deliveries.map((value) => parseDelivery(value, config.consumer));
    for (const delivery of deliveries) invalidate(delivery.invalidation);
    if (deliveries.length > 0) {
      const ack = await request(setting(config.ackUrl, "ack_url"), {
        body: JSON.stringify({ receipts: deliveries.map((delivery) => ({ event_id: delivery.eventId, lease_token: delivery.leaseToken })) }),
        headers: { ...headers, "content-type": "application/json" }, method: "POST"
      });
      if (!ack.ok) {
        if (ack.status === 401) token = null;
        throw new Error(`tenant_context_invalidation_ack_${ack.status}`);
      }
    }
    const advertised = Number(record(body.cache_policy).poll_after_ms);
    return Number.isSafeInteger(advertised) && advertised >= 1_000 ? Math.min(advertised, 60_000) : config.pollMs;
  };
  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      void runOnce().then((next) => { failures = 0; schedule(next); }).catch((error) => {
        failures += 1;
        const base = Math.min(60_000, config.pollMs * 2 ** Math.min(failures, 5));
        logger.error(`Tenant-context invalidation consumer unavailable: ${error instanceof Error ? error.message : "unknown_error"}`);
        schedule(Math.round(base * (0.8 + Math.random() * 0.4)));
      });
    }, delayMs);
    timer.unref?.();
  };
  return {
    runOnce,
    start() { if (config.enabled && !timer && !stopped) { logger.info(`Tenant-context invalidation consumer enabled for ${config.consumer}`); schedule(0); } },
    stop() { stopped = true; if (timer) clearTimeout(timer); timer = null; }
  };
}

function parseDelivery(value: unknown, consumer: DirectoryInvalidationConsumerConfig["consumer"]): Delivery {
  const delivery = record(value); const event = record(delivery.event); const payload = record(event.payload);
  const version = Number(payload.projection_version); const generation = opaque(payload.context_generation, "context_generation");
  const expiresAtMs = Date.parse(opaque(payload.expires_at, "expires_at"));
  const expected = consumer === "pyrosa-demoerp" ? "pyrosa-erp" : consumer;
  if (event.contract_version !== "1.0.0" || event.event_type !== "directory.tenant-context-projection.changed.v1" ||
      event.owner !== "pyrosa-directory" || payload.application_slug !== expected || payload.invalidation_mode !== "revalidate" ||
      !Number.isSafeInteger(version) || version < 1 || !Number.isFinite(expiresAtMs) || !/^ctxgen:sha256:[0-9a-f]{64}$/u.test(generation)) {
    throw new Error("tenant_context_invalidation_event_invalid");
  }
  return { eventId: opaque(event.event_id, "event_id"), leaseToken: opaque(delivery.lease_token, "lease_token"),
    invalidation: { contextGeneration: generation, projectionVersion: version, tenantId: opaque(payload.tenant_id, "tenant_id") } };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("tenant_context_invalidation_response_invalid");
  return value as Record<string, unknown>;
}
function opaque(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > 4096) throw new Error(`tenant_context_invalidation_${field}_invalid`);
  return normalized;
}
