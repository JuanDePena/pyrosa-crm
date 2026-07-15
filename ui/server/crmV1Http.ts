import type { IncomingMessage, ServerResponse } from "node:http";
import type { CrmSession } from "./auth.js";
import type { CrmServerConfig } from "./config.js";
import { identityFromPrincipal, resolveCrmAccess } from "./crmV1Access.js";
import {
  CrmV1Error,
  assertMutationRequestSecurity,
  checksum,
  etagFor,
  normalizeConfigurationPatch,
  normalizeExportRequest,
  normalizePayload,
  normalizeReportRunRequest,
  parseIfMatch,
  parseListQuery,
  requireIdempotencyKey,
  resourceCapabilities
} from "./crmV1Domain.js";
import { PostgresCrmV1Store } from "./crmV1Postgres.js";
import type { CrmV1Store } from "./crmV1Store.js";
import { crmResources, type CrmAccessContext, type CrmIdentity, type CrmResource } from "./crmV1Types.js";
import { sendJson, type RequestContext } from "./http.js";
import type { CrmApiPrincipal } from "./oauthApiAuth.js";

let runtimeStore: CrmV1Store | null = null;

export async function handleCrmV1(
  req: IncomingMessage,
  res: ServerResponse,
  config: CrmServerConfig,
  context: RequestContext,
  principal: CrmSession | CrmApiPrincipal,
  storeOverride?: CrmV1Store
): Promise<void> {
  const store = storeOverride ?? (runtimeStore ??= new PostgresCrmV1Store(config));
  try {
    assertMutationRequestSecurity({
      contentType: header(req, "content-type"),
      csrfToken: header(req, "x-csrf-token"),
      expectedCsrfToken: "csrf" in principal ? principal.csrf : undefined,
      method: req.method
    });
    const identity = identityFromPrincipal(principal, config);
    await dispatch(req, res, config, context, identity, store);
  } catch (error) {
    sendCrmV1Error(res, context, error);
  }
}

export async function resolveBootstrapContext(
  req: IncomingMessage,
  context: RequestContext,
  config: CrmServerConfig,
  session: CrmSession
): Promise<CrmAccessContext> {
  return resolveCrmAccess(req, context, config, identityFromPrincipal(session, config), "crm.dashboard.read");
}

async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  config: CrmServerConfig,
  context: RequestContext,
  identity: CrmIdentity,
  store: CrmV1Store
): Promise<void> {
  const path = context.url.pathname.slice("/api/crm/v1".length).replace(/^\/+|\/+$/g, "");
  const segments = path ? path.split("/") : [];
  const method = String(req.method ?? "GET").toUpperCase();

  if (segments.length === 0) {
    const access = await resolveCrmAccess(req, context, config, identity, "crm.dashboard.read");
    sendData(res, context, access, { contractVersion: "crm-api-v1", resources: [...crmResources], context: publicContext(access) });
    return;
  }

  if (segments[0] === "context" && method === "GET") {
    const access = await resolveCrmAccess(req, context, config, identity, "crm.dashboard.read");
    sendData(res, context, access, publicContext(access));
    return;
  }

  if (segments[0] === "dashboard-summary" && method === "GET") {
    const access = await resolveCrmAccess(req, context, config, identity, "crm.dashboard.read");
    const period = parsePeriod(context.url, access.timezone);
    sendData(res, context, access, await store.dashboard(access, period));
    return;
  }

  if (segments[0] === "profiles" && method === "GET" && segments.length === 1) {
    const access = await resolveCrmAccess(req, context, config, identity, "crm.config.read");
    sendList(res, context, access, await store.profiles());
    return;
  }

  if (segments[0] === "profile" && segments[1] === "effective" && method === "GET") {
    const access = await resolveCrmAccess(req, context, config, identity, "crm.config.read");
    sendData(res, context, access, await store.effectiveProfile(access));
    return;
  }

  if (segments[0] === "config") {
    const capability = method === "GET" ? "crm.config.read" : "crm.config.manage";
    const access = await resolveCrmAccess(req, context, config, identity, capability);
    if (method === "GET") {
      const configRecord = await store.getConfiguration(access);
      sendData(res, context, access, configRecord, 200, { ETag: `"${configRecord.version}"` });
      return;
    }
    if (method === "PATCH") {
      const body = normalizeConfigurationPatch(await readJson(req));
      const expectedVersion = parseIfMatch(header(req, "if-match"));
      const mutation = mutationContext(req, context, identity, access, body);
      const updated = await store.updateConfiguration(body, expectedVersion, mutation);
      sendData(res, context, access, updated, 200, { ETag: `"${updated.version}"` });
      return;
    }
    methodNotAllowed();
  }

  if (segments[0] === "reports" && method === "GET") {
    const access = await resolveCrmAccess(req, context, config, identity, "crm.reports.read");
    const reports = await store.reports(access);
    if (segments.length === 1) {
      const query = String(context.url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
      const filtered = query ? reports.filter((report) => [report.key, report.label, report.description].some((value) => value.toLocaleLowerCase().includes(query))) : reports;
      sendList(res, context, access, filtered);
      return;
    }
    if (segments.length === 2) {
      const report = reports.find((item) => item.id === segments[1] || item.key === segments[1]);
      if (!report) notFound("crm.report.not_found", "No existe el reporte solicitado para el perfil efectivo.");
      sendData(res, context, access, report);
      return;
    }
    notFound("crm.report.not_found", "No existe el reporte solicitado para el perfil efectivo.");
    return;
  }

  if (segments[0] === "report-runs" && method === "POST") {
    const access = await resolveCrmAccess(req, context, config, identity, "crm.reports.read");
    const body = normalizeReportRunRequest(await readJson(req));
    const reports = await store.reports(access);
    if (!reports.some((report) => report.key === body.reportKey)) {
      notFound("crm.report.not_available", "El reporte no esta disponible para el perfil efectivo.");
    }
    const result = await store.createJob("report-run", body, mutationContext(req, context, identity, access, body));
    sendData(res, context, access, result.job, result.replayed ? 200 : 202, { "Idempotency-Replayed": String(result.replayed) });
    return;
  }

  if (segments[0] === "exports") {
    const access = await resolveCrmAccess(req, context, config, identity, method === "POST" ? "crm.exports.create" : "crm.reports.read");
    if (method === "POST" && segments.length === 1) {
      const body = normalizeExportRequest(await readJson(req));
      if (body.reportKey) {
        const reports = await store.reports(access);
        if (!reports.some((report) => report.key === body.reportKey)) {
          notFound("crm.report.not_available", "El reporte no esta disponible para el perfil efectivo.");
        }
      }
      const result = await store.createJob("export", body, mutationContext(req, context, identity, access, body));
      sendData(res, context, access, result.job, result.replayed ? 200 : 202, { "Idempotency-Replayed": String(result.replayed) });
      return;
    }
    if (method === "GET" && segments[1]) {
      const job = await store.getJob(access, segments[1]);
      if (!job || job.kind !== "export") notFound("crm.export.not_found", "No existe la exportacion solicitada.");
      sendData(res, context, access, job);
      return;
    }
    methodNotAllowed();
  }

  if (segments[0] === "imports") {
    const access = await resolveCrmAccess(req, context, config, identity, method === "GET" ? "crm.imports.read" : "crm.imports.manage");
    if (method === "POST" && segments[1] === "preflight") {
      const body = await readJson(req, 2_000_000);
      const result = await store.importPreflight(body, mutationContext(req, context, identity, access, body));
      sendData(res, context, access, result.batch, result.replayed ? 200 : 202, { "Idempotency-Replayed": String(result.replayed), ETag: etagFor(result.batch) });
      return;
    }
    if (method === "GET" && segments[1]) {
      const batch = await store.getImport(access, segments[1]);
      if (!batch) notFound("crm.import.not_found", "No existe el lote solicitado.");
      sendData(res, context, access, batch, 200, { ETag: etagFor(batch) });
      return;
    }
    if (method === "POST" && segments[1] && ["dry-run", "commit", "rollback"].includes(segments[2] ?? "")) {
      const body = await readJson(req);
      const result = await store.importCommand(segments[1], segments[2] as "dry-run" | "commit" | "rollback", mutationContext(req, context, identity, access, body));
      sendData(res, context, access, result.batch, result.replayed ? 200 : 202, { "Idempotency-Replayed": String(result.replayed), ETag: etagFor(result.batch) });
      return;
    }
    methodNotAllowed();
  }

  if (isResource(segments[0])) {
    await handleResource(req, res, config, context, identity, store, segments[0], segments.slice(1), method);
    return;
  }
  notFound("crm.route.not_found", "Ruta CRM v1 no encontrada.");
}

async function handleResource(
  req: IncomingMessage,
  res: ServerResponse,
  config: CrmServerConfig,
  context: RequestContext,
  identity: CrmIdentity,
  store: CrmV1Store,
  resource: CrmResource,
  rest: string[],
  method: string
): Promise<void> {
  const command = rest[1] ?? null;
  const write = method === "POST" || method === "PATCH";
  const required = command === "assign" && resource === "cases" ? "crm.cases.assign" : write ? resourceCapabilities[resource].write : resourceCapabilities[resource].read;
  const access = await resolveCrmAccess(req, context, config, identity, required);
  if (rest.length === 0 && method === "GET") {
    const page = await store.list(access, resource, parseListQuery(resource, context.url));
    sendJson(res, 200, { data: page.data, page: { limit: Number(context.url.searchParams.get("limit") ?? 25), nextCursor: page.nextCursor, total: page.total }, meta: meta(context, access) }, context.headOnly);
    return;
  }
  if (rest.length === 0 && method === "POST") {
    const body = normalizePayload(resource, await readJson(req));
    const result = await store.create(resource, body, mutationContext(req, context, identity, access, body));
    sendData(res, context, access, result.record, result.replayed ? 200 : 201, { "Idempotency-Replayed": String(result.replayed), ETag: etagFor(result.record) });
    return;
  }
  const id = rest[0];
  if (!id) notFound("crm.resource.not_found", "No existe el recurso solicitado.");
  if (rest.length === 1 && (method === "GET" || method === "HEAD")) {
    const record = await store.get(access, resource, id);
    if (!record) notFound(`crm.${resource.slice(0, -1)}.not_found`, "No existe el recurso solicitado.");
    const etag = etagFor(record);
    if (header(req, "if-none-match") === etag) {
      res.statusCode = 304; res.setHeader("ETag", etag); res.end(); return;
    }
    sendData(res, context, access, record, 200, { ETag: etag });
    return;
  }
  if (rest.length === 1 && method === "PATCH") {
    const body = normalizePayload(resource, await readJson(req), true);
    const result = await store.update(resource, id, body, parseIfMatch(header(req, "if-match")), mutationContext(req, context, identity, access, body));
    sendData(res, context, access, result.record, 200, { "Idempotency-Replayed": String(result.replayed), ETag: etagFor(result.record) });
    return;
  }
  if (rest.length === 2 && method === "POST" && isCommand(resource, command)) {
    const body = await readJson(req);
    const result = await store.command(resource, id, { name: command, payload: body, expectedVersion: parseIfMatch(header(req, "if-match")) }, mutationContext(req, context, identity, access, body));
    sendData(res, context, access, result.record, 200, { "Idempotency-Replayed": String(result.replayed), ETag: etagFor(result.record) });
    return;
  }
  methodNotAllowed();
}

function mutationContext(req: IncomingMessage, context: RequestContext, actor: CrmIdentity, access: CrmAccessContext, body: unknown) {
  const idempotencyKey = requireIdempotencyKey(header(req, "idempotency-key"));
  return { correlationId: context.correlationId, requestId: context.requestId, actor, access, idempotencyKey, requestChecksum: checksum({ method: req.method, path: context.url.pathname, body }) };
}

async function readJson(req: IncomingMessage, maxBytes = 262_144): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.length;
    if (size > maxBytes) throw new CrmV1Error(413, "crm.request.too_large", "El cuerpo excede el limite permitido.");
    chunks.push(value);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
    return parsed as Record<string, unknown>;
  } catch {
    throw new CrmV1Error(400, "crm.request.json_invalid", "El cuerpo JSON no es valido.");
  }
}

export function sendCrmV1Error(
  res: ServerResponse,
  context: Pick<RequestContext, "headOnly" | "requestId">,
  error: unknown
): void {
  const known = error instanceof CrmV1Error ? error : new CrmV1Error(500, "crm.internal.error", "PYROSA CRM no pudo completar la solicitud.", true);
  sendJson(res, known.status, { error: { code: known.code, message: known.message, requestId: context.requestId, occurredAt: new Date().toISOString(), retryable: known.retryable, fields: known.fields } }, context.headOnly);
}

function sendData(res: ServerResponse, context: RequestContext, access: CrmAccessContext, data: unknown, status = 200, headers: Record<string, string> = {}): void {
  sendJson(res, status, { data, meta: meta(context, access) }, context.headOnly, headers);
}

function sendList(res: ServerResponse, context: RequestContext, access: CrmAccessContext, data: unknown[]): void {
  sendJson(res, 200, { data, page: { limit: data.length, nextCursor: null, total: data.length }, meta: meta(context, access) }, context.headOnly);
}

function meta(context: RequestContext, access: CrmAccessContext) { return { requestId: context.requestId, tenantId: access.tenantId, asOf: new Date().toISOString() }; }
function publicContext(access: CrmAccessContext) { return { activeTenantId: access.tenantId, tenantKey: access.tenantKey, displayName: access.displayName, profileKey: access.profileKey, profileVersion: access.profileVersion, timezone: access.timezone, locale: access.locale, dictionaryVersion: access.dictionaryVersion, capabilities: access.capabilities }; }
function header(req: IncomingMessage, name: string): string | undefined { const value = req.headers[name]; return Array.isArray(value) ? value[0] : value; }
function isResource(value: string | undefined): value is CrmResource { return crmResources.includes(value as CrmResource); }
function isCommand(resource: CrmResource, value: string | null): value is string { return Boolean(value && ((resource === "cases" && ["assign", "transition"].includes(value)) || (resource === "appointments" && ["schedule", "confirm", "reschedule", "cancel", "complete", "no-show"].includes(value)) || (resource === "opportunities" && value === "transition"))); }
function parsePeriod(url: URL, _timezone: string): { from: string; to: string } { const to = parseDate(url.searchParams.get("to")) ?? new Date(); const from = parseDate(url.searchParams.get("from")) ?? new Date(to.valueOf() - 30 * 86_400_000); if (from >= to) throw new CrmV1Error(400, "crm.period.invalid", "El periodo solicitado no es valido."); return { from: from.toISOString(), to: to.toISOString() }; }
function parseDate(value: string | null): Date | null { if (!value) return null; const date = new Date(value); if (Number.isNaN(date.valueOf())) throw new CrmV1Error(400, "crm.period.invalid", "El periodo solicitado no es valido."); return date; }
function methodNotAllowed(): never { throw new CrmV1Error(405, "crm.method.not_allowed", "Metodo no permitido para esta ruta."); }
function notFound(code: string, message: string): never { throw new CrmV1Error(404, code, message); }
