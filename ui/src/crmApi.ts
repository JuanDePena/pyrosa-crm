import type { TechnicalIssue } from "./crmTypes";

type CrmErrorEnvelope = {
  error?: {
    code?: string;
    fields?: unknown[];
    message?: string;
    occurredAt?: string;
    requestId?: string;
    retryable?: boolean;
  };
};

export class CrmApiError extends Error {
  readonly issue: TechnicalIssue;

  constructor(message: string, issue: TechnicalIssue) {
    super(message);
    this.name = "CrmApiError";
    this.issue = issue;
  }
}

export type CrmRequestOptions = {
  body?: unknown;
  etag?: string;
  idempotencyKey?: string;
  method?: "GET" | "POST" | "PATCH";
  signal?: AbortSignal;
  tenantId: string;
};

let browserCsrfToken: string | undefined;

export function setCrmCsrfToken(token: string | undefined): void {
  browserCsrfToken = token?.trim() || undefined;
}

export async function fetchAppJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return fetchJson<T>(url, {
    headers: { accept: "application/json" },
    method: "GET",
    signal
  });
}

export async function fetchCrmJson<T>(url: string, options: CrmRequestOptions): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    accept: "application/json",
    "X-Pyrosa-Tenant-Id": options.tenantId
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (options.etag) {
    headers["If-Match"] = options.etag;
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  if (method === "POST" || method === "PATCH") {
    if (!browserCsrfToken) {
      throw new CrmApiError("La sesion no esta lista para realizar cambios.", {
        code: "crm.csrf.token_missing",
        retryable: false
      });
    }
    headers["X-CSRF-Token"] = browserCsrfToken;
  }
  return fetchJson<T>(url, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
    headers,
    method,
    signal: options.signal
  });
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new CrmApiError("No fue posible conectar con DemoCRM.", {
      code: "crm.network.unavailable",
      retryable: true
    });
  }

  const requestId = response.headers.get("x-request-id") ?? undefined;
  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown = null;
  if (response.status !== 204) {
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new CrmApiError("DemoCRM devolvio una respuesta no valida.", {
        code: "crm.response.invalid_content_type",
        requestId,
        retryable: response.status >= 500,
        status: response.status
      });
    }
    try {
      payload = await response.json();
    } catch {
      throw new CrmApiError("DemoCRM devolvio una respuesta no valida.", {
        code: "crm.response.invalid_json",
        requestId,
        retryable: response.status >= 500,
        status: response.status
      });
    }
  }

  if (!response.ok) {
    const envelope = isObject(payload) ? payload as CrmErrorEnvelope : {};
    const apiError = envelope.error;
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.assign(crmLoginHref(window.location));
    }
    throw new CrmApiError(apiError?.message || publicStatusMessage(response.status), {
      code: apiError?.code || `crm.http.${response.status}`,
      occurredAt: apiError?.occurredAt,
      requestId: apiError?.requestId || requestId,
      retryable: apiError?.retryable ?? response.status >= 500,
      status: response.status
    });
  }

  return payload as T;
}

export function crmLoginHref(location: Pick<Location, "hash" | "pathname" | "search">): string {
  const returnTo = safeBrowserReturnTo(`${location.pathname}${location.search}${location.hash}`);
  return `/auth/login?return_to=${encodeURIComponent(returnTo)}`;
}

function safeBrowserReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/ui";
}

export function technicalIssueFrom(error: unknown): TechnicalIssue {
  if (error instanceof CrmApiError) {
    return error.issue;
  }
  return {
    code: "crm.client.unexpected",
    retryable: false
  };
}

export function publicMessageFrom(error: unknown): string {
  return error instanceof CrmApiError
    ? error.message
    : "No fue posible completar la operacion solicitada.";
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `crm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function entityEtag(version: unknown): string | undefined {
  return typeof version === "number" && Number.isSafeInteger(version) && version >= 0
    ? `"${version}"`
    : undefined;
}

function publicStatusMessage(status: number): string {
  if (status === 401) return "La sesion ya no es valida.";
  if (status === 403) return "No tienes permiso para realizar esta operacion.";
  if (status === 404) return "El recurso solicitado no existe.";
  if (status === 409 || status === 412) return "El recurso cambio mientras lo estabas revisando.";
  if (status === 422) return "Algunos datos no cumplen el contrato requerido.";
  if (status === 429) return "Hay demasiadas solicitudes. Intenta nuevamente mas tarde.";
  if (status >= 500) return "DemoCRM tiene un problema interno temporal.";
  return "No fue posible completar la operacion solicitada.";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
