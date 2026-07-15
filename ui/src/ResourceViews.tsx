import React from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Workflow,
  X
} from "lucide-react";
import {
  Button,
  DataTable,
  DataTableInline,
  EmptyState,
  EntityCell,
  ErrorState,
  FilterPanel,
  IconButton,
  LoadingState,
  Panel,
  StatusBadge,
  StatusStrip,
  TableActionGroup,
  ViewNotice
} from "@pyrosa/ui";
import type { DataTableColumn } from "@pyrosa/ui";
import { WorkspaceLayout } from "@pyrosa/ui-layouts";
import {
  CrmApiError,
  entityEtag,
  fetchCrmJson,
  newIdempotencyKey,
  publicMessageFrom,
  technicalIssueFrom
} from "./crmApi";
import type {
  ApiDetailResponse,
  ApiListResponse,
  CrmEntity,
  ResourceRouteId,
  ResourceViewMode
} from "./crmTypes";
import { navigateToLocation } from "./crmRouting";
import type { EditorField, ResourceConfig, ResourceField } from "./resourceConfig";
import { resourceConfigs } from "./resourceConfig";

type ResourceListState =
  | { kind: "loading" }
  | { error: unknown; kind: "error" }
  | { kind: "empty"; response: ApiListResponse<CrmEntity> }
  | { kind: "ready"; response: ApiListResponse<CrmEntity> };

type ResourceDetailState =
  | { kind: "loading" }
  | { error: unknown; kind: "error" }
  | { entity: CrmEntity; kind: "ready"; requestId?: string };

export function ResourceView({
  initialAttention,
  initialDirection,
  initialSort,
  initialStatus,
  mode,
  recordId,
  routeId,
  tenantId,
  tenantLabel
}: {
  initialAttention?: "exception" | "overdue" | "pending";
  initialDirection?: "asc" | "desc";
  initialSort?: string;
  initialStatus?: string;
  mode: ResourceViewMode;
  recordId?: string;
  routeId: ResourceRouteId;
  tenantId: string;
  tenantLabel: string;
}) {
  const config = resourceConfigs[routeId];
  if (mode === "new") {
    return <ResourceEditor config={config} mode="new" tenantId={tenantId} tenantLabel={tenantLabel} />;
  }
  if ((mode === "detail" || mode === "edit") && recordId) {
    return mode === "detail"
      ? <ResourceDetail config={config} recordId={recordId} tenantId={tenantId} tenantLabel={tenantLabel} />
      : <ResourceEditor config={config} mode="edit" recordId={recordId} tenantId={tenantId} tenantLabel={tenantLabel} />;
  }
  return <ResourceList config={config} initialAttention={initialAttention} initialDirection={initialDirection} initialSort={initialSort} initialStatus={initialStatus} tenantId={tenantId} tenantLabel={tenantLabel} />;
}

function ResourceList({ config, initialAttention, initialDirection, initialSort, initialStatus, tenantId, tenantLabel }: { config: ResourceConfig; initialAttention?: "exception" | "overdue" | "pending"; initialDirection?: "asc" | "desc"; initialSort?: string; initialStatus?: string; tenantId: string; tenantLabel: string }) {
  const [queryInput, setQueryInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [statusInput, setStatusInput] = React.useState(initialStatus ?? "all");
  const [status, setStatus] = React.useState(initialStatus ?? "all");
  const [attention, setAttention] = React.useState(initialAttention);
  const [cursor, setCursor] = React.useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = React.useState<Array<string | undefined>>([]);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [state, setState] = React.useState<ResourceListState>({ kind: "loading" });

  React.useEffect(() => {
    setStatusInput(initialStatus ?? "all");
    setStatus(initialStatus ?? "all");
    setAttention(initialAttention);
    setCursor(undefined);
    setCursorHistory([]);
  }, [initialAttention, initialDirection, initialSort, initialStatus]);

  React.useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ limit: "25" });
    if (query) parameters.set("q", query);
    if (status !== "all") parameters.set("status", status);
    if (attention) parameters.set("attention", attention);
    if (initialSort) parameters.set("sort", initialSort);
    if (initialDirection) parameters.set("direction", initialDirection);
    if (cursor) parameters.set("cursor", cursor);
    setState({ kind: "loading" });
    void fetchCrmJson<ApiListResponse<CrmEntity>>(`${config.endpoint}?${parameters.toString()}`, {
      signal: controller.signal,
      tenantId
    }).then((response) => {
      if (!isEntityListResponse(response)) {
        throw new CrmApiError("El inventario no cumple el contrato CRM v1.", {
          code: "crm.list.contract_invalid",
          retryable: true
        });
      }
      setState({ kind: response.data.length === 0 ? "empty" : "ready", response });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ error, kind: "error" });
    });
    return () => controller.abort();
  }, [attention, config.endpoint, cursor, initialDirection, initialSort, query, reloadKey, status, tenantId]);

  const response = state.kind === "ready" || state.kind === "empty" ? state.response : null;
  const total = response?.page.total;
  const rows = response?.data ?? [];
  const columns = resourceColumns(config);

  function applyFilters() {
    setCursor(undefined);
    setCursorHistory([]);
    setQuery(queryInput.trim());
    setStatus(statusInput);
  }

  function clearFilters() {
    setQueryInput("");
    setStatusInput("all");
    setQuery("");
    setStatus("all");
    setAttention(undefined);
    setCursor(undefined);
    setCursorHistory([]);
  }

  return (
    <WorkspaceLayout className="crm-workspace">
      <StatusStrip items={[
        { key: "tenant", label: "Tenant", tone: "info", value: tenantLabel },
        { key: "resource", label: "Recurso", tone: "info", value: config.title },
        { key: "records", label: "Registros", tone: "success", value: total ?? rows.length },
        { key: "state", label: "Estado", tone: state.kind === "error" ? "warning" : "success", value: state.kind }
      ]} />
      <FilterPanel
        actions={
          <div className="crm-filter-actions">
            <Button icon={<Search aria-hidden="true" />} onClick={applyFilters}>Buscar</Button>
            <Button disabled={!attention && !query && status === "all" && !queryInput && statusInput === "all"} icon={<X aria-hidden="true" />} onClick={clearFilters} variant="secondary">Limpiar</Button>
          </div>
        }
        onEscapeClear={clearFilters}
      >
        {attention ? <ViewNotice message={attention === "overdue" ? "Mostrando solo casos vencidos que requieren atencion." : attention === "exception" ? "Mostrando solo citas con excepciones operacionales." : "Mostrando solo actividades abiertas o en progreso."} title="Vista filtrada" tone="info" /> : null}
        <label className="crm-field">
          <span>Buscar</span>
          <input
            className="crm-input"
            onChange={(event) => setQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyFilters();
            }}
            placeholder={config.searchPlaceholder}
            type="search"
            value={queryInput}
          />
        </label>
        {config.statusOptions ? (
          <label className="crm-field">
            <span>Estado</span>
            <select className="crm-input" onChange={(event) => setStatusInput(event.target.value)} value={statusInput}>
              <option value="all">Todos</option>
              {statusInput !== "all" && !config.statusOptions.some((option) => option.value === statusInput) ? <option value={statusInput}>{statusInput}</option> : null}
              {config.statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ) : null}
      </FilterPanel>

      <Panel
        actions={
          <div className="crm-panel-actions">
            <IconButton icon={<RefreshCw aria-hidden="true" />} label={`Actualizar ${config.title}`} onClick={() => setReloadKey((value) => value + 1)} variant="secondary" />
            {!config.readOnly ? <Button icon={<Plus aria-hidden="true" />} onClick={() => navigateToLocation(config.id, "new")}>Nueva {config.singular}</Button> : null}
          </div>
        }
        description={config.description}
        eyebrow={config.eyebrow}
        title={config.title}
      >
        {state.kind === "loading" ? <LoadingState>Cargando {config.title.toLowerCase()}.</LoadingState> : null}
        {state.kind === "error" ? (
          <RegionalError error={state.error} onRetry={() => setReloadKey((value) => value + 1)} />
        ) : null}
        {state.kind === "empty" ? (
          <EmptyState action={!config.readOnly ? { label: `Crear ${config.singular}`, onClick: () => navigateToLocation(config.id, "new") } : undefined}>
            No hay {config.title.toLowerCase()} para los filtros actuales.
          </EmptyState>
        ) : null}
        {state.kind === "ready" ? (
          <DataTable<CrmEntity>
            columns={columns}
            density="compact"
            getRowId={(row) => row.id}
            onRowClick={(row) => navigateToLocation(config.id, "detail", row.id)}
            rows={rows}
            scrollPersistenceKey={`democrm-${config.id}`}
            tableMinWidth="860px"
          />
        ) : null}
        {state.kind === "ready" || state.kind === "empty" ? (
          <nav aria-label={`Paginacion de ${config.title}`} className="crm-pagination">
            <Button
              disabled={cursorHistory.length === 0}
              icon={<ChevronLeft aria-hidden="true" />}
              onClick={() => {
                const previous = cursorHistory[cursorHistory.length - 1];
                setCursorHistory((history) => history.slice(0, -1));
                setCursor(previous);
              }}
              variant="secondary"
            >
              Anterior
            </Button>
            <span>{typeof total === "number" ? `${total} registros` : `${rows.length} en esta pagina`}</span>
            <Button
              disabled={!response?.page.nextCursor}
              icon={<ChevronRight aria-hidden="true" />}
              onClick={() => {
                if (!response?.page.nextCursor) return;
                setCursorHistory((history) => [...history, cursor]);
                setCursor(response.page.nextCursor);
              }}
              variant="secondary"
            >
              Siguiente
            </Button>
          </nav>
        ) : null}
      </Panel>
    </WorkspaceLayout>
  );
}

function ResourceDetail({
  config,
  recordId,
  tenantId,
  tenantLabel
}: {
  config: ResourceConfig;
  recordId: string;
  tenantId: string;
  tenantLabel: string;
}) {
  const [reloadKey, setReloadKey] = React.useState(0);
  const [state, setState] = React.useState<ResourceDetailState>({ kind: "loading" });

  React.useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    void fetchCrmJson<ApiDetailResponse<CrmEntity>>(`${config.endpoint}/${encodeURIComponent(recordId)}`, {
      signal: controller.signal,
      tenantId
    }).then((response) => {
      if (!isEntity(response?.data)) {
        throw new CrmApiError("El detalle no cumple el contrato CRM v1.", {
          code: "crm.detail.contract_invalid",
          retryable: true
        });
      }
      setState({ entity: response.data, kind: "ready", requestId: response.meta?.requestId });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ error, kind: "error" });
    });
    return () => controller.abort();
  }, [config.endpoint, recordId, reloadKey, tenantId]);

  const entity = state.kind === "ready" ? state.entity : null;
  return (
    <WorkspaceLayout className="crm-workspace">
      <StatusStrip items={[
        { key: "tenant", label: "Tenant", tone: "info", value: tenantLabel },
        { key: "resource", label: "Recurso", tone: "info", value: config.singular },
        { key: "status", label: "Estado", tone: entity ? "success" : "info", value: entity?.status ?? state.kind },
        { key: "version", label: "Version", tone: "info", value: entity?.version ?? "—" }
      ]} />
      <Panel
        actions={
          <div className="crm-panel-actions">
            <Button icon={<ArrowLeft aria-hidden="true" />} onClick={() => navigateToLocation(config.id)} variant="secondary">Volver</Button>
            {entity && !config.readOnly ? <Button icon={<Pencil aria-hidden="true" />} onClick={() => navigateToLocation(config.id, "edit", entity.id)}>Editar</Button> : null}
          </div>
        }
        description={`Identificador opaco ${recordId}`}
        eyebrow="Detalle"
        title={entity ? entityTitle(config, entity) : `Detalle de ${config.singular}`}
      >
        {state.kind === "loading" ? <LoadingState>Cargando detalle autorizado.</LoadingState> : null}
        {state.kind === "error" ? <RegionalError error={state.error} onRetry={() => setReloadKey((value) => value + 1)} /> : null}
        {entity ? <EntityDetails config={config} entity={entity} /> : null}
      </Panel>
      {entity ? (
        <ResourceCommands
          config={config}
          entity={entity}
          onUpdated={() => setReloadKey((value) => value + 1)}
          tenantId={tenantId}
        />
      ) : null}
    </WorkspaceLayout>
  );
}

function EntityDetails({ config, entity }: { config: ResourceConfig; entity: CrmEntity }) {
  const fields: ResourceField[] = [
    ...config.fields,
    { label: "Identificador", name: "id" },
    { format: "date-time", label: "Creado", name: "createdAt" },
    { format: "date-time", label: "Actualizado", name: "updatedAt" },
    { format: "number", label: "Version", name: "version" }
  ];
  return (
    <dl className="crm-detail-list">
      {fields.map((field) => (
        <div key={field.name}>
          <dt>{field.label}</dt>
          <dd>{formatEntityValue(entity, field)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ResourceEditor({
  config,
  mode,
  recordId,
  tenantId,
  tenantLabel
}: {
  config: ResourceConfig;
  mode: "new" | "edit";
  recordId?: string;
  tenantId: string;
  tenantLabel: string;
}) {
  const editorFields = React.useMemo(() => editorFieldsForMode(config, mode), [config, mode]);
  const [form, setForm] = React.useState<Record<string, string>>(() => emptyForm(editorFields));
  const [entity, setEntity] = React.useState<CrmEntity | null>(null);
  const [loading, setLoading] = React.useState(mode === "edit");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [attempt, setAttempt] = React.useState(() => ({ key: newIdempotencyKey(), signature: "" }));

  React.useEffect(() => {
    if (mode !== "edit" || !recordId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchCrmJson<ApiDetailResponse<CrmEntity>>(`${config.endpoint}/${encodeURIComponent(recordId)}`, {
      signal: controller.signal,
      tenantId
    }).then((response) => {
      if (!isEntity(response?.data)) {
        throw new CrmApiError("El recurso no cumple el contrato CRM v1.", {
          code: "crm.editor.contract_invalid",
          retryable: true
        });
      }
      setEntity(response.data);
      setForm(formFromEntity(editorFields, response.data));
    }).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [config.endpoint, editorFields, mode, recordId, tenantId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const missing = editorFields.find((field) => field.required && !form[field.name]?.trim());
    if (missing) {
      setError(new CrmApiError(`Completa el campo ${missing.label}.`, {
        code: "crm.validation.required",
        retryable: false
      }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isEdit = mode === "edit" && recordId;
      const body = payloadFromForm(editorFields, form);
      const endpoint = isEdit ? `${config.endpoint}/${encodeURIComponent(recordId)}` : config.endpoint;
      const signature = JSON.stringify({ body, endpoint, method: isEdit ? "PATCH" : "POST", version: isEdit ? entity?.version : null });
      const idempotencyKey = attempt.signature === signature ? attempt.key : newIdempotencyKey();
      if (attempt.signature !== signature) setAttempt({ key: idempotencyKey, signature });
      const response = await fetchCrmJson<ApiDetailResponse<CrmEntity>>(
        endpoint,
        {
          body,
          etag: isEdit ? entityEtag(entity?.version) : undefined,
          idempotencyKey,
          method: isEdit ? "PATCH" : "POST",
          tenantId
        }
      );
      if (!isEntity(response?.data)) {
        throw new CrmApiError("La escritura no devolvio un recurso valido.", {
          code: "crm.editor.response_invalid",
          retryable: false
        });
      }
      setAttempt({ key: newIdempotencyKey(), signature: "" });
      navigateToLocation(config.id, "detail", response.data.id);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  if (config.readOnly || editorFields.length === 0) {
    return (
      <WorkspaceLayout className="crm-workspace">
        <Panel eyebrow="Contrato" title="Operacion no disponible">
          <EmptyState action={{ label: "Volver", onClick: () => navigateToLocation(config.id) }}>
            Este recurso se administra mediante comandos autorizados, no mediante un editor generico.
          </EmptyState>
        </Panel>
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout className="crm-workspace">
      <StatusStrip items={[
        { key: "tenant", label: "Tenant", tone: "info", value: tenantLabel },
        { key: "operation", label: "Operacion", tone: "info", value: mode === "new" ? "crear" : "editar" },
        { key: "resource", label: "Recurso", tone: "info", value: config.singular },
        { key: "state", label: "Estado", tone: error ? "warning" : "success", value: saving ? "guardando" : loading ? "cargando" : "listo" }
      ]} />
      <Panel
        description="Las escrituras usan idempotencia o version para proteger reintentos y concurrencia."
        eyebrow={mode === "new" ? "Nuevo" : "Edicion"}
        title={mode === "new" ? `Nueva ${config.singular}` : `Editar ${config.singular}`}
      >
        {loading ? <LoadingState>Cargando datos del recurso.</LoadingState> : null}
        {error ? <RegionalError error={error} /> : null}
        {!loading ? (
          <form className="crm-editor" onSubmit={submit}>
            <div className="crm-editor__grid">
              {editorFields.map((field) => (
                <EditorControl
                  field={field}
                  key={field.name}
                  onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}
                  value={form[field.name] ?? ""}
                />
              ))}
            </div>
            <div className="crm-editor__actions">
              <Button icon={<ArrowLeft aria-hidden="true" />} onClick={() => navigateToLocation(config.id, recordId ? "detail" : "list", recordId)} type="button" variant="secondary">Cancelar</Button>
              <Button disabled={saving} icon={<Save aria-hidden="true" />} type="submit">{saving ? "Guardando" : "Guardar"}</Button>
            </div>
          </form>
        ) : null}
      </Panel>
    </WorkspaceLayout>
  );
}

function editorFieldsForMode(config: ResourceConfig, mode: "new" | "edit"): EditorField[] {
  if (mode === "new") return config.editorFields;
  const commandOwned: Partial<Record<ResourceRouteId, string[]>> = {
    agenda: ["caseId", "endAt", "resourceId", "startAt", "timezone"],
    oportunidades: ["pipelineId", "stageId"]
  };
  const excluded = new Set(commandOwned[config.id] ?? []);
  return config.editorFields.filter((field) => !excluded.has(field.name));
}

function EditorControl({ field, onChange, value }: { field: EditorField; onChange: (value: string) => void; value: string }) {
  const id = `crm-field-${field.name}`;
  return (
    <label className="crm-field" htmlFor={id}>
      <span>{field.label}{field.required ? " *" : ""}</span>
      {field.input === "select" ? (
        <select className="crm-input" id={id} onChange={(event) => onChange(event.target.value)} required={field.required} value={value}>
          <option value="">Seleccionar</option>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : field.input === "textarea" ? (
        <textarea className="crm-input crm-input--textarea" id={id} onChange={(event) => onChange(event.target.value)} required={field.required} value={value} />
      ) : (
        <input
          className="crm-input"
          id={id}
          inputMode={field.input === "number" ? "decimal" : undefined}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          type={field.input}
          value={value}
        />
      )}
    </label>
  );
}

function ResourceCommands({
  config,
  entity,
  onUpdated,
  tenantId
}: {
  config: ResourceConfig;
  entity: CrmEntity;
  onUpdated: () => void;
  tenantId: string;
}) {
  const [action, setAction] = React.useState(config.id === "reportes" ? "run" : "");
  const [target, setTarget] = React.useState("");
  const [reasonCode, setReasonCode] = React.useState("");
  const [scheduleFields, setScheduleFields] = React.useState(() => scheduleFieldsFrom(entity));
  const [pending, setPending] = React.useState(false);
  const [attempt, setAttempt] = React.useState(() => ({ key: newIdempotencyKey(), signature: "" }));
  const [feedback, setFeedback] = React.useState<{ error?: unknown; message?: string }>({});
  React.useEffect(() => setScheduleFields(scheduleFieldsFrom(entity)), [entity.id, entity.version]);
  const command = commandDefinition(config.id, action, target, reasonCode, entity, scheduleFields);
  if (!command && !["casos", "agenda", "oportunidades", "reportes"].includes(config.id)) return null;

  async function runCommand() {
    if (!command || pending) return;
    setPending(true);
    setFeedback({});
    try {
      const signature = JSON.stringify(command);
      const idempotencyKey = attempt.signature === signature ? attempt.key : newIdempotencyKey();
      if (attempt.signature !== signature) setAttempt({ key: idempotencyKey, signature });
      await fetchCrmJson<ApiDetailResponse<CrmEntity>>(command.endpoint, {
        body: command.body,
        etag: entityEtag(entity.version),
        idempotencyKey,
        method: "POST",
        tenantId
      });
      setAttempt({ key: newIdempotencyKey(), signature: "" });
      setFeedback({ message: "Comando aceptado y auditado." });
      onUpdated();
    } catch (error) {
      setFeedback({ error });
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel description="Solo se envian comandos tipados; una respuesta aceptada no se interpreta como efecto externo confirmado." eyebrow="Workflow" title="Acciones del recurso">
      {config.id === "reportes" ? (
        <Button disabled={pending} icon={<Play aria-hidden="true" />} onClick={runCommand} type="button">{pending ? "Ejecutando" : "Ejecutar reporte"}</Button>
      ) : (
        <div className="crm-command-grid">
          <label className="crm-field">
            <span>Comando</span>
            <select className="crm-input" onChange={(event) => setAction(event.target.value)} value={action}>
              <option value="">Seleccionar</option>
              {commandOptions(config.id).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {action === "transition" || action === "assign" ? (
            <label className="crm-field">
              <span>{action === "assign" ? "Assignee" : config.id === "oportunidades" ? "Etapa destino" : "Estado destino"}</span>
              <input className="crm-input" onChange={(event) => setTarget(event.target.value)} value={target} />
            </label>
          ) : null}
          {config.id === "agenda" && (action === "schedule" || action === "reschedule") ? (
            <>
              {([
                ["startAt", "Inicio ISO"],
                ["endAt", "Fin ISO"],
                ["timezone", "Zona horaria"],
                ["resourceId", "Recurso"]
              ] as const).map(([field, label]) => (
                <label className="crm-field" key={field}>
                  <span>{label}</span>
                  <input
                    className="crm-input"
                    onChange={(event) => setScheduleFields((current) => ({ ...current, [field]: event.target.value }))}
                    required={field !== "resourceId"}
                    value={scheduleFields[field]}
                  />
                </label>
              ))}
            </>
          ) : null}
          <label className="crm-field">
            <span>Codigo de motivo</span>
            <input className="crm-input" onChange={(event) => setReasonCode(event.target.value)} value={reasonCode} />
          </label>
          <Button disabled={!command || pending} icon={<Workflow aria-hidden="true" />} onClick={runCommand} type="button">{pending ? "Ejecutando" : "Ejecutar"}</Button>
        </div>
      )}
      {feedback.message ? <ViewNotice message={feedback.message} title="Workflow" tone="success" /> : null}
      {feedback.error ? <RegionalError error={feedback.error} /> : null}
    </Panel>
  );
}

function commandDefinition(
  routeId: ResourceRouteId,
  action: string,
  target: string,
  reasonCode: string,
  entity: CrmEntity,
  scheduleFields: { endAt: string; resourceId: string; startAt: string; timezone: string }
) {
  const id = encodeURIComponent(entity.id);
  const reason = reasonCode.trim() ? { reasonCode: reasonCode.trim() } : {};
  if (routeId === "casos" && action === "transition" && target.trim()) {
    return { body: { ...reason, targetStatus: target.trim() }, endpoint: `/api/crm/v1/cases/${id}/transition` };
  }
  if (routeId === "casos" && action === "assign" && target.trim()) {
    return { body: { ...reason, assigneeId: target.trim() }, endpoint: `/api/crm/v1/cases/${id}/assign` };
  }
  if (routeId === "agenda" && ["schedule", "confirm", "reschedule", "cancel", "complete", "no-show"].includes(action)) {
    if ((action === "schedule" || action === "reschedule") && (!scheduleFields.startAt.trim() || !scheduleFields.endAt.trim() || !scheduleFields.timezone.trim())) {
      return null;
    }
    return {
      body: {
        ...reason,
        ...(action === "schedule" || action === "reschedule" ? {
          endAt: scheduleFields.endAt,
          startAt: scheduleFields.startAt,
          timezone: scheduleFields.timezone,
          ...(scheduleFields.resourceId.trim() ? { resourceId: scheduleFields.resourceId.trim() } : {})
        } : {})
      },
      endpoint: `/api/crm/v1/appointments/${id}/${action}`
    };
  }
  if (routeId === "oportunidades" && action === "transition" && target.trim()) {
    return { body: { ...reason, stageId: target.trim() }, endpoint: `/api/crm/v1/opportunities/${id}/transition` };
  }
  if (routeId === "reportes" && action === "run") {
    return { body: { reportId: entity.id }, endpoint: "/api/crm/v1/report-runs" };
  }
  return null;
}

function scheduleFieldsFrom(entity: CrmEntity): { endAt: string; resourceId: string; startAt: string; timezone: string } {
  return {
    endAt: String(entity.endAt ?? ""),
    resourceId: String(entity.resourceId ?? ""),
    startAt: String(entity.startAt ?? ""),
    timezone: String(entity.timezone ?? "")
  };
}

function commandOptions(routeId: ResourceRouteId) {
  if (routeId === "casos") return [
    { label: "Cambiar estado", value: "transition" },
    { label: "Asignar", value: "assign" }
  ];
  if (routeId === "agenda") return [
    { label: "Programar", value: "schedule" },
    { label: "Confirmar", value: "confirm" },
    { label: "Reprogramar", value: "reschedule" },
    { label: "Cancelar", value: "cancel" },
    { label: "Completar", value: "complete" },
    { label: "No asistio", value: "no-show" }
  ];
  if (routeId === "oportunidades") return [{ label: "Cambiar etapa", value: "transition" }];
  return [];
}

function RegionalError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const issue = technicalIssueFrom(error);
  return (
    <div className="crm-regional-error">
      <ErrorState action={onRetry ? { label: "Reintentar", onClick: onRetry } : undefined}>{publicMessageFrom(error)}</ErrorState>
      <details>
        <summary>Detalle tecnico</summary>
        <span>Codigo: {issue.code}</span>
        {issue.requestId ? <span>Request ID: {issue.requestId}</span> : null}
      </details>
    </div>
  );
}

function resourceColumns(config: ResourceConfig): Array<DataTableColumn<CrmEntity>> {
  const visibleFields = config.fields.slice(0, 5);
  return [
    ...visibleFields.map((field, index): DataTableColumn<CrmEntity> => ({
      key: field.name,
      label: field.label,
      render: (row) => index === 0 ? (
        <EntityCell
          description={secondaryDescription(config, row)}
          icon={config.icon}
          meta={<DataTableInline>{row.id}</DataTableInline>}
          title={formatEntityValue(row, field)}
        />
      ) : field.format === "status" ? (
        <StatusBadge tone={statusTone(String(row[field.name] ?? ""))}>{formatEntityValue(row, field)}</StatusBadge>
      ) : <DataTableInline strong={field.format === "currency-minor"}>{formatEntityValue(row, field)}</DataTableInline>,
      width: index === 0 ? "30%" : undefined
    })),
    {
      key: "actions",
      kind: "actions",
      label: "Acciones",
      render: (row) => (
        <TableActionGroup>
          <IconButton icon={<Eye aria-hidden="true" />} label={`Ver ${config.singular}`} onClick={(event) => {
            event.stopPropagation();
            navigateToLocation(config.id, "detail", row.id);
          }} variant="secondary" />
          {!config.readOnly ? <IconButton icon={<Pencil aria-hidden="true" />} label={`Editar ${config.singular}`} onClick={(event) => {
            event.stopPropagation();
            navigateToLocation(config.id, "edit", row.id);
          }} variant="secondary" /> : null}
        </TableActionGroup>
      )
    }
  ];
}

function secondaryDescription(config: ResourceConfig, entity: CrmEntity): string {
  const status = String(entity.status ?? "sin estado");
  const second = config.fields[1] ? formatEntityValue(entity, config.fields[1]) : config.singular;
  return `${second} · ${status}`;
}

function entityTitle(config: ResourceConfig, entity: CrmEntity): string {
  const first = config.fields[0];
  return first ? formatEntityValue(entity, first) : entity.id;
}

function formatEntityValue(entity: CrmEntity, field: ResourceField): string {
  const value = entity[field.name];
  if (value === undefined || value === null || value === "") return "—";
  if (field.format === "date-time") {
    const date = new Date(String(value));
    const timeZone = typeof entity.timezone === "string" && entity.timezone ? entity.timezone : undefined;
    return Number.isNaN(date.getTime()) ? "fecha no valida" : new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", ...(timeZone ? { timeZone } : {}) }).format(date);
  }
  if (field.format === "currency-minor" && typeof value === "number") {
    const currency = typeof entity.currency === "string" ? entity.currency : "USD";
    try {
      return new Intl.NumberFormat("es-DO", { currency, style: "currency" }).format(value / 100);
    } catch {
      return `${value / 100} ${currency}`;
    }
  }
  if (field.format === "list" && Array.isArray(value)) return value.map(String).join(", ") || "—";
  if (Array.isArray(value)) return `${value.length} elementos`;
  if (typeof value === "object") return `${Object.keys(value as object).length} valores`;
  if (typeof value === "boolean") return value ? "Si" : "No";
  return String(value);
}

function statusTone(status: string): "neutral" | "success" | "warning" | "info" {
  if (["active", "completed", "confirmed", "closed", "resolved", "won"].includes(status)) return "success";
  if (["pending", "waiting_external", "rescheduled", "stale"].includes(status)) return "warning";
  if (["new", "open", "in_progress", "scheduled"].includes(status)) return "info";
  return "neutral";
}

function emptyForm(fields: EditorField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.name, ""]));
}

function formFromEntity(fields: EditorField[], entity: CrmEntity): Record<string, string> {
  return Object.fromEntries(fields.map((field) => {
    const value = entity[field.name];
    if (value === undefined || value === null) return [field.name, ""];
    if (field.input === "datetime-local") {
      const date = new Date(String(value));
      return [field.name, Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16)];
    }
    if (Array.isArray(value)) return [field.name, value.map(String).join(", ")];
    if (typeof value === "object") return [field.name, ""];
    return [field.name, String(value)];
  }));
}

function payloadFromForm(fields: EditorField[], form: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = form[field.name]?.trim() ?? "";
    if (!raw) continue;
    if (field.format === "list") {
      payload[field.name] = raw.split(",").map((value) => value.trim()).filter(Boolean);
      continue;
    }
    if (field.input === "number") {
      payload[field.name] = Number(raw);
      continue;
    }
    if (field.input === "datetime-local") {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) payload[field.name] = date.toISOString();
      continue;
    }
    payload[field.name] = raw;
  }
  return payload;
}

function isEntityListResponse(value: ApiListResponse<CrmEntity> | undefined): value is ApiListResponse<CrmEntity> {
  return Boolean(value && Array.isArray(value.data) && value.data.every(isEntity) && value.page && typeof value.page.limit === "number" && value.meta);
}

function isEntity(value: CrmEntity | undefined): value is CrmEntity {
  return Boolean(value && typeof value === "object" && typeof value.id === "string" && value.id.length > 0);
}
