import type { CrmLocation, ResourceRouteId, ResourceViewMode } from "./crmTypes";
import { resolveCrmRouteId, routeById } from "./routeRegistry";
import type { CrmRouteId } from "./routeRegistry";

const safeRecordIdPattern = /^[A-Za-z0-9._~-]{1,128}$/u;
const safeFilterPattern = /^[A-Za-z0-9._~-]{1,64}$/u;

export function locationFromHash(hash: string): CrmLocation {
  const withoutHash = hash.replace(/^#/, "");
  const [raw = "", queryString = ""] = withoutHash.split("?", 2);
  const parameters = new URLSearchParams(queryString);
  const rawStatus = parameters.get("status") ?? "";
  const statusFilter = safeFilterPattern.test(rawStatus) ? rawStatus : undefined;
  const rawSort = parameters.get("sort") ?? "";
  const sort = safeFilterPattern.test(rawSort) ? rawSort : undefined;
  const rawDirection = parameters.get("direction");
  const direction = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : undefined;
  const rawAttention = parameters.get("attention");
  const attentionFilter = rawAttention === "overdue" || rawAttention === "exception" || rawAttention === "pending" ? rawAttention : undefined;
  const segments = raw.split("/").filter(Boolean).map(safeDecode);
  const routeId = resolveCrmRouteId(segments[0] ?? "dashboard");
  if (routeId === "dashboard" || routeId === "configuracion") {
    return { mode: "list", routeId };
  }
  const second = segments[1];
  if (!second) {
    return { attentionFilter, direction, mode: "list", routeId, sort, statusFilter };
  }
  if (second === "new") {
    return { mode: "new", routeId };
  }
  if (!safeRecordIdPattern.test(second)) {
    return { mode: "list", routeId };
  }
  const mode: ResourceViewMode = segments[2] === "edit" ? "edit" : "detail";
  return { mode, recordId: second, routeId };
}

export function routeHash(routeId: CrmRouteId, mode: ResourceViewMode = "list", recordId?: string): string {
  const root = `#${routeById[routeId].hash}`;
  if (routeId === "dashboard" || routeId === "configuracion" || mode === "list") {
    return root;
  }
  if (mode === "new") {
    return `${root}/new`;
  }
  if (!recordId || !safeRecordIdPattern.test(recordId)) {
    return root;
  }
  return `${root}/${encodeURIComponent(recordId)}${mode === "edit" ? "/edit" : ""}`;
}

export function navigateToLocation(routeId: CrmRouteId, mode: ResourceViewMode = "list", recordId?: string): void {
  const nextHash = routeHash(routeId, mode, recordId);
  if (typeof window !== "undefined" && window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

export function allowedDashboardRoute(rawRoute: string | undefined): string | undefined {
  if (!rawRoute) return undefined;
  const parsed = locationFromHash(rawRoute.startsWith("#") ? rawRoute : `#${rawRoute}`);
  const base = routeHash(parsed.routeId, parsed.mode, parsed.recordId);
  const parameters = new URLSearchParams();
  if (parsed.statusFilter) parameters.set("status", parsed.statusFilter);
  if (parsed.attentionFilter) parameters.set("attention", parsed.attentionFilter);
  if (parsed.sort) parameters.set("sort", parsed.sort);
  if (parsed.direction) parameters.set("direction", parsed.direction);
  const query = parameters.toString();
  return query ? `${base}?${query}` : base;
}

export function isResourceRoute(routeId: CrmRouteId): routeId is ResourceRouteId {
  return routeId !== "dashboard" && routeId !== "configuracion";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
