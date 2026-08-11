export const tenantRenewalRetryInitialMs = 2_000;
export const tenantRenewalRetryMaxMs = 30_000;

export function tenantRenewalAdvanced(
  currentExpiresAt: string,
  renewedExpiresAt: string | null | undefined
): boolean {
  const current = Date.parse(currentExpiresAt);
  const renewed = Date.parse(renewedExpiresAt ?? "");
  return Number.isFinite(current) && Number.isFinite(renewed) && renewed > current;
}

export function boundedTenantRenewalRetryDelay(
  expiresAtMs: number,
  retryDelayMs: number,
  nowMs: number = Date.now(),
  jitterMs = 0
): number | null {
  const remainingMs = expiresAtMs - nowMs;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  const requested = Math.max(
    250,
    Math.trunc(retryDelayMs) + Math.max(0, Math.trunc(jitterMs))
  );
  return Math.max(
    250,
    Math.min(requested, Math.max(250, remainingMs - 250))
  );
}
