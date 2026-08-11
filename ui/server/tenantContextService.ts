import type { IncomingMessage } from "node:http";
import type { CrmSession } from "./auth.js";
import type { CrmServerConfig } from "./config.js";
import { identityFromPrincipal } from "./crmV1Access.js";
import { CrmV1Error } from "./crmV1Domain.js";
import type { RequestContext } from "./http.js";
import {
  CRM_APPLICATION,
  TENANT_CONTEXT_SWITCH_RESPONSE_SCHEMA,
  assertTenantContextGenerationStable,
  assertBoundBrowserTenantContext,
  capSwitchReceipts,
  composeInteractiveTenantContext,
  createInitialTenantState,
  deriveContextVersion,
  loadCrmTenantSession,
  normalizeOptions,
  safeEqual,
  saveCrmTenantSession,
  switchPayloadHash,
  withCrmTenantSessionLock,
  type CrmTenantOption,
  type CrmTenantSessionState,
  type TenantContextSwitchRequest,
  type TenantContextSwitchResponse
} from "./tenantContext.js";
import type { CrmAccessContext } from "./crmV1Types.js";
import {
  loadTenantCatalogPage,
  resolveInteractiveCrmAccess,
  resolveTenantCatalogCandidate,
  type TenantCatalogCandidate,
  type TenantCatalogPage
} from "./tenantOwnerAccess.js";

export async function refreshCrmTenantSession(input: {
  session: CrmSession;
  config: CrmServerConfig;
  context: RequestContext;
}): Promise<{
  state: CrmTenantSessionState;
  access: CrmAccessContext | null;
}> {
  return withCrmTenantSessionLock(input.session.sid, async () => {
    const identity = identityFromPrincipal(input.session, input.config);
    const catalog = await loadTenantCatalogPage(
      input.context,
      input.config,
      identity,
      { limit: 24 }
    );
    const options = catalog.options.map((candidate) => ({
        tenantId: candidate.tenantId,
        tenantKey: candidate.tenantKey,
        label: candidate.displayName,
        status: "ready" as const,
        reason: null
      }));
    const sealSecret = requireSealSecret(input.config);
    let state =
      loadCrmTenantSession(input.session) ??
      createInitialTenantState(input.session, sealSecret, options);
    state = { ...state, options: normalizeOptions(options) };

    if (!state.interactive) {
      const selected =
        state.options.find(
          (option) =>
            option.status === "ready" &&
            option.tenantId === input.config.defaultTenantId
        ) ??
        state.options.find((option) => option.status === "ready") ??
        null;
      if (!selected) {
        saveCrmTenantSession(input.session, state);
        return { state, access: null };
      }
      const candidate =
        catalog.options.find(
          (entry) => entry.tenantKey === selected.tenantKey
        ) ??
        (await resolveTenantCatalogCandidate(
          input.context,
          input.config,
          identity,
          selected.tenantKey
        ));
      if (!candidate) {
        saveCrmTenantSession(input.session, state);
        return { state, access: null };
      }
      const access = await resolveInteractiveCrmAccess(
        input.context,
        input.config,
        identity,
        "crm.dashboard.read",
        candidate
      );
      const contextVersion = deriveContextVersion(
        sealSecret,
        input.session.sid,
        access.tenantKey,
        "bootstrap",
        input.context.requestId
      );
      access.contextVersion = contextVersion;
      state = {
        ...state,
        interactive: composeInteractiveTenantContext({
          session: input.session,
          access,
          contextVersion,
          requireContextGeneration: input.config.tenantContextGenerationV1Enabled,
          renewalLeadMs: input.config.tenantContextRenewalLeadMs,
          renewalJitterMaxMs: input.config.tenantContextRenewalJitterMaxMs
        })
      };
      saveCrmTenantSession(input.session, state);
      return { state, access };
    }

    const currentInteractive = state.interactive;
    const candidate = await resolveTenantCatalogCandidate(
      input.context,
      input.config,
      identity,
      currentInteractive.tenantKey
    );
    if (!candidate) {
      state = { ...state, interactive: null };
      saveCrmTenantSession(input.session, state);
      return { state, access: null };
    }
    state = mergeCandidateIntoState(state, candidate);
    const access = await resolveInteractiveCrmAccess(
      input.context,
      input.config,
      identity,
      "crm.dashboard.read",
      candidate
    );
    assertPlacementStable(currentInteractive, access);
    state = {
      ...state,
      interactive: composeInteractiveTenantContext({
        session: input.session,
        access,
        contextVersion: currentInteractive.contextVersion,
        previousIssuedAt: currentInteractive.issuedAt,
        requireContextGeneration: input.config.tenantContextGenerationV1Enabled,
        renewalLeadMs: input.config.tenantContextRenewalLeadMs,
        renewalJitterMaxMs: input.config.tenantContextRenewalJitterMaxMs
      })
    };
    saveCrmTenantSession(input.session, state);
    return { state, access };
  });
}

export async function resolveBoundBrowserCrmAccess(input: {
  req: IncomingMessage;
  session: CrmSession;
  config: CrmServerConfig;
  context: RequestContext;
  requiredCapability: string;
}): Promise<CrmAccessContext> {
  const state = loadCrmTenantSession(input.session);
  if (!state) {
    throw new CrmV1Error(
      409,
      "crm.tenant_context.bootstrap_required",
      "Recarga DemoCRM para establecer un contexto tenant vigente."
    );
  }
  const interactive = assertBoundBrowserTenantContext(
    input.req,
    input.session,
    state
  );
  const selected = state.options.find(
    (option) => option.tenantKey === interactive.tenantKey
  );
  if (!selected) {
    throw new CrmV1Error(
      409,
      "crm.tenant_context.option_missing",
      "El tenant activo ya no está presente en el catálogo de sesión."
    );
  }
  const candidate = await resolveTenantCatalogCandidate(
    input.context,
    input.config,
    identityFromPrincipal(input.session, input.config),
    selected.tenantKey
  );
  if (!candidate) {
    throw new CrmV1Error(
      403,
      "crm.tenant_context.not_eligible",
      "Directory retiró el tenant del catálogo elegible."
    );
  }
  const access = await resolveInteractiveCrmAccess(
    input.context,
    input.config,
    identityFromPrincipal(input.session, input.config),
    input.requiredCapability,
    candidate
  );
  access.contextVersion = interactive.contextVersion;
  assertTenantContextGenerationStable(
    interactive,
    access,
    input.config.tenantContextGenerationV1Enabled === true
  );
  assertPlacementStable(interactive, access);
  assertSessionStateCas(state, loadCrmTenantSession(input.session));
  return access;
}

export async function switchCrmTenantContext(input: {
  session: CrmSession;
  config: CrmServerConfig;
  context: RequestContext;
  request: TenantContextSwitchRequest;
}): Promise<{
  state: CrmTenantSessionState;
  access: CrmAccessContext;
  response: TenantContextSwitchResponse;
}> {
  return withCrmTenantSessionLock(input.session.sid, async () => {
    const state = loadCrmTenantSession(input.session);
    if (!state) {
      throw new CrmV1Error(
        409,
        "crm.tenant_context.bootstrap_required",
        "Recarga DemoCRM antes de cambiar de tenant."
      );
    }
    const payloadHash = switchPayloadHash(input.request);
    const replay = state.switchReceipts[input.request.idempotencyKey];
    if (replay) {
      if (!safeEqual(replay.payloadHash, payloadHash)) {
        throw new CrmV1Error(
          409,
          "crm.tenant_context.idempotency_conflict",
          "La clave de idempotencia ya fue usada con otra solicitud."
        );
      }
      if (
        !state.interactive ||
        state.interactive.contextVersion !==
          replay.tenantContext.contextVersion
      ) {
        throw new CrmV1Error(
          409,
          "crm.tenant_context.stale",
          "El receipt pertenece a un contexto que ya no está activo."
        );
      }
      const identity = identityFromPrincipal(input.session, input.config);
      const candidate = await resolveTenantCatalogCandidate(
        input.context,
        input.config,
        identity,
        replay.tenantContext.tenantKey
      );
      if (!candidate) {
        throw new CrmV1Error(
          403,
          "crm.tenant_context.not_eligible",
          "Directory retiró el tenant del catálogo elegible."
        );
      }
      const access = await resolveInteractiveCrmAccess(
        input.context,
        input.config,
        identity,
        "crm.dashboard.read",
        candidate
      );
      access.contextVersion = replay.tenantContext.contextVersion;
      assertPlacementStable(replay.tenantContext, access);
      assertTenantContextGenerationStable(
        replay.tenantContext,
        access,
        input.config.tenantContextGenerationV1Enabled === true
      );
      return {
        state,
        access,
        response: { ...replay.response, replayed: true }
      };
    }

    const currentVersion =
      state.interactive?.contextVersion ?? state.initialContextVersion;
    if (!safeEqual(currentVersion, input.request.expectedContextVersion)) {
      throw new CrmV1Error(
        409,
        "crm.tenant_context.stale",
        "La versión esperada del contexto ya no está vigente."
      );
    }
    const identity = identityFromPrincipal(input.session, input.config);
    const candidate = await resolveTenantCatalogCandidate(
      input.context,
      input.config,
      identity,
      input.request.tenantKey
    );
    if (!candidate) {
      throw new CrmV1Error(
        403,
        "crm.tenant_context.not_eligible",
        "El tenant solicitado no está disponible para esta identidad."
      );
    }
    const access = await resolveInteractiveCrmAccess(
      input.context,
      input.config,
      identity,
      "crm.dashboard.read",
      candidate
    );
    const now = new Date();
    const contextVersion = deriveContextVersion(
      requireSealSecret(input.config),
      input.session.sid,
      candidate.tenantKey,
      input.request.idempotencyKey,
      now.toISOString()
    );
    access.contextVersion = contextVersion;
    const interactive = composeInteractiveTenantContext({
      session: input.session,
      access,
      contextVersion,
      now,
      requireContextGeneration: input.config.tenantContextGenerationV1Enabled,
      renewalLeadMs: input.config.tenantContextRenewalLeadMs,
      renewalJitterMaxMs: input.config.tenantContextRenewalJitterMaxMs
    });
    const response: TenantContextSwitchResponse = {
      schemaVersion: TENANT_CONTEXT_SWITCH_RESPONSE_SCHEMA,
      application: CRM_APPLICATION,
      tenantKey: interactive.tenantKey,
      contextVersion: interactive.contextVersion,
      replayed: false,
      issuedAt: interactive.issuedAt,
      refreshedAt: interactive.refreshedAt
    };
    const stateWithCandidate = mergeCandidateIntoState(state, candidate);
    const next: CrmTenantSessionState = {
      ...stateWithCandidate,
      interactive,
      switchReceipts: capSwitchReceipts({
        ...state.switchReceipts,
        [input.request.idempotencyKey]: {
          payloadHash,
          response,
          tenantContext: interactive
        }
      })
    };
    assertSessionStateCas(state, loadCrmTenantSession(input.session));
    saveCrmTenantSession(input.session, next);
    return { state: next, access, response };
  });
}

export function publicTenantContext(
  state: CrmTenantSessionState
): {
  schemaVersion: "pyrosa.interactive-tenant-context.v1";
  contextVersion: string;
  state: "active" | "unselected" | "safe_state";
  expiresAt: string | null;
  renewAfter: string | null;
  selected: {
    tenantId: string;
    tenantKey: string;
    label: string;
  } | null;
  options: CrmTenantOption[];
} {
  const selected = state.interactive
    ? state.options.find(
        (option) => option.tenantKey === state.interactive?.tenantKey
      )
    : null;
  return {
    schemaVersion: "pyrosa.interactive-tenant-context.v1",
    contextVersion:
      state.interactive?.contextVersion ?? state.initialContextVersion,
    state: state.interactive
      ? Date.parse(state.interactive.expiresAt) > Date.now()
        ? "active"
        : "safe_state"
      : "unselected",
    expiresAt: state.interactive?.expiresAt ?? null,
    renewAfter: state.interactive?.renewAfter ?? null,
    selected:
      state.interactive && selected
        ? {
            tenantId: state.interactive.tenantId,
            tenantKey: state.interactive.tenantKey,
            label: selected.label
          }
        : null,
    options: structuredClone(state.options)
  };
}

export async function listCrmTenantOptions(input: {
  session: CrmSession;
  config: CrmServerConfig;
  context: RequestContext;
  query: string | null;
  cursor: string | null;
  limit: number;
}): Promise<{
  page: TenantCatalogPage;
  state: CrmTenantSessionState;
}> {
  const page = await loadTenantCatalogPage(
    input.context,
    input.config,
    identityFromPrincipal(input.session, input.config),
    {
      query: input.query,
      cursor: input.cursor,
      limit: input.limit
    }
  );
  return withCrmTenantSessionLock(input.session.sid, async () => {
    const current =
      loadCrmTenantSession(input.session) ??
      createInitialTenantState(
        input.session,
        requireSealSecret(input.config),
        []
      );
    const next = page.options.reduce(
      (state, candidate) => mergeCandidateIntoState(state, candidate),
      current
    );
    saveCrmTenantSession(input.session, next);
    return { page, state: next };
  });
}

export async function renewCrmTenantContext(input: {
  session: CrmSession;
  config: CrmServerConfig;
  context: RequestContext;
}): Promise<{
  state: CrmTenantSessionState;
  access: CrmAccessContext;
}> {
  return withCrmTenantSessionLock(input.session.sid, async () => {
    const current = loadCrmTenantSession(input.session);
    if (!current?.interactive) {
      throw new CrmV1Error(
        409,
        "crm.tenant_context.recovery_selection_required",
        "No existe una selección tenant que pueda renovarse."
      );
    }
    const identity = identityFromPrincipal(input.session, input.config);
    const candidate = await resolveTenantCatalogCandidate(
      input.context,
      input.config,
      identity,
      current.interactive.tenantKey
    );
    if (!candidate) {
      const withdrawn = { ...current, interactive: null };
      saveCrmTenantSession(input.session, withdrawn);
      throw new CrmV1Error(
        403,
        "crm.tenant_context.not_eligible",
        "Directory retiró el tenant del catálogo elegible."
      );
    }
    const access = await resolveInteractiveCrmAccess(
      input.context,
      input.config,
      identity,
      "crm.dashboard.read",
      candidate,
      { minimumCachedDecisionRemainingMs: input.config.tenantContextRenewalLeadMs }
    );
    assertPlacementStable(current.interactive, access);
    const contextVersion = tenantDecisionEvidenceMatches(
      current.interactive,
      access
    )
      ? current.interactive.contextVersion
      : deriveContextVersion(
          requireSealSecret(input.config),
          input.session.sid,
          candidate.tenantKey,
          "renew",
          `${input.context.requestId}:${new Date().toISOString()}`
        );
    access.contextVersion = contextVersion;
    const interactive = composeInteractiveTenantContext({
      session: input.session,
      access,
      contextVersion,
      previousIssuedAt: current.interactive.issuedAt,
      requireContextGeneration: input.config.tenantContextGenerationV1Enabled,
      renewalLeadMs: input.config.tenantContextRenewalLeadMs,
      renewalJitterMaxMs: input.config.tenantContextRenewalJitterMaxMs
    });
    const next = {
      ...mergeCandidateIntoState(current, candidate),
      interactive
    };
    assertSessionStateCas(current, loadCrmTenantSession(input.session));
    saveCrmTenantSession(input.session, next);
    return { state: next, access };
  });
}

function tenantDecisionEvidenceMatches(
  current: NonNullable<CrmTenantSessionState["interactive"]>,
  access: CrmAccessContext
): boolean {
  const decisions = access.ownerDecisions;
  if (!decisions) return false;
  return (
    current.contextGeneration === (access.contextGeneration ?? null) &&
    current.placement.reference === access.schemaName &&
    current.placement.fingerprint === access.physicalFingerprint &&
    current.placement.readinessVersion === access.dictionaryVersion &&
    JSON.stringify(current.decisions) === JSON.stringify(decisions)
  );
}

function mergeCandidateIntoState(
  state: CrmTenantSessionState,
  candidate: TenantCatalogCandidate
): CrmTenantSessionState {
  const byKey = new Map(
    state.options.map((option) => [option.tenantKey, option] as const)
  );
  byKey.set(candidate.tenantKey, {
    tenantId: candidate.tenantId,
    tenantKey: candidate.tenantKey,
    label: candidate.displayName,
    status: "ready",
    reason: null
  });
  return {
    ...state,
    options: normalizeOptions([...byKey.values()])
  };
}

function assertPlacementStable(
  interactive: NonNullable<CrmTenantSessionState["interactive"]>,
  access: CrmAccessContext
): void {
  if (
    access.tenantId !== interactive.tenantId ||
    access.tenantKey !== interactive.tenantKey ||
    access.schemaName !== interactive.placement.reference ||
    access.physicalFingerprint !== interactive.placement.fingerprint ||
    access.dictionaryVersion !== interactive.placement.readinessVersion
  ) {
    throw new CrmV1Error(
      409,
      "crm.tenant_context.placement_drift",
      "Platform cambió el placement; recarga el contexto antes de continuar."
    );
  }
}

function assertSessionStateCas(
  expected: CrmTenantSessionState,
  current: CrmTenantSessionState | null
): void {
  if (
    !current ||
    current.sid !== expected.sid ||
    current.issuer !== expected.issuer ||
    current.subject !== expected.subject ||
    (current.interactive?.tenantId ?? null) !==
      (expected.interactive?.tenantId ?? null) ||
    (current.interactive?.contextVersion ?? null) !==
      (expected.interactive?.contextVersion ?? null) ||
    (current.interactive?.contextGeneration ?? null) !==
      (expected.interactive?.contextGeneration ?? null)
  ) {
    throw new CrmV1Error(
      409,
      "crm.tenant_context.stale",
      "La identidad, tenant o generation cambio durante la recomposicion."
    );
  }
}

function requireSealSecret(config: CrmServerConfig): string {
  const secret = String(config.tenantContextSealSecret ?? "").trim();
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new CrmV1Error(
      503,
      "crm.tenant_context.seal_unavailable",
      "DemoCRM no tiene material para sellar la sesión tenant.",
      true
    );
  }
  return secret;
}
