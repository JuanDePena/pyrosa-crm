import {
  createHash,
  createHmac,
  timingSafeEqual
} from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { CrmSession } from "./auth.js";
import type { CrmAccessContext } from "./crmV1Types.js";
import { CrmV1Error } from "./crmV1Domain.js";

export const CRM_APPLICATION = "pyrosa-democrm" as const;
export const TENANT_CONTEXT_HEADER =
  "X-Pyrosa-Tenant-Context-Version" as const;
export const TENANT_CONTEXT_SWITCH_REQUEST_SCHEMA =
  "pyrosa.tenant-context.switch.request.v1" as const;
export const TENANT_CONTEXT_SWITCH_RESPONSE_SCHEMA =
  "pyrosa.tenant-context.switch.response.v1" as const;
export const INTERACTIVE_TENANT_CONTEXT_SCHEMA =
  "pyrosa.interactive-tenant-context.v1" as const;
export const TENANT_WORK_CONTEXT_SCHEMA =
  "pyrosa.tenant-work-context.v1" as const;

export type TenantDecision = {
  reference: string;
  version: string;
  expiresAt: string;
};

export type CrmTenantOption = {
  tenantId: string;
  tenantKey: string;
  label: string;
  status: "ready" | "blocked";
  reason: string | null;
};

export type InteractiveTenantContext = {
  schemaVersion: typeof INTERACTIVE_TENANT_CONTEXT_SCHEMA;
  application: typeof CRM_APPLICATION;
  sessionId: string;
  issuer: string;
  subject: string;
  tenantId: string;
  tenantKey: string;
  contextVersion: string;
  decisions: {
    iam: TenantDecision;
    directory: TenantDecision;
    store: TenantDecision;
    platform: TenantDecision;
    application: TenantDecision;
  };
  placement: {
    reference: string;
    fingerprint: string;
    readinessVersion: string;
  };
  issuedAt: string;
  refreshedAt: string;
  expiresAt: string;
  renewAfter: string;
};

export type TenantContextSwitchRequest = {
  schemaVersion: typeof TENANT_CONTEXT_SWITCH_REQUEST_SCHEMA;
  idempotencyKey: string;
  tenantKey: string;
  expectedContextVersion: string;
};

export type TenantContextSwitchResponse = {
  schemaVersion: typeof TENANT_CONTEXT_SWITCH_RESPONSE_SCHEMA;
  application: typeof CRM_APPLICATION;
  tenantKey: string;
  contextVersion: string;
  replayed: boolean;
  issuedAt: string;
  refreshedAt: string;
};

export type TenantContextSwitchReceipt = {
  payloadHash: string;
  response: TenantContextSwitchResponse;
  tenantContext: InteractiveTenantContext;
};

export type CrmTenantSessionState = {
  sid: string;
  issuer: string;
  subject: string;
  expiresAt: string;
  initialContextVersion: string;
  interactive: InteractiveTenantContext | null;
  options: CrmTenantOption[];
  switchReceipts: Record<string, TenantContextSwitchReceipt>;
};

export type TenantWorkContext = {
  schemaVersion: typeof TENANT_WORK_CONTEXT_SCHEMA;
  application: typeof CRM_APPLICATION;
  tenantId: string;
  tenantKey: string;
  operation: string;
  decisionReference: string;
  placementFingerprint: string;
  correlationId: string;
  idempotencyKey: string;
  enqueuedAt: string;
};

type StoredState = {
  expiresAtMs: number;
  value: CrmTenantSessionState;
};

const stateBySession = new Map<string, StoredState>();
const sessionLocks = new Map<string, Promise<void>>();
const maxSessions = 10_000;

export function loadCrmTenantSession(
  session: CrmSession
): CrmTenantSessionState | null {
  const record = stateBySession.get(normalizeSessionId(session.sid));
  if (!record) return null;
  if (record.expiresAtMs <= Date.now()) {
    stateBySession.delete(session.sid);
    return null;
  }
  if (
    record.value.issuer !== session.iamIdentity.issuer ||
    record.value.subject !== session.iamIdentity.subject
  ) {
    stateBySession.delete(session.sid);
    throw new CrmV1Error(
      401,
      "crm.tenant_context.identity_changed",
      "La identidad IAM ya no coincide con el contexto tenant."
    );
  }
  return structuredClone(record.value);
}

export function saveCrmTenantSession(
  session: CrmSession,
  state: CrmTenantSessionState
): void {
  const sid = normalizeSessionId(session.sid);
  if (state.sid !== sid) {
    throw new CrmV1Error(
      500,
      "crm.tenant_context.session_invalid",
      "El contexto tenant no pertenece a la sesión activa."
    );
  }
  const expiresAtMs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new CrmV1Error(
      401,
      "crm.tenant_context.session_expired",
      "La sesión IAM ya no está vigente."
    );
  }
  pruneExpiredSessions();
  if (!stateBySession.has(sid) && stateBySession.size >= maxSessions) {
    throw new CrmV1Error(
      503,
      "crm.tenant_context.capacity_exceeded",
      "El almacén temporal de contexto tenant alcanzó su capacidad.",
      true
    );
  }
  stateBySession.set(sid, {
    expiresAtMs,
    value: structuredClone({
      ...state,
      issuer: session.iamIdentity.issuer,
      subject: session.iamIdentity.subject,
      expiresAt: session.expiresAt
    })
  });
}

export function deleteCrmTenantSession(sessionId: string): void {
  stateBySession.delete(normalizeSessionId(sessionId));
}

export function resetCrmTenantSessionsForTests(): void {
  stateBySession.clear();
  sessionLocks.clear();
}

export async function withCrmTenantSessionLock<T>(
  sessionId: string,
  work: () => Promise<T>
): Promise<T> {
  const sid = normalizeSessionId(sessionId);
  const previous = sessionLocks.get(sid) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  sessionLocks.set(sid, tail);
  await previous;
  try {
    return await work();
  } finally {
    release?.();
    if (sessionLocks.get(sid) === tail) {
      sessionLocks.delete(sid);
    }
  }
}

export function createInitialTenantState(
  session: CrmSession,
  secret: string,
  options: CrmTenantOption[]
): CrmTenantSessionState {
  return {
    sid: normalizeSessionId(session.sid),
    issuer: session.iamIdentity.issuer,
    subject: session.iamIdentity.subject,
    expiresAt: session.expiresAt,
    initialContextVersion: deriveContextVersion(
      secret,
      session.sid,
      "unselected",
      "bootstrap",
      session.uiAuthAuthenticatedAt
    ),
    interactive: null,
    options: normalizeOptions(options),
    switchReceipts: {}
  };
}

export function parseTenantContextSwitchRequest(
  value: unknown
): TenantContextSwitchRequest {
  const body = requireRecord(value);
  const keys = Object.keys(body).sort();
  const expectedKeys = [
    "expectedContextVersion",
    "idempotencyKey",
    "schemaVersion",
    "tenantKey"
  ];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new CrmV1Error(
      400,
      "crm.tenant_context.request_invalid",
      "La solicitud de cambio tenant no cumple el contrato exacto."
    );
  }
  if (body.schemaVersion !== TENANT_CONTEXT_SWITCH_REQUEST_SCHEMA) {
    throw new CrmV1Error(
      400,
      "crm.tenant_context.schema_unsupported",
      "La versión del contrato de cambio tenant no está soportada."
    );
  }
  return {
    schemaVersion: TENANT_CONTEXT_SWITCH_REQUEST_SCHEMA,
    idempotencyKey: normalizeOpaque(body.idempotencyKey, 16, 160),
    tenantKey: normalizeTenantKey(body.tenantKey),
    expectedContextVersion: normalizeContextVersion(
      body.expectedContextVersion
    )
  };
}

export function assertTenantContextCsrf(
  session: CrmSession,
  req: IncomingMessage
): void {
  const value = singleHeader(req, "x-csrf-token");
  if (!safeEqual(session.csrf, value)) {
    throw new CrmV1Error(
      403,
      "crm.csrf.invalid",
      "El token CSRF no es válido."
    );
  }
}

export function assertBoundBrowserTenantContext(
  req: IncomingMessage,
  session: CrmSession,
  state: CrmTenantSessionState
): InteractiveTenantContext {
  const interactive = state.interactive;
  if (!interactive) {
    throw new CrmV1Error(
      403,
      "crm.tenant_context.required",
      "Selecciona un tenant elegible antes de consultar datos funcionales."
    );
  }
  if (
    interactive.sessionId !== session.sid ||
    interactive.issuer !== session.iamIdentity.issuer ||
    interactive.subject !== session.iamIdentity.subject
  ) {
    throw new CrmV1Error(
      401,
      "crm.tenant_context.identity_changed",
      "El contexto tenant no pertenece a la identidad activa."
    );
  }
  if (interactiveTenantContextExpiresAt(interactive) <= Date.now()) {
    throw new CrmV1Error(
      409,
      "crm.tenant_context.expired",
      "El contexto tenant venció y debe recuperarse antes de consultar datos."
    );
  }
  const supplied = normalizeContextVersion(
    singleHeader(req, TENANT_CONTEXT_HEADER.toLowerCase())
  );
  if (!safeEqual(supplied, interactive.contextVersion)) {
    throw new CrmV1Error(
      409,
      "crm.tenant_context.stale",
      "La solicitud pertenece a una versión tenant que ya no está activa."
    );
  }
  return structuredClone(interactive);
}

export function composeInteractiveTenantContext(input: {
  session: CrmSession;
  access: CrmAccessContext;
  contextVersion: string;
  previousIssuedAt?: string;
  now?: Date;
}): InteractiveTenantContext {
  const now = input.now ?? new Date();
  const refreshedAt = now.toISOString();
  const ownerDecisions = input.access.ownerDecisions;
  const access = input.access;
  if (
    !/^sha256:[0-9a-f]{64}$/u.test(access.physicalFingerprint) ||
    !ownerDecisions
  ) {
    throw new CrmV1Error(
      503,
      "crm.tenant_context.placement_unready",
      "Platform no devolvió un placement CRM vigente.",
      true
    );
  }
  const expiresAt = new Date(
    Math.min(
      Date.parse(input.session.expiresAt),
      ...Object.values(ownerDecisions).map((decision) =>
        Date.parse(decision.expiresAt)
      )
    )
  ).toISOString();
  if (Date.parse(expiresAt) <= now.valueOf()) {
    throw new CrmV1Error(
      503,
      "crm.tenant_context.owner_decision_expired",
      "Una decisión owner venció antes de publicar el contexto tenant.",
      true
    );
  }
  return {
    schemaVersion: INTERACTIVE_TENANT_CONTEXT_SCHEMA,
    application: CRM_APPLICATION,
    sessionId: input.session.sid,
    issuer: input.session.iamIdentity.issuer,
    subject: input.session.iamIdentity.subject,
    tenantId: access.tenantId,
    tenantKey: access.tenantKey,
    contextVersion: normalizeContextVersion(input.contextVersion),
    decisions: {
      iam: ownerDecisions.iam,
      directory: ownerDecisions.directory,
      store: ownerDecisions.store,
      platform: ownerDecisions.platform,
      application: ownerDecisions.application
    },
    placement: {
      reference: access.schemaName,
      fingerprint: access.physicalFingerprint,
      readinessVersion: access.dictionaryVersion
    },
    issuedAt: input.previousIssuedAt ?? refreshedAt,
    refreshedAt,
    expiresAt,
    renewAfter: new Date(
      Math.max(now.valueOf(), Date.parse(expiresAt) - 15_000)
    ).toISOString()
  };
}

export function interactiveTenantContextExpiresAt(
  context: InteractiveTenantContext
): number {
  const epoch = Date.parse(context.expiresAt);
  if (!Number.isFinite(epoch)) {
    throw new CrmV1Error(
      500,
      "crm.tenant_context.expiry_invalid",
      "El contexto tenant no conserva una expiración válida."
    );
  }
  return epoch;
}

export function deriveContextVersion(
  secret: string,
  sessionId: string,
  tenantKey: string,
  idempotencyKey: string,
  nonce: string
): string {
  const material = String(secret ?? "").trim();
  if (material.length < 16) {
    throw new CrmV1Error(
      503,
      "crm.tenant_context.seal_unavailable",
      "No existe material criptográfico para sellar el contexto tenant.",
      true
    );
  }
  return `ctxv1.${createHmac("sha256", material)
    .update(
      [sessionId, tenantKey, idempotencyKey, nonce].join("\u0000")
    )
    .digest("base64url")}`;
}

export function switchPayloadHash(
  request: TenantContextSwitchRequest
): string {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        expectedContextVersion: request.expectedContextVersion,
        idempotencyKey: request.idempotencyKey,
        schemaVersion: request.schemaVersion,
        tenantKey: request.tenantKey
      })
    )
    .digest("hex")}`;
}

export function createTenantWorkContext(input: {
  access: CrmAccessContext;
  operation: string;
  correlationId: string;
  idempotencyKey: string;
  now?: Date;
}): TenantWorkContext {
  const operation = String(input.operation ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._:-]{2,127}$/u.test(operation)) {
    throw new CrmV1Error(
      500,
      "crm.tenant_work_context.operation_invalid",
      "La operación tenant asíncrona no es válida."
    );
  }
  return {
    schemaVersion: TENANT_WORK_CONTEXT_SCHEMA,
    application: CRM_APPLICATION,
    tenantId: input.access.tenantId,
    tenantKey: input.access.tenantKey,
    operation,
    decisionReference: input.access.authorizationDecisionId,
    placementFingerprint: input.access.physicalFingerprint,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    enqueuedAt: (input.now ?? new Date()).toISOString()
  };
}

export function tenantNamespace(
  access: Pick<CrmAccessContext, "tenantKey">,
  kind: "cache" | "file" | "idempotency" | "lock",
  value: string
): string {
  const suffix = String(value ?? "").trim();
  if (!suffix || suffix.length > 512 || suffix.includes("\0")) {
    throw new CrmV1Error(
      500,
      "crm.tenant_namespace.invalid",
      "No fue posible construir un namespace tenant seguro."
    );
  }
  return `${CRM_APPLICATION}:${access.tenantKey}:${kind}:${suffix}`;
}

export function normalizeOptions(
  options: CrmTenantOption[]
): CrmTenantOption[] {
  const seen = new Set<string>();
  return options
    .map((option) => {
      const tenantKey = normalizeTenantKey(option.tenantKey);
      if (seen.has(tenantKey)) {
        throw new CrmV1Error(
          502,
          "crm.tenant_context.option_duplicate",
          "Directory devolvió un tenant duplicado."
        );
      }
      seen.add(tenantKey);
      const tenantId = normalizeOpaque(option.tenantId, 1, 160);
      const label = String(option.label ?? "").trim();
      if (!label || label.length > 180) {
        throw new CrmV1Error(
          502,
          "crm.tenant_context.option_invalid",
          "Directory devolvió un nombre tenant inválido."
        );
      }
      return {
        tenantId,
        tenantKey,
        label,
        status: option.status === "ready" ? "ready" : "blocked",
        reason: option.reason ? String(option.reason).slice(0, 127) : null
      } satisfies CrmTenantOption;
    })
    .sort(
      (left, right) =>
        left.label.localeCompare(right.label, "es") ||
        left.tenantKey.localeCompare(right.tenantKey)
    );
}

export function capSwitchReceipts(
  receipts: Record<string, TenantContextSwitchReceipt>
): Record<string, TenantContextSwitchReceipt> {
  return Object.fromEntries(
    Object.entries(receipts).slice(-64)
  );
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [sid, record] of stateBySession) {
    if (record.expiresAtMs <= now) stateBySession.delete(sid);
  }
}

function normalizeSessionId(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(normalized)) {
    throw new CrmV1Error(
      500,
      "crm.tenant_context.session_invalid",
      "El identificador de sesión no es válido."
    );
  }
  return normalized;
}

function normalizeTenantKey(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{12}$/u.test(normalized)) {
    throw new CrmV1Error(
      400,
      "crm.tenant_context.tenant_key_invalid",
      "tenantKey no tiene el formato canónico."
    );
  }
  return normalized;
}

function normalizeContextVersion(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (
    normalized.length < 16 ||
    normalized.length > 256 ||
    !/^[A-Za-z0-9._:-]+$/u.test(normalized)
  ) {
    throw new CrmV1Error(
      400,
      "crm.tenant_context.version_invalid",
      "contextVersion no tiene un formato válido."
    );
  }
  return normalized;
}

function normalizeOpaque(
  value: unknown,
  min: number,
  max: number
): string {
  const normalized = String(value ?? "").trim();
  if (
    normalized.length < min ||
    normalized.length > max ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/u.test(normalized)
  ) {
    throw new CrmV1Error(
      400,
      "crm.tenant_context.value_invalid",
      "Un valor opaco del contexto tenant no es válido."
    );
  }
  return normalized;
}

function singleHeader(req: IncomingMessage, name: string): string {
  const value = req.headers[name];
  if (Array.isArray(value)) {
    throw new CrmV1Error(
      400,
      "crm.tenant_context.header_invalid",
      `El header ${name} no puede repetirse.`
    );
  }
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new CrmV1Error(
      400,
      "crm.tenant_context.header_required",
      `Falta el header ${name}.`
    );
  }
  return normalized;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CrmV1Error(
      400,
      "crm.tenant_context.request_invalid",
      "La solicitud tenant debe ser un objeto JSON."
    );
  }
  return value as Record<string, unknown>;
}
