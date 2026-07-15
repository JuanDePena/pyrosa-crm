import React from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Gauge,
  ShieldCheck,
  Target,
  Tickets,
  UsersRound
} from "lucide-react";
import {
  EmptyState,
  ErrorState,
  ExecutiveDomainCard,
  ExecutiveInsightCard,
  ExecutiveOverviewGrid,
  ExecutiveOverviewHero,
  ExecutiveOverviewScore,
  ExecutiveOverviewSignal,
  ExecutiveOverviewSignals,
  ExecutiveProgressCard,
  ExecutiveRiskCard,
  LoadingState,
  MetricCard,
  MetricGrid,
  Panel,
  StatusStrip,
  ViewNotice
} from "@pyrosa/ui";
import type { ExecutiveTone } from "@pyrosa/ui";
import { WorkspaceLayout } from "@pyrosa/ui-layouts";
import { CrmApiError, fetchCrmJson, publicMessageFrom } from "./crmApi";
import type {
  DashboardMetric,
  DashboardSummary,
  DashboardSummaryResponse,
  DashboardTone
} from "./crmTypes";
import { allowedDashboardRoute } from "./crmRouting";

export type DashboardState =
  | { kind: "loading" }
  | { kind: "error"; error: unknown }
  | { kind: "ready"; summary: DashboardSummary };

export function useDashboardSummary(tenantId: string | undefined) {
  const [reloadKey, setReloadKey] = React.useState(0);
  const [state, setState] = React.useState<DashboardState>({ kind: "loading" });

  React.useEffect(() => {
    if (!tenantId) {
      setState({ kind: "loading" });
      return undefined;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    void fetchCrmJson<DashboardSummaryResponse>("/api/crm/v1/dashboard-summary", {
      signal: controller.signal,
      tenantId
    }).then((response) => {
      if (!isDashboardSummary(response?.data)) {
        throw new CrmApiError("El resumen ejecutivo no cumple el contrato v1.", {
          code: "crm.dashboard.contract_invalid",
          retryable: true
        });
      }
      setState({ kind: "ready", summary: response.data });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ error, kind: "error" });
    });
    return () => controller.abort();
  }, [reloadKey, tenantId]);

  return { reload: () => setReloadKey((value) => value + 1), state };
}

export function DashboardView({
  dashboard,
  tenantLabel
}: {
  dashboard: ReturnType<typeof useDashboardSummary>;
  tenantLabel: string;
}) {
  const { reload, state } = dashboard;

  if (state.kind === "loading") {
    return (
      <WorkspaceLayout className="crm-workspace">
        <StatusStrip items={[
          { icon: <Building2 aria-hidden="true" />, key: "tenant", label: "Tenant", tone: "info", value: tenantLabel },
          { icon: <Clock3 aria-hidden="true" />, key: "freshness", label: "Freshness", tone: "info", value: "cargando" }
        ]} />
        <Panel eyebrow="Overview" title="Preparando metricas CRM">
          <LoadingState>Consultando el resumen autorizado del tenant.</LoadingState>
        </Panel>
      </WorkspaceLayout>
    );
  }

  if (state.kind === "error") {
    return (
      <WorkspaceLayout className="crm-workspace">
        <StatusStrip items={[
          { icon: <Building2 aria-hidden="true" />, key: "tenant", label: "Tenant", tone: "info", value: tenantLabel },
          { icon: <AlertTriangle aria-hidden="true" />, key: "freshness", label: "Freshness", tone: "warning", value: "unavailable" }
        ]} />
        <Panel eyebrow="Overview" title="Resumen no disponible">
          <ErrorState action={{ label: "Reintentar", onClick: reload }}>
            {publicMessageFrom(state.error)} No se activaron metricas locales ni datos de respaldo.
          </ErrorState>
        </Panel>
      </WorkspaceLayout>
    );
  }

  const { summary } = state;
  const unavailable = summary.freshness.state === "unavailable";
  const empty = summary.freshness.state === "empty";
  const stale = summary.freshness.state === "stale";
  return (
    <WorkspaceLayout className="crm-workspace">
      <StatusStrip items={[
        { icon: <Building2 aria-hidden="true" />, key: "tenant", label: "Tenant", tone: "info", value: tenantLabel },
        { icon: <Clock3 aria-hidden="true" />, key: "freshness", label: "Freshness", tone: stale || unavailable ? "warning" : "success", value: summary.freshness.state },
        { icon: <CalendarClock aria-hidden="true" />, key: "period", label: "Periodo", tone: "info", value: formatPeriod(summary.period) },
        { icon: <ShieldCheck aria-hidden="true" />, key: "profile", label: "Perfil", tone: "info", value: summary.profileVersion }
      ]} />

      {stale ? (
        <ViewNotice
          message={`Ultima generacion ${formatDateTime(summary.freshness.generatedAt ?? summary.asOf)}. Los valores permanecen marcados como stale.`}
          title="Resumen desactualizado"
          tone="warning"
        />
      ) : null}
      {unavailable ? (
        <ErrorState action={{ label: "Reintentar", onClick: reload }}>
          El read model ejecutivo esta temporalmente no disponible. No se muestran valores anteriores como actuales.
        </ErrorState>
      ) : null}
      {empty ? (
        <EmptyState>No hay actividad dentro del periodo autorizado. El estado se conserva como empty.</EmptyState>
      ) : null}

      {!unavailable ? (
        <section className="crm-dashboard" data-dashboard-kind="analytic">
          <ExecutiveOverviewHero
            description={`Metricas ${summary.metricSetVersion} · ${summary.timezone} · corte ${formatDateTime(summary.asOf)}`}
            eyebrow="Operacion CRM"
            score={
              <ExecutiveOverviewScore
                label={summary.score.label ?? `Formula ${summary.score.formulaVersion}`}
                status={summary.score.status ?? summary.freshness.state}
                tone={executiveTone(summary.score.tone)}
                value={summary.score.value}
              />
            }
            signals={
              <ExecutiveOverviewSignals columns="auto">
                {summary.signals.map((signal) => (
                  <ExecutiveOverviewSignal key={signal.key} label={signal.label} value={signal.value} />
                ))}
              </ExecutiveOverviewSignals>
            }
            title="Estado ejecutivo del CRM"
          />

          {summary.metrics.length ? (
            <MetricGrid aria-label="Metricas CRM" columns={summary.metrics.length > 2 ? 3 : 2} density="comfortable">
              {summary.metrics.map((metric) => (
                <MetricCard
                  detail={metricDetail(metric)}
                  icon={metricIcon(metric.key)}
                  key={metric.key}
                  label={metric.label}
                  tone={metricCardTone(metric.tone)}
                  value={formatMetricValue(metric)}
                />
              ))}
            </MetricGrid>
          ) : null}

          <ExecutiveSection title="Progreso" visible={summary.progress.length > 0}>
            <ExecutiveOverviewGrid columns="auto" variant="progress">
              {summary.progress.map((item) => (
                <ExecutiveProgressCard
                  detail={item.detail}
                  icon={metricIcon(item.key)}
                  key={item.key}
                  label={item.label}
                  percent={metricPercent(item)}
                  tone={executiveTone(item.tone)}
                  value={formatMetricValue(item)}
                />
              ))}
            </ExecutiveOverviewGrid>
          </ExecutiveSection>

          <ExecutiveSection title="Dominios" visible={summary.domains.length > 0}>
            <ExecutiveOverviewGrid columns="auto" variant="domains">
              {summary.domains.map((domain) => {
                const href = allowedDashboardRoute(domain.route);
                const card = (
                  <ExecutiveDomainCard
                    contract={`${domain.value} registros`}
                    icon={domainIcon(domain.key)}
                    owner="pyrosa-democrm"
                    status={domain.status}
                    title={domain.label}
                  />
                );
                return href ? <a className="crm-overview-link" href={href} key={domain.key}>{card}</a> : <React.Fragment key={domain.key}>{card}</React.Fragment>;
              })}
            </ExecutiveOverviewGrid>
          </ExecutiveSection>

          <ExecutiveSection title="Riesgos" visible={summary.risks.length > 0}>
            <ExecutiveOverviewGrid columns="auto" variant="risks">
              {summary.risks.map((risk) => (
                <ExecutiveRiskCard
                  action={dashboardAction(risk.route, "Revisar")}
                  detail={`Severidad ${risk.severity}`}
                  icon={<AlertTriangle aria-hidden="true" />}
                  key={risk.key}
                  title={risk.label}
                  tone={riskTone(risk.severity)}
                  value={risk.count}
                />
              ))}
            </ExecutiveOverviewGrid>
          </ExecutiveSection>

          <ExecutiveSection title="Insights" visible={summary.insights.length > 0}>
            <ExecutiveOverviewGrid columns="auto" variant="insights">
              {summary.insights.map((insight) => (
                <ExecutiveInsightCard
                  action={dashboardAction(insight.route, "Abrir inventario")}
                  detail={insight.detail}
                  icon={<Gauge aria-hidden="true" />}
                  key={insight.key}
                  title={insight.title}
                  tone={executiveTone(insight.tone)}
                />
              ))}
            </ExecutiveOverviewGrid>
          </ExecutiveSection>
        </section>
      ) : null}
    </WorkspaceLayout>
  );
}

function ExecutiveSection({ children, title, visible }: { children: React.ReactNode; title: string; visible: boolean }) {
  if (!visible) return null;
  return <Panel eyebrow="Overview" title={title}>{children}</Panel>;
}

function dashboardAction(route: string | undefined, label: string): React.ReactNode {
  const href = allowedDashboardRoute(route);
  return href ? <a className="crm-overview-action" href={href}>{label}</a> : undefined;
}

function executiveTone(tone: DashboardTone | undefined): ExecutiveTone {
  if (tone === "success" || tone === "warning" || tone === "danger" || tone === "info") return tone;
  return "neutral";
}

function riskTone(severity: string): ExecutiveTone {
  if (severity === "high" || severity === "critical") return "danger";
  if (severity === "medium") return "warning";
  return "neutral";
}

function metricCardTone(tone: DashboardTone | undefined): "blue" | "green" | "amber" | "red" {
  if (tone === "success") return "green";
  if (tone === "warning") return "amber";
  if (tone === "danger") return "red";
  return "blue";
}

function metricIcon(key: string) {
  const normalized = key.toLowerCase();
  if (normalized.includes("case") || normalized.includes("caso")) return <Tickets aria-hidden="true" />;
  if (normalized.includes("appointment") || normalized.includes("cita")) return <CalendarClock aria-hidden="true" />;
  if (normalized.includes("contact")) return <UsersRound aria-hidden="true" />;
  if (normalized.includes("opportun") || normalized.includes("pipeline")) return <Target aria-hidden="true" />;
  if (normalized.includes("risk") || normalized.includes("overdue")) return <AlertTriangle aria-hidden="true" />;
  return <Activity aria-hidden="true" />;
}

function domainIcon(key: string) {
  return metricIcon(key);
}

function metricPercent(metric: DashboardMetric): number {
  if (typeof metric.percent === "number") return clampPercent(metric.percent);
  if (typeof metric.value === "number" && typeof metric.target === "number" && metric.target > 0) {
    return clampPercent((metric.value / metric.target) * 100);
  }
  return 0;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function metricDetail(metric: DashboardMetric): string | undefined {
  if (metric.detail) return metric.detail;
  if (typeof metric.target === "number") return `Objetivo ${metric.target}${metric.unit ? ` ${metric.unit}` : ""}`;
  return undefined;
}

function formatMetricValue(metric: DashboardMetric): string | number {
  return metric.unit ? `${metric.value} ${metric.unit}` : metric.value;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "sin fecha valida"
    : new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatPeriod(period: { from: string; to: string }): string {
  return `${formatDate(period.from)} - ${formatDate(period.to)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "sin fecha valida"
    : new Intl.DateTimeFormat("es-DO", { dateStyle: "medium" }).format(date);
}

function isDashboardSummary(value: DashboardSummary | undefined): value is DashboardSummary {
  return Boolean(
    value &&
    typeof value.contractVersion === "string" &&
    typeof value.metricSetVersion === "string" &&
    typeof value.profileVersion === "string" &&
    value.period &&
    typeof value.period.from === "string" &&
    typeof value.period.to === "string" &&
    typeof value.timezone === "string" &&
    typeof value.asOf === "string" &&
    value.freshness &&
    ["live", "empty", "stale", "unavailable"].includes(value.freshness.state) &&
    value.score &&
    Array.isArray(value.metrics) &&
    Array.isArray(value.signals) &&
    Array.isArray(value.progress) &&
    Array.isArray(value.risks) &&
    Array.isArray(value.domains) &&
    Array.isArray(value.insights)
  );
}
