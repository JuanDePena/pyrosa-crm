import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { crmResources as crmResourceValues } from "./crmV1Types.js";
import type {
  CrmIdentity,
  CrmListQuery,
  CrmRecord,
  CrmResource,
  IndustryProfile,
  TenantConfiguration
} from "./crmV1Types.js";

export type CrmErrorField = { field: string; code: string; message: string };

export class CrmV1Error extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly fields: CrmErrorField[] = []
  ) {
    super(message);
  }
}

export const resourceCapabilities: Record<CrmResource, { read: string; write: string }> = {
  accounts: { read: "crm.accounts.read", write: "crm.accounts.write" },
  contacts: { read: "crm.contacts.read", write: "crm.contacts.write" },
  cases: { read: "crm.cases.read", write: "crm.cases.write" },
  activities: { read: "crm.activities.read", write: "crm.activities.write" },
  appointments: { read: "crm.appointments.read", write: "crm.appointments.write" },
  opportunities: { read: "crm.opportunities.read", write: "crm.opportunities.write" }
};

export const allowedSorts: Record<CrmResource, string[]> = {
  accounts: ["name", "status", "ownerId", "createdAt", "updatedAt"],
  contacts: ["displayName", "status", "role", "createdAt", "updatedAt"],
  cases: ["subject", "status", "priority", "slaDueAt", "createdAt", "updatedAt"],
  activities: ["subject", "status", "type", "dueAt", "createdAt", "updatedAt"],
  appointments: ["status", "startAt", "createdAt", "updatedAt"],
  opportunities: ["name", "status", "amountMinor", "probability", "createdAt", "updatedAt"]
};

export const allowedFilters: Record<CrmResource, string[]> = {
  accounts: ["status", "type", "ownerId", "tag"],
  contacts: ["status", "role", "accountId", "consentStatus"],
  cases: ["status", "priority", "queueId", "ownerId", "accountId", "contactId", "attention"],
  activities: ["status", "type", "ownerId", "caseId", "accountId", "contactId", "attention"],
  appointments: ["status", "resourceId", "caseId", "accountId", "contactId", "attention"],
  opportunities: ["status", "pipelineId", "stageId", "ownerId", "accountId", "primaryContactId"]
};

export const caseTransitions: Record<string, string[]> = {
  new: ["triaged", "cancelled"],
  triaged: ["in_progress", "cancelled"],
  in_progress: ["waiting_external", "resolved", "cancelled"],
  waiting_external: ["in_progress", "resolved", "cancelled"],
  resolved: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["triaged", "in_progress", "cancelled"],
  cancelled: ["reopened"]
};

export const appointmentTransitions: Record<string, string[]> = {
  requested: ["scheduled", "cancelled"],
  scheduled: ["confirmed", "rescheduled", "cancelled", "completed", "no_show", "sync_failed"],
  confirmed: ["rescheduled", "cancelled", "completed", "no_show", "sync_failed"],
  rescheduled: ["confirmed", "cancelled", "completed", "no_show", "sync_failed"],
  sync_failed: ["scheduled", "rescheduled", "cancelled"],
  cancelled: [],
  completed: [],
  no_show: ["rescheduled"]
};

export const baseProfile: IndustryProfile = {
  key: "core",
  version: "1",
  label: "CRM multiindustria",
  vocabulary: { account: "Cuenta", contact: "Contacto", case: "Caso", appointment: "Cita", opportunity: "Oportunidad" },
  caseStates: Object.keys(caseTransitions),
  appointmentStates: Object.keys(appointmentTransitions),
  fields: [],
  metricSetVersion: "core@1",
  reports: ["pipeline-summary", "activity-throughput", "case-backlog"]
};

export const healthcareProfile: IndustryProfile = {
  key: "healthcare-call-center",
  version: "1",
  label: "Healthcare Call Center",
  vocabulary: { ...baseProfile.vocabulary, account: "Clinica / cuenta", contact: "Contacto / paciente", case: "Seguimiento", appointment: "Cita operacional" },
  caseStates: baseProfile.caseStates,
  appointmentStates: baseProfile.appointmentStates,
  fields: [
    { key: "patient.birthDate", type: "date", sensitive: true, required: false },
    { key: "coverage.memberReference", type: "text", sensitive: true, required: false },
    { key: "eligibility.status", type: "enum", sensitive: false, required: false },
    { key: "authorization.status", type: "enum", sensitive: false, required: false },
    { key: "serviceRequest.code", type: "text", sensitive: false, required: false }
  ],
  metricSetVersion: "healthcare-call-center@1",
  reports: ["case-backlog", "sla-compliance", "appointments-by-status", "pipeline-summary", "activity-throughput", "import-quality"]
};

export const supportedReportKeys = [
  "case-backlog",
  "sla-compliance",
  "appointments-by-status",
  "pipeline-summary",
  "activity-throughput",
  "import-quality"
] as const;

export function assertMutationRequestSecurity(input: {
  contentType?: string;
  csrfToken?: string;
  expectedCsrfToken?: string;
  method?: string;
}): void {
  const method = String(input.method ?? "GET").toUpperCase();
  if (method !== "POST" && method !== "PATCH") return;
  if (String(input.contentType ?? "").split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new CrmV1Error(415, "crm.request.content_type_required", "Las mutaciones requieren Content-Type application/json.");
  }
  if (!input.expectedCsrfToken) return;
  const provided = Buffer.from(String(input.csrfToken ?? ""));
  const expected = Buffer.from(input.expectedCsrfToken);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new CrmV1Error(403, "crm.csrf.invalid", "La proteccion de escritura de la sesion no es valida.");
  }
}

export function normalizeReportRunRequest(input: unknown): Record<string, unknown> {
  const source = exactRequestRecord(input, ["format", "period", "reportId", "reportKey"]);
  if (Boolean(source.reportKey) === Boolean(source.reportId)) {
    throw validationError("body", "schema", "La ejecucion debe declarar exactamente reportKey o reportId.");
  }
  const reportKey = configString(source.reportKey ?? source.reportId, "reportKey", 80, /^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
  if (!supportedReportKeys.includes(reportKey as (typeof supportedReportKeys)[number])) {
    throw validationError("reportKey", "catalog", "El reporte solicitado no pertenece al catalogo activo.");
  }
  const format = source.format === undefined ? "json" : configString(source.format, "format", 8).toLowerCase();
  if (format !== "json" && format !== "csv") {
    throw validationError("format", "enum", "format debe ser json o csv.");
  }
  return { reportKey, format, ...(source.period === undefined ? {} : { period: normalizePeriodRecord(source.period) }) };
}

function exactRequestRecord(value: unknown, allowedKeys: string[]): Record<string, unknown> {
  if (!isPlainRecord(value)) throw validationError("body", "type", "El cuerpo debe ser un objeto JSON.");
  const unknown = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) {
    throw new CrmV1Error(400, "crm.validation.failed", "El cuerpo contiene campos no permitidos.", false, unknown.map((field) => ({ field, code: "unknown", message: "Campo no permitido." })));
  }
  return value;
}

function normalizePeriodRecord(value: unknown): { from: string; to: string } {
  const period = exactRequestRecord(value, ["from", "to"]);
  const from = normalizeIsoDate(period.from, "period.from");
  const to = normalizeIsoDate(period.to, "period.to");
  if (new Date(from) >= new Date(to)) {
    throw validationError("period", "range", "period.from debe ser anterior a period.to.");
  }
  return { from, to };
}

export function normalizeExportRequest(input: unknown): Record<string, unknown> {
  const source = exactRequestRecord(input, ["filters", "format", "includeSensitive", "period", "reportKey", "resource"]);
  if (source.includeSensitive !== undefined && source.includeSensitive !== false) {
    throw new CrmV1Error(403, "crm.export.sensitive_not_available", "Esta version no habilita exportaciones de campos sensibles.");
  }
  const resource = source.resource === undefined ? undefined : configString(source.resource, "resource", 32);
  const reportKey = source.reportKey === undefined ? undefined : configString(source.reportKey, "reportKey", 80, /^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
  if (Boolean(resource) === Boolean(reportKey)) {
    throw validationError("body", "schema", "La exportacion debe declarar exactamente resource o reportKey.");
  }
  if (resource && !crmResourceValues.includes(resource as CrmResource)) {
    throw validationError("resource", "catalog", "El recurso solicitado no pertenece al contrato CRM v1.");
  }
  if (reportKey && !supportedReportKeys.includes(reportKey as (typeof supportedReportKeys)[number])) {
    throw validationError("reportKey", "catalog", "El reporte solicitado no pertenece al catalogo activo.");
  }
  const format = source.format === undefined ? "csv" : configString(source.format, "format", 8).toLowerCase();
  if (format !== "json" && format !== "csv") {
    throw validationError("format", "enum", "format debe ser json o csv.");
  }
  let filters: Record<string, string> | undefined;
  if (source.filters !== undefined) {
    if (!resource || !isPlainRecord(source.filters) || Object.keys(source.filters).length > 20) {
      throw validationError("filters", "schema", "filters requiere un resource y un mapa de hasta 20 valores.");
    }
    filters = {};
    for (const [key, value] of Object.entries(source.filters)) {
      if (!allowedFilters[resource as CrmResource].includes(key)) {
        throw validationError(`filters.${key}`, "allowlist", "El filtro no esta permitido para el recurso.");
      }
      filters[key] = configString(value, `filters.${key}`, 160);
    }
  }
  return {
    ...(resource ? { resource } : { reportKey }),
    format,
    includeSensitive: false,
    ...(filters ? { filters } : {}),
    ...(source.period === undefined ? {} : { period: normalizePeriodRecord(source.period) })
  };
}

export function resolveIndustryProfile(key: string, version: string): IndustryProfile {
  const profile = key === healthcareProfile.key ? healthcareProfile : key === baseProfile.key ? baseProfile : null;
  if (!profile || profile.version !== version) {
    throw new CrmV1Error(409, "crm.profile.unsupported", "El perfil solicitado no esta soportado por esta version.");
  }
  return structuredClone(profile);
}

export function defaultTenantConfiguration(profileKey = baseProfile.key, profileVersion = baseProfile.version): TenantConfiguration {
  resolveIndustryProfile(profileKey, profileVersion);
  return {
    version: 1,
    profileKey,
    profileVersion,
    timezone: "America/Santo_Domingo",
    locale: "es-DO",
    slaPolicy: { version: "1", firstActionMinutes: 60, followUpMinutes: 1440, calendarKey: "tenant-default" },
    featureFlags: { sensitiveExtensions: false, externalScheduling: false, notifications: false },
    labels: {},
    updatedAt: new Date().toISOString()
  };
}

export function normalizeConfigurationPatch(input: unknown): Partial<TenantConfiguration> {
  if (!isPlainRecord(input)) {
    throw validationError("body", "type", "La configuracion debe ser un objeto JSON.");
  }
  assertConfigurationContainsNoSensitiveKeys(input);
  const allowed = ["featureFlags", "labels", "locale", "profileKey", "profileVersion", "slaPolicy", "timezone"];
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new CrmV1Error(
      400,
      "crm.validation.failed",
      "La configuracion contiene campos no permitidos.",
      false,
      unknown.map((field) => ({ field, code: "unknown", message: "Campo no permitido." }))
    );
  }
  if (Object.keys(input).length === 0) {
    throw validationError("body", "empty", "La configuracion debe incluir al menos un cambio.");
  }

  const output: Partial<TenantConfiguration> = {};
  if (input.profileKey !== undefined) {
    output.profileKey = configString(input.profileKey, "profileKey", 64, /^[a-z][a-z0-9-]*$/u);
  }
  if (input.profileVersion !== undefined) {
    output.profileVersion = configString(input.profileVersion, "profileVersion", 32, /^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
  }
  if (input.timezone !== undefined) {
    const timezone = configString(input.timezone, "timezone", 80, /^[A-Za-z0-9_+/-]+$/u);
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    } catch {
      throw validationError("timezone", "timezone", "timezone debe ser una zona IANA valida.");
    }
    output.timezone = timezone;
  }
  if (input.locale !== undefined) {
    const locale = configString(input.locale, "locale", 32, /^[A-Za-z0-9-]+$/u);
    try {
      output.locale = new Intl.Locale(locale).toString();
    } catch {
      throw validationError("locale", "locale", "locale debe ser un locale BCP 47 valido.");
    }
  }
  if (input.slaPolicy !== undefined) {
    const policy = exactConfigurationRecord(
      input.slaPolicy,
      "slaPolicy",
      ["calendarKey", "firstActionMinutes", "followUpMinutes", "version"]
    );
    output.slaPolicy = {
      calendarKey: configString(policy.calendarKey, "slaPolicy.calendarKey", 80, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u),
      firstActionMinutes: configInteger(policy.firstActionMinutes, "slaPolicy.firstActionMinutes", 1, 525_600),
      followUpMinutes: configInteger(policy.followUpMinutes, "slaPolicy.followUpMinutes", 1, 525_600),
      version: configString(policy.version, "slaPolicy.version", 32, /^[A-Za-z0-9][A-Za-z0-9._-]*$/u)
    };
  }
  if (input.featureFlags !== undefined) {
    const flags = exactConfigurationRecord(
      input.featureFlags,
      "featureFlags",
      ["externalScheduling", "notifications", "sensitiveExtensions"]
    );
    output.featureFlags = {
      externalScheduling: configBoolean(flags.externalScheduling, "featureFlags.externalScheduling"),
      notifications: configBoolean(flags.notifications, "featureFlags.notifications"),
      sensitiveExtensions: configBoolean(flags.sensitiveExtensions, "featureFlags.sensitiveExtensions")
    };
  }
  if (input.labels !== undefined) {
    if (!isPlainRecord(input.labels) || Object.keys(input.labels).length > 64) {
      throw validationError("labels", "schema", "labels debe ser un mapa de hasta 64 etiquetas.");
    }
    output.labels = Object.fromEntries(Object.entries(input.labels).map(([key, value]) => {
      const normalizedKey = configString(key, `labels.${key}`, 64, /^[A-Za-z][A-Za-z0-9._-]*$/u);
      return [normalizedKey, configString(value, `labels.${key}`, 160)];
    }));
  }
  return output;
}

export function parseListQuery(resource: CrmResource, url: URL): CrmListQuery {
  const rawLimit = Number(url.searchParams.get("limit") ?? 25);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    throw validationError("limit", "range", "limit debe estar entre 1 y 100.");
  }
  const sort = String(url.searchParams.get("sort") ?? "updatedAt");
  if (!allowedSorts[resource].includes(sort)) {
    throw validationError("sort", "allowlist", "El campo de orden no esta permitido.");
  }
  const direction = String(url.searchParams.get("direction") ?? "desc");
  if (direction !== "asc" && direction !== "desc") {
    throw validationError("direction", "enum", "direction debe ser asc o desc.");
  }
  const filters: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (["limit", "cursor", "sort", "direction", "q"].includes(key)) continue;
    if (!allowedFilters[resource].includes(key)) {
      throw validationError(key, "allowlist", "El filtro no esta permitido.");
    }
    const normalized = normalizeText(value, key, 128);
    if (key === "attention" && !(
      (resource === "cases" && normalized === "overdue") ||
      (resource === "appointments" && normalized === "exception") ||
      (resource === "activities" && normalized === "pending")
    )) {
      throw validationError(key, "enum", "El filtro de atencion no pertenece al recurso.");
    }
    if (key === "status") {
      const statuses = resourceEnum(resource, "status");
      if (statuses && !statuses.includes(normalized)) {
        throw validationError(key, "enum", "El estado no pertenece al recurso.");
      }
    }
    filters[key] = normalized;
  }
  return {
    limit: rawLimit,
    cursor: normalizeOptionalText(url.searchParams.get("cursor"), "cursor", 512),
    q: normalizeOptionalText(url.searchParams.get("q"), "q", 160),
    sort,
    direction,
    filters
  };
}

export function assertCapability(capabilities: string[], required: string): void {
  if (!capabilities.includes(required)) {
    throw new CrmV1Error(403, "crm.permission.denied", "No tiene permiso para ejecutar esta operacion.");
  }
}

export function etagFor(record: Pick<CrmRecord, "version">): string {
  return `"${record.version}"`;
}

export function parseIfMatch(value: string | undefined): number {
  const normalized = String(value ?? "").trim();
  const match = /^(?:W\/)?"([1-9][0-9]*)"$/.exec(normalized);
  if (!match) {
    throw new CrmV1Error(428, "crm.precondition.required", "If-Match con la version actual es obligatorio.");
  }
  return Number(match[1]);
}

export function requireIdempotencyKey(value: string | undefined): string {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(normalized)) {
    throw new CrmV1Error(400, "crm.idempotency.required", "Idempotency-Key valido es obligatorio.", false, [
      { field: "Idempotency-Key", code: "format", message: "Use entre 8 y 128 caracteres opacos." }
    ]);
  }
  return normalized;
}

export function checksum(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function opaqueId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function normalizePayload(resource: CrmResource, input: unknown, partial = false): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validationError("body", "type", "El cuerpo debe ser un objeto JSON.");
  }
  const source = input as Record<string, unknown>;
  const createAllowlists: Record<CrmResource, string[]> = {
    accounts: ["name", "type", "status", "ownerId", "tags", "externalRef"],
    contacts: ["accountId", "displayName", "role", "status", "preferredChannel", "consentStatus", "externalRef", "sensitive"],
    cases: ["accountId", "contactId", "caseType", "priority", "queueId", "subject", "slaDueAt", "reasonCode", "extensions"],
    activities: ["caseId", "accountId", "contactId", "type", "status", "ownerId", "dueAt", "outcomeCode", "subject"],
    appointments: ["caseId", "accountId", "contactId", "startAt", "endAt", "timezone", "resourceId", "externalRef"],
    opportunities: ["accountId", "primaryContactId", "name", "pipelineId", "stageId", "amountMinor", "currency", "probability", "ownerId"]
  };
  const patchAllowlists: Record<CrmResource, string[]> = {
    accounts: createAllowlists.accounts,
    contacts: createAllowlists.contacts,
    cases: ["accountId", "contactId", "caseType", "priority", "queueId", "subject", "slaDueAt"],
    activities: createAllowlists.activities,
    appointments: ["accountId", "contactId", "externalRef"],
    opportunities: ["accountId", "primaryContactId", "name", "amountMinor", "currency", "probability", "ownerId"]
  };
  const allowlist = partial ? patchAllowlists[resource] : createAllowlists[resource];
  const unknown = Object.keys(source).filter((key) => !allowlist.includes(key));
  if (unknown.length > 0) {
    throw new CrmV1Error(400, "crm.validation.failed", "El cuerpo contiene campos no permitidos.", false, unknown.map((field) => ({ field, code: "unknown", message: "Campo no permitido." })));
  }
  const nonNullable: Record<CrmResource, string[]> = {
    accounts: ["name", "status", "type"],
    contacts: ["displayName", "role", "status"],
    cases: ["caseType", "priority", "subject"],
    activities: ["status", "subject", "type"],
    appointments: ["caseId"],
    opportunities: ["accountId", "name", "pipelineId", "stageId"]
  };
  const nullFields = Object.keys(source).filter((key) => source[key] === null && nonNullable[resource].includes(key));
  if (nullFields.length > 0) {
    throw new CrmV1Error(400, "crm.validation.failed", "Campos obligatorios no admiten null.", false, nullFields.map((field) => ({ field, code: "required", message: "Campo obligatorio." })));
  }
  const required: Record<CrmResource, string[]> = {
    accounts: ["name", "type"], contacts: ["displayName", "role"], cases: ["caseType", "subject", "priority"],
    activities: ["type", "subject"], appointments: ["caseId"], opportunities: ["name", "accountId", "pipelineId", "stageId"]
  };
  if (!partial) {
    const missing = required[resource].filter((key) => source[key] === undefined || source[key] === null || source[key] === "");
    if (missing.length > 0) {
      throw new CrmV1Error(400, "crm.validation.failed", "Faltan campos obligatorios.", false, missing.map((field) => ({ field, code: "required", message: "Campo obligatorio." })));
    }
  }
  return normalizeKnownValues(resource, source, partial);
}

export function assertTransition(kind: "case" | "appointment", current: string, target: string): void {
  const graph = kind === "case" ? caseTransitions : appointmentTransitions;
  if (!graph[current]?.includes(target)) {
    throw new CrmV1Error(409, `crm.${kind}.transition_invalid`, "La transicion solicitada no esta permitida.");
  }
}

export function identitySubject(identity: CrmIdentity): string {
  return identity.subject || "unknown";
}

export function deriveLifecycleFields(
  resource: CrmResource,
  input: Record<string, unknown>,
  occurredAt: string
): Record<string, unknown> {
  if (resource !== "activities") return input;
  return {
    ...input,
    completedAt: input.status === "completed" ? input.completedAt ?? occurredAt : null
  };
}

function normalizeKnownValues(resource: CrmResource, source: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (raw === undefined) continue;
    if (key === "tags") {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) throw validationError(key, "type", "tags debe ser una lista de texto.");
      output[key] = [...new Set(raw.map((item) => normalizeText(item, key, 64)))].slice(0, 25);
    } else if (key === "amountMinor") {
      const value = Number(raw); if (!Number.isSafeInteger(value) || value < 0) throw validationError(key, "range", "amountMinor debe ser un entero no negativo."); output[key] = value;
    } else if (key === "probability") {
      const value = Number(raw); if (!Number.isInteger(value) || value < 0 || value > 100) throw validationError(key, "range", "probability debe estar entre 0 y 100."); output[key] = value;
    } else if (key === "sensitive" || key === "extensions") {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw validationError(key, "type", `${key} debe ser un objeto.`); output[key] = structuredClone(raw);
    } else if (raw === null) {
      output[key] = null;
    } else if (["dueAt", "endAt", "slaDueAt", "startAt"].includes(key)) {
      output[key] = normalizeIsoDate(raw, key);
    } else if (key === "timezone") {
      output[key] = normalizeTimezone(raw, key);
    } else if (key === "currency") {
      const currency = normalizeText(raw, key, 3).toUpperCase();
      if (!/^[A-Z]{3}$/u.test(currency)) throw validationError(key, "format", "currency debe ser un codigo ISO de tres letras.");
      output[key] = currency;
    } else {
      const normalized = normalizeText(raw, key, key === "subject" ? 240 : 160);
      const allowed = resourceEnum(resource, key);
      if (allowed && !allowed.includes(normalized)) throw validationError(key, "enum", `${key} no pertenece al catalogo permitido.`);
      output[key] = normalized;
    }
  }
  if (!partial && !output.status) {
    const defaults: Partial<Record<CrmResource, string>> = { accounts: "active", contacts: "active", cases: "new", activities: "open", appointments: "requested", opportunities: "open" };
    if (defaults[resource]) output.status = defaults[resource];
  }
  if (resource === "opportunities") {
    if (!partial && ["won", "lost"].includes(String(output.stageId ?? ""))) {
      throw validationError("stageId", "lifecycle", "Una oportunidad nueva no puede iniciar en una etapa terminal.");
    }
    if (!partial || Object.hasOwn(output, "currency")) output.currency = String(output.currency ?? "USD").toUpperCase();
    if (!partial || Object.hasOwn(output, "probability")) output.probability = Number(output.probability ?? 0);
    if (!partial || Object.hasOwn(output, "amountMinor")) output.amountMinor = Number(output.amountMinor ?? 0);
  }
  return output;
}

function normalizeText(value: unknown, field: string, max: number): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max) throw validationError(field, "length", `${field} debe tener entre 1 y ${max} caracteres.`);
  return normalized;
}

function normalizeIsoDate(value: unknown, field: string): string {
  const parsed = new Date(String(value ?? ""));
  if (Number.isNaN(parsed.valueOf())) throw validationError(field, "date-time", `${field} debe ser una fecha ISO valida.`);
  return parsed.toISOString();
}

function normalizeTimezone(value: unknown, field: string): string {
  const timezone = normalizeText(value, field, 80);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw validationError(field, "timezone", `${field} debe ser una zona IANA valida.`);
  }
  return timezone;
}

function resourceEnum(resource: CrmResource, key: string): string[] | null {
  const enums: Partial<Record<CrmResource, Record<string, string[]>>> = {
    accounts: { status: ["active", "paused", "archived"], type: ["organization", "person", "household"] },
    contacts: {
      consentStatus: ["unknown", "recorded", "revoked"],
      preferredChannel: ["phone", "email", "sms", "none"],
      status: ["active", "paused", "archived"]
    },
    cases: { priority: ["low", "normal", "high", "urgent"], status: ["new", "triaged", "in_progress", "waiting_external", "resolved", "closed", "reopened", "cancelled"] },
    activities: { status: ["open", "in_progress", "completed", "cancelled"], type: ["call", "task", "follow_up", "email", "note"] },
    appointments: { status: ["requested", "scheduled", "confirmed", "rescheduled", "cancelled", "completed", "no_show", "sync_failed"] },
    opportunities: { status: ["open", "closed"] }
  };
  return enums[resource]?.[key] ?? null;
}

function assertConfigurationContainsNoSensitiveKeys(value: unknown, path = "body", depth = 0): void {
  if (depth > 8) throw validationError(path, "depth", "La configuracion excede la profundidad permitida.");
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertConfigurationContainsNoSensitiveKeys(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === "body" ? key : `${path}.${key}`;
    if (/secret|token|password/iu.test(key) || ["__proto__", "constructor", "prototype"].includes(key)) {
      throw validationError(childPath, "sensitive-key", "La configuracion no admite secretos, tokens ni passwords.");
    }
    assertConfigurationContainsNoSensitiveKeys(child, childPath, depth + 1);
  }
}

function exactConfigurationRecord(value: unknown, field: string, keys: string[]): Record<string, unknown> {
  if (!isPlainRecord(value)) throw validationError(field, "type", `${field} debe ser un objeto JSON.`);
  const observed = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index])) {
    throw validationError(field, "schema", `${field} debe declarar exactamente: ${expected.join(", ")}.`);
  }
  return value;
}

function configString(value: unknown, field: string, max: number, pattern?: RegExp): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized) || (pattern && !pattern.test(normalized))) {
    throw validationError(field, "format", `${field} no cumple el formato permitido.`);
  }
  return normalized;
}

function configInteger(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw validationError(field, "range", `${field} debe ser un entero entre ${min} y ${max}.`);
  }
  return Number(value);
}

function configBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw validationError(field, "type", `${field} debe ser booleano.`);
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeOptionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return normalizeText(value, field, max);
}

function validationError(field: string, code: string, message: string): CrmV1Error {
  return new CrmV1Error(400, "crm.validation.failed", "La solicitud contiene valores invalidos.", false, [{ field, code, message }]);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
