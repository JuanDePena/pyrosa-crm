import React from "react";
import type { PageSize } from "@pyrosa/ui";
import {
  BusinessRecordRecycleBinTemplate,
  type BusinessRecordDetailConfig,
  type BusinessRecordInventoryConfig
} from "@pyrosa/ui-templates";
import {
  CrmApiError,
  entityEtag,
  fetchCrmJson,
  newIdempotencyKey,
  publicMessageFrom
} from "./crmApi";
import { navigateToLocation, routeHash } from "./crmRouting";
import type { ApiDetailResponse, ApiListResponse, RecycleBinEntry, ResourceViewMode } from "./crmTypes";

type RecycleInventoryRow = RecycleBinEntry & {
  inventoryCreatedAt: string;
  inventoryResourceClass: string;
  inventoryResourceType: string;
  inventoryStatus: string;
};

type InventoryState =
  | { kind: "loading" }
  | { error: unknown; kind: "error" }
  | { kind: "ready"; response: ApiListResponse<RecycleBinEntry> };

type DetailState =
  | { kind: "loading" }
  | { error: unknown; kind: "error" }
  | { entry: RecycleBinEntry; kind: "ready" };

export function RecycleBinView({ mode, recordId, tenantId }: { mode: ResourceViewMode; recordId?: string; tenantId: string }) {
  return mode === "detail" && recordId
    ? <RecycleBinDetail entryId={recordId} tenantId={tenantId} />
    : <RecycleBinInventory tenantId={tenantId} />;
}

function RecycleBinInventory({ tenantId }: { tenantId: string }) {
  const [queryInput, setQueryInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = React.useState<Array<string | undefined>>([]);
  const [pageSize, setPageSize] = React.useState<PageSize>(25);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [state, setState] = React.useState<InventoryState>({ kind: "loading" });

  React.useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ limit: String(pageSize) });
    if (query) parameters.set("q", query);
    if (cursor) parameters.set("cursor", cursor);
    setState({ kind: "loading" });
    void fetchCrmJson<ApiListResponse<RecycleBinEntry>>(`/api/crm/v1/recycle-bin?${parameters.toString()}`, {
      signal: controller.signal
    }).then((response) => {
      if (!Array.isArray(response?.data) || !response.page) {
        throw new CrmApiError("La papelera no cumple el contrato CRM v1.", {
          code: "crm.recycle_bin.contract_invalid",
          retryable: true
        });
      }
      setState({ kind: "ready", response });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ error, kind: "error" });
    });
    return () => controller.abort();
  }, [cursor, pageSize, query, reloadKey, tenantId]);

  const response = state.kind === "ready" ? state.response : null;
  const rows: RecycleInventoryRow[] = (response?.data ?? []).map((entry) => ({
    ...entry,
    inventoryCreatedAt: formatTimestamp(entry.createdAt),
    inventoryResourceClass: resourceClassLabel(entry.resourceClass),
    inventoryResourceType: resourceTypeLabel(entry.resourceType),
    inventoryStatus: entry.status === "active" ? "En papelera" : "Restaurado"
  }));
  const currentPage = cursorHistory.length + 1;

  async function restore(entry: RecycleBinEntry) {
    await fetchCrmJson<ApiDetailResponse<RecycleBinEntry>>(
      `/api/crm/v1/recycle-bin/${encodeURIComponent(entry.resourceType)}/${encodeURIComponent(entry.id)}/restore`,
      {
        body: {},
        etag: entityEtag(entry.version),
        idempotencyKey: newIdempotencyKey(),
        method: "POST"
      }
    );
    setReloadKey((value) => value + 1);
  }

  const inventory: BusinessRecordInventoryConfig<RecycleInventoryRow> = {
    filters: {
      fields: [{
        id: "query",
        kind: "text",
        label: "Buscar",
        onValueChange: setQueryInput,
        placeholder: "recurso o registro",
        value: queryInput
      }],
      onApply: () => {
        setQuery(queryInput.trim());
        setCursor(undefined);
        setCursorHistory([]);
      },
      onClear: () => {
        setQueryInput("");
        setQuery("");
        setCursor(undefined);
        setCursorHistory([]);
      },
      showApply: true,
      title: "Filtros"
    },
    metrics: [
      { id: "total", indicatorSemanticId: "indicator.total", label: "Registros", value: response?.page.total ?? rows.length },
      { id: "restorable", indicatorSemanticId: "indicator.active", label: "Restaurables", tone: "success", value: rows.length }
    ],
    pagination: {
      disabled: state.kind === "loading",
      onPageChange: (page) => {
        if (page === currentPage - 1 && cursorHistory.length > 0) {
          const previous = cursorHistory[cursorHistory.length - 1];
          setCursorHistory((history) => history.slice(0, -1));
          setCursor(previous);
        } else if (page === currentPage + 1 && response?.page.nextCursor) {
          setCursorHistory((history) => [...history, cursor]);
          setCursor(response.page.nextCursor);
        }
      },
      onPageSizeChange: (nextPageSize) => {
        setPageSize(nextPageSize);
        setCursor(undefined);
        setCursorHistory([]);
      },
      page: currentPage,
      pageSize,
      pageSizePersistenceKey: "democrm-recycle-bin-inventory",
      totalPages: response?.page.nextCursor ? currentPage + 1 : currentPage
    },
    table: {
      actions: [{ actionSemanticId: "collection.refresh", id: "refresh", label: "Actualizar papelera", onAction: () => setReloadKey((value) => value + 1), variant: "secondary" }],
      columns: [
        { key: "resourceType", label: "Recurso", valueKey: "inventoryResourceType" },
        { key: "resourceLabel", label: "Registro", valueKey: "resourceLabel", width: "34%" },
        { key: "resourceClass", label: "Clase", valueKey: "inventoryResourceClass" },
        { key: "createdAt", label: "Retirado", valueKey: "inventoryCreatedAt" },
        { key: "status", label: "Estado", valueKey: "inventoryStatus" }
      ],
      density: "compact",
      emptyMessage: "No hay registros activos en la papelera.",
      getRowActions: (entry) => [
        { actionSemanticId: "record.view", href: routeHash("papelera", "detail", entry.id), id: "view", label: `Ver ${entry.resourceLabel}` },
        { actionSemanticId: "record.restore", id: "restore", label: `Restaurar ${entry.resourceLabel}`, onAction: () => void restore(entry), role: "primary", variant: "primary" }
      ],
      getRowId: (entry) => entry.id,
      onRowActivate: (entry) => navigateToLocation("papelera", "detail", entry.id),
      recordCount: response?.page.total ?? rows.length,
      rows,
      scrollPersistenceKey: "democrm-recycle-bin",
      state: state.kind === "error" ? "error" : state.kind === "loading" ? "loading" : rows.length === 0 ? "empty" : "ready",
      stateMessage: state.kind === "error" ? publicMessageFrom(state.error) : undefined,
      tableMinWidth: "860px",
      title: "Papelera"
    }
  };

  return <BusinessRecordRecycleBinTemplate config={{ inventory, mode: "inventory" }} />;
}

function RecycleBinDetail({ entryId, tenantId }: { entryId: string; tenantId: string }) {
  const [restoring, setRestoring] = React.useState(false);
  const [state, setState] = React.useState<DetailState>({ kind: "loading" });

  React.useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    void fetchCrmJson<ApiDetailResponse<RecycleBinEntry>>(`/api/crm/v1/recycle-bin/${encodeURIComponent(entryId)}`, {
      signal: controller.signal
    }).then((response) => setState({ entry: response.data, kind: "ready" })).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ error, kind: "error" });
    });
    return () => controller.abort();
  }, [entryId, tenantId]);

  const entry = state.kind === "ready" ? state.entry : null;
  async function restore() {
    if (!entry || entry.status !== "active") return;
    setRestoring(true);
    try {
      await fetchCrmJson<ApiDetailResponse<RecycleBinEntry>>(
        `/api/crm/v1/recycle-bin/${encodeURIComponent(entry.resourceType)}/${encodeURIComponent(entry.id)}/restore`,
        { body: {}, etag: entityEtag(entry.version), idempotencyKey: newIdempotencyKey(), method: "POST" }
      );
      navigateToLocation("papelera");
    } catch (error) {
      setState({ error, kind: "error" });
    } finally {
      setRestoring(false);
    }
  }

  const detail: BusinessRecordDetailConfig = {
    actionSlots: {
      primary: entry?.status === "active" ? [{ actionSemanticId: "record.restore", disabled: restoring, id: "restore", label: `Restaurar ${entry.resourceLabel}`, onAction: () => void restore(), variant: "primary" }] : [],
      secondary: [{ actionSemanticId: "navigation.back", href: routeHash("papelera"), id: "back", label: "Volver a la papelera", variant: "secondary" }]
    },
    description: "Tombstone gobernado. La eliminación permanente no está disponible.",
    entitySemanticId: "entity.document",
    eyebrow: "Papelera",
    id: `recycle-bin-${entryId}`,
    mode: "view",
    sectionPersistence: { namespace: `democrm-recycle-bin-${entryId}`, version: 1 },
    sections: entry ? [
      {
        columns: 2,
        fields: [
          { displayValue: resourceTypeLabel(entry.resourceType), id: "resourceType", kind: "readonly", label: "Recurso" },
          { displayValue: entry.resourceLabel, id: "resourceLabel", kind: "readonly", label: "Registro" },
          { displayValue: resourceClassLabel(entry.resourceClass), id: "resourceClass", kind: "readonly", label: "Clase" },
          { displayValue: entry.previousStatus, id: "previousStatus", kind: "readonly", label: "Estado anterior" },
          { displayValue: String(entry.previousVersion), id: "previousVersion", kind: "readonly", label: "Versión anterior" },
          { displayValue: String(entry.dependencyCount), id: "dependencyCount", kind: "readonly", label: "Dependencias" }
        ],
        id: "record",
        title: "Registro retirado"
      },
      {
        columns: 2,
        fields: [
          { displayValue: entry.policyReasonCode, id: "policyReasonCode", kind: "readonly", label: "Decisión" },
          { displayValue: entry.status === "active" ? "En papelera" : "Restaurado", id: "status", kind: "readonly", label: "Estado" },
          { displayValue: formatTimestamp(entry.createdAt), id: "createdAt", kind: "readonly", label: "Retirado" },
          { displayValue: entry.restoredAt ? formatTimestamp(entry.restoredAt) : "—", id: "restoredAt", kind: "readonly", label: "Restaurado" }
        ],
        id: "lifecycle",
        title: "Ciclo de vida"
      }
    ] : [],
    state: state.kind === "error" ? "error" : state.kind === "loading" ? "loading" : "ready",
    stateMessage: state.kind === "error" ? publicMessageFrom(state.error) : undefined,
    tags: entry ? [{ id: "status", label: entry.status === "active" ? "En papelera" : "Restaurado" }] : [],
    title: entry?.resourceLabel ?? "Registro de la papelera"
  };

  return <BusinessRecordRecycleBinTemplate config={{ detail, mode: "detail" }} />;
}

function resourceClassLabel(value: RecycleBinEntry["resourceClass"]): string {
  return value === "master" ? "Dato maestro" : "Transacción";
}

function resourceTypeLabel(value: RecycleBinEntry["resourceType"]): string {
  return ({
    accounts: "Cuentas",
    activities: "Actividades",
    appointments: "Citas",
    cases: "Casos",
    contacts: "Contactos",
    opportunities: "Oportunidades"
  })[value];
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("es-DO");
}
