import React from "react";
import { RefreshCw, Save, Settings, ShieldCheck, Tags } from "lucide-react";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  StatusBadge,
  StatusStrip,
  ViewGrid,
  ViewNotice
} from "@pyrosa/ui";
import { WorkspaceLayout } from "@pyrosa/ui-layouts";
import {
  CrmApiError,
  entityEtag,
  fetchCrmJson,
  newIdempotencyKey,
  publicMessageFrom,
  technicalIssueFrom
} from "./crmApi";
import type { ApiDetailResponse, ProfileDefinition, TenantConfiguration } from "./crmTypes";

type ConfigurationState =
  | { kind: "loading" }
  | { error: unknown; kind: "error" }
  | { config: TenantConfiguration; kind: "ready"; profile: ProfileDefinition };

export function ConfigurationView({ tenantId, tenantLabel }: { tenantId: string; tenantLabel: string }) {
  const [reloadKey, setReloadKey] = React.useState(0);
  const [state, setState] = React.useState<ConfigurationState>({ kind: "loading" });
  const [form, setForm] = React.useState({ locale: "", profileKey: "", profileVersion: "", timezone: "" });
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ error?: unknown; message?: string }>({});
  const [attempt, setAttempt] = React.useState(() => ({ key: newIdempotencyKey(), signature: "" }));

  React.useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    setFeedback({});
    void Promise.all([
      fetchCrmJson<ApiDetailResponse<ProfileDefinition>>("/api/crm/v1/profile/effective", { signal: controller.signal, tenantId }),
      fetchCrmJson<ApiDetailResponse<TenantConfiguration>>("/api/crm/v1/config", { signal: controller.signal, tenantId })
    ]).then(([profileResponse, configResponse]) => {
      if (!isProfile(profileResponse.data) || !isConfiguration(configResponse.data)) {
        throw new CrmApiError("La configuracion no cumple el contrato CRM v1.", {
          code: "crm.config.contract_invalid",
          retryable: true
        });
      }
      setState({ config: configResponse.data, kind: "ready", profile: profileResponse.data });
      setForm({
        locale: configResponse.data.locale ?? "",
        profileKey: configResponse.data.profileKey ?? profileResponse.data.key,
        profileVersion: configResponse.data.profileVersion ?? profileResponse.data.version,
        timezone: configResponse.data.timezone ?? ""
      });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ error, kind: "error" });
    });
    return () => controller.abort();
  }, [reloadKey, tenantId]);

  async function saveConfiguration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready" || saving) return;
    setSaving(true);
    setFeedback({});
    try {
      const signature = JSON.stringify({ body: form, version: state.config.version });
      const idempotencyKey = attempt.signature === signature ? attempt.key : newIdempotencyKey();
      if (attempt.signature !== signature) setAttempt({ key: idempotencyKey, signature });
      const response = await fetchCrmJson<ApiDetailResponse<TenantConfiguration>>("/api/crm/v1/config", {
        body: form,
        etag: entityEtag(state.config.version),
        idempotencyKey,
        method: "PATCH",
        tenantId
      });
      if (!isConfiguration(response.data)) {
        throw new CrmApiError("La configuracion actualizada no cumple el contrato CRM v1.", {
          code: "crm.config.response_invalid",
          retryable: false
        });
      }
      setAttempt({ key: newIdempotencyKey(), signature: "" });
      setFeedback({ message: "La configuracion fue validada y actualizada." });
      setReloadKey((value) => value + 1);
    } catch (error) {
      setFeedback({ error });
    } finally {
      setSaving(false);
    }
  }

  const ready = state.kind === "ready" ? state : null;
  return (
    <WorkspaceLayout className="crm-workspace">
      <StatusStrip items={[
        { icon: <Settings aria-hidden="true" />, key: "tenant", label: "Tenant", tone: "info", value: tenantLabel },
        { icon: <ShieldCheck aria-hidden="true" />, key: "profile", label: "Perfil", tone: "info", value: ready ? `${ready.profile.key}@${ready.profile.version}` : "—" },
        { icon: <Tags aria-hidden="true" />, key: "metrics", label: "Metricas", tone: "info", value: ready?.profile.metricSetVersion ?? "—" },
        { key: "state", label: "Estado", tone: state.kind === "error" ? "warning" : "success", value: state.kind }
      ]} />

      {state.kind === "loading" ? <Panel eyebrow="Configuracion" title="Cargando perfil efectivo"><LoadingState>Resolviendo perfil y configuracion del tenant.</LoadingState></Panel> : null}
      {state.kind === "error" ? (
        <Panel eyebrow="Configuracion" title="Configuracion no disponible">
          <ConfigurationError error={state.error} onRetry={() => setReloadKey((value) => value + 1)} />
        </Panel>
      ) : null}
      {ready ? (
        <>
          <ViewGrid variant="balanced">
            <Panel description="El perfil adapta vocabulario, estados, campos y metricas sin crear un fork por tenant." eyebrow="Perfil efectivo" title={ready.profile.label}>
              <dl className="crm-detail-list">
                <Fact label="Contrato" value={`${ready.profile.key}@${ready.profile.version}`} />
                <Fact label="Metric set" value={ready.profile.metricSetVersion ?? "—"} />
                <Fact label="Estados de caso" value={joinValues(ready.profile.caseStates)} />
                <Fact label="Estados de cita" value={joinValues(ready.profile.appointmentStates)} />
                <Fact label="Campos declarativos" value={String(ready.profile.fields?.length ?? 0)} />
                <Fact label="Reportes" value={String(ready.profile.reports?.length ?? 0)} />
              </dl>
            </Panel>
            <Panel description="Etiquetas resueltas por el perfil; no conceden permisos ni cambian el schema." eyebrow="Vocabulario" title="Etiquetas efectivas">
              {Object.keys(ready.profile.vocabulary ?? {}).length ? (
                <dl className="crm-detail-list">
                  {Object.entries(ready.profile.vocabulary ?? {}).map(([key, value]) => <Fact key={key} label={key} value={value} />)}
                </dl>
              ) : <EmptyState>El perfil no declara etiquetas personalizadas.</EmptyState>}
            </Panel>
          </ViewGrid>

          <Panel
            actions={<Button icon={<RefreshCw aria-hidden="true" />} onClick={() => setReloadKey((value) => value + 1)} variant="secondary">Actualizar</Button>}
            description="La actualizacion usa version optimista. Los secretos y las politicas IAM no forman parte de este formulario."
            eyebrow="Tenant"
            title="Configuracion versionada"
          >
            <form className="crm-editor" onSubmit={saveConfiguration}>
              <div className="crm-editor__grid">
                <ConfigField label="Perfil" name="profileKey" onChange={setForm} value={form.profileKey} />
                <ConfigField label="Version del perfil" name="profileVersion" onChange={setForm} value={form.profileVersion} />
                <ConfigField label="Zona horaria" name="timezone" onChange={setForm} value={form.timezone} />
                <ConfigField label="Locale" name="locale" onChange={setForm} value={form.locale} />
              </div>
              <div className="crm-config-summary">
                <StatusBadge tone="info">version {ready.config.version}</StatusBadge>
                <StatusBadge tone="neutral">{Object.keys(ready.config.featureFlags ?? {}).length} feature flags</StatusBadge>
                <StatusBadge tone="neutral">{Object.keys(ready.config.labels ?? {}).length} labels tenant</StatusBadge>
              </div>
              <div className="crm-editor__actions">
                <Button disabled={saving} icon={<Save aria-hidden="true" />} type="submit">{saving ? "Guardando" : "Aplicar configuracion"}</Button>
              </div>
            </form>
            {feedback.message ? <ViewNotice message={feedback.message} title="Configuracion" tone="success" /> : null}
            {feedback.error ? <ConfigurationError error={feedback.error} /> : null}
          </Panel>
        </>
      ) : null}
    </WorkspaceLayout>
  );
}

function ConfigField({
  label,
  name,
  onChange,
  value
}: {
  label: string;
  name: keyof typeof emptyConfigForm;
  onChange: React.Dispatch<React.SetStateAction<typeof emptyConfigForm>>;
  value: string;
}) {
  return (
    <label className="crm-field">
      <span>{label}</span>
      <input className="crm-input" onChange={(event) => onChange((current) => ({ ...current, [name]: event.target.value }))} required value={value} />
    </label>
  );
}

const emptyConfigForm = { locale: "", profileKey: "", profileVersion: "", timezone: "" };

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function joinValues(values: string[] | undefined): string {
  return values?.length ? values.join(", ") : "—";
}

function ConfigurationError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const issue = technicalIssueFrom(error);
  return (
    <div className="crm-regional-error">
      <ErrorState action={onRetry ? { label: "Reintentar", onClick: onRetry } : undefined}>{publicMessageFrom(error)}</ErrorState>
      <details><summary>Detalle tecnico</summary><span>Codigo: {issue.code}</span>{issue.requestId ? <span>Request ID: {issue.requestId}</span> : null}</details>
    </div>
  );
}

function isProfile(value: ProfileDefinition | undefined): value is ProfileDefinition {
  return Boolean(value && typeof value.key === "string" && typeof value.version === "string" && typeof value.label === "string");
}

function isConfiguration(value: TenantConfiguration | undefined): value is TenantConfiguration {
  return Boolean(value && typeof value.version === "number");
}
