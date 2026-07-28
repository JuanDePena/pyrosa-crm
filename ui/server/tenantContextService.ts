import type { IncomingMessage } from "node:http";
import type { CrmSession } from "./auth.js";
import type { CrmServerConfig } from "./config.js";
import {
  identityFromPrincipal,
  listCrmTenantCatalog,
  resolveCrmAccess
} from "./crmV1Access.js";
import { CrmV1Error } from "./crmV1Domain.js";
import type { RequestContext } from "./http.js";
import {
  CRM_APPLICATION,
  TENANT_CONTEXT_SWITCH_RESPONSE_SCHEMA,
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

const maxCandidateConcurrency = 4;

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
    const catalog = await listCrmTenantCatalog(
      input.context,
      input.config,
      identity
    );
    const options = await resolveOptions(
      catalog.map((candidate) => ({
        tenantId: candidate.tenantId,
        tenantKey: candidate.tenantKey,
        label: candidate.displayName
      })),
      input
    );
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
      const access = await resolveCrmAccess(
        input.context,
        input.config,
        identity,
        "crm.dashboard.read",
        selected.tenantId,
        state.initialContextVersion
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
          contextVersion
        })
      };
      saveCrmTenantSession(input.session, state);
      return { state, access };
    }

    const selected = state.options.find(
      (option) =>
        option.tenantKey === state.interactive?.tenantKey &&
        option.status === "ready"
    );
    if (!selected) {
      state = { ...state, interactive: null };
      saveCrmTenantSession(input.session, state);
      return { state, access: null };
    }
    const access = await resolveCrmAccess(
      input.context,
      input.config,
      identity,
      "crm.dashboard.read",
      selected.tenantId,
      state.interactive.contextVersion
    );
    assertPlacementStable(state.interactive, access);
    state = {
      ...state,
      interactive: composeInteractiveTenantContext({
        session: input.session,
        access,
        contextVersion: state.interactive.contextVersion,
        previousIssuedAt: state.interactive.issuedAt
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
  const access = await resolveCrmAccess(
    input.context,
    input.config,
    identityFromPrincipal(input.session, input.config),
    input.requiredCapability,
    interactive.tenantId,
    interactive.contextVersion
  );
  assertPlacementStable(interactive, access);
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
      const access = await resolveCrmAccess(
        input.context,
        input.config,
        identityFromPrincipal(input.session, input.config),
        "crm.dashboard.read",
        replay.tenantContext.tenantId,
        replay.tenantContext.contextVersion
      );
      assertPlacementStable(replay.tenantContext, access);
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
    const selected = state.options.find(
      (option) =>
        option.tenantKey === input.request.tenantKey &&
        option.status === "ready"
    );
    if (!selected) {
      throw new CrmV1Error(
        403,
        "crm.tenant_context.not_eligible",
        "El tenant solicitado no está disponible para esta identidad."
      );
    }
    const identity = identityFromPrincipal(input.session, input.config);
    const access = await resolveCrmAccess(
      input.context,
      input.config,
      identity,
      "crm.dashboard.read",
      selected.tenantId
    );
    if (access.tenantKey !== selected.tenantKey) {
      throw new CrmV1Error(
        409,
        "crm.tenant_context.owner_mismatch",
        "Los owners discrepan sobre el tenant solicitado."
      );
    }
    const now = new Date();
    const contextVersion = deriveContextVersion(
      requireSealSecret(input.config),
      input.session.sid,
      selected.tenantKey,
      input.request.idempotencyKey,
      now.toISOString()
    );
    access.contextVersion = contextVersion;
    const interactive = composeInteractiveTenantContext({
      session: input.session,
      access,
      contextVersion,
      now
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
    const next: CrmTenantSessionState = {
      ...state,
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
    saveCrmTenantSession(input.session, next);
    return { state: next, access, response };
  });
}

export function publicTenantContext(
  state: CrmTenantSessionState
): {
  schemaVersion: "pyrosa.interactive-tenant-context.v1";
  contextVersion: string;
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

async function resolveOptions(
  candidates: Array<{
    tenantId: string;
    tenantKey: string;
    label: string;
  }>,
  input: {
    session: CrmSession;
    config: CrmServerConfig;
    context: RequestContext;
  }
): Promise<CrmTenantOption[]> {
  const options = new Array<CrmTenantOption>(candidates.length);
  let cursor = 0;
  const identity = identityFromPrincipal(input.session, input.config);
  const workers = Array.from(
    {
      length: Math.min(maxCandidateConcurrency, candidates.length)
    },
    async () => {
      while (cursor < candidates.length) {
        const index = cursor;
        cursor += 1;
        const candidate = candidates[index];
        if (!candidate) continue;
        try {
          const access = await resolveCrmAccess(
            {
              ...input.context,
              requestId: `${input.context.requestId}:${candidate.tenantKey}`
            },
            input.config,
            identity,
            "crm.dashboard.read",
            candidate.tenantId
          );
          options[index] = {
            ...candidate,
            status:
              access.tenantKey === candidate.tenantKey ? "ready" : "blocked",
            reason:
              access.tenantKey === candidate.tenantKey
                ? null
                : "owner_tenant_mismatch"
          };
        } catch (error) {
          options[index] = {
            ...candidate,
            status: "blocked",
            reason:
              error instanceof CrmV1Error
                ? error.code
                : "owner_unavailable"
          };
        }
      }
    }
  );
  await Promise.all(workers);
  return normalizeOptions(options);
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
