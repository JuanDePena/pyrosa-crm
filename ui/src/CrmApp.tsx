import React from "react";
import {
  Bell,
  LogOut,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  UserRound
} from "lucide-react";
import {
  DetailDrawer,
  EmptyState,
  LoadingState,
  StatusBadge,
  UserDrawer
} from "@pyrosa/ui";
import type { NavigationRoute } from "@pyrosa/ui";
import { BusinessOpsShellTemplate } from "@pyrosa/ui-templates";
import { createThemeCssVariables, pyrosaBaseThemeManifest } from "@pyrosa/ui-theme";
import type { PyrosaThemeMode } from "@pyrosa/ui-theme";
import { ConfigurationView } from "./ConfigurationView";
import { DashboardView, useDashboardSummary } from "./DashboardView";
import { FatalErrorLanding } from "./FatalErrorLanding";
import { ResourceView } from "./ResourceViews";
import { CrmApiError, fetchAppJson, publicMessageFrom, setCrmCsrfToken, technicalIssueFrom } from "./crmApi";
import type { BootstrapResponse, ClientSession, CrmLocation, SessionResponse } from "./crmTypes";
import { isResourceRoute, locationFromHash, navigateToLocation } from "./crmRouting";
import {
  createCrmSidebarItems,
  routeById
} from "./routeRegistry";
import type { CrmRouteId } from "./routeRegistry";

type ShellRoute = NavigationRoute<CrmRouteId>;
type OpenDrawer = "alerts" | "user" | null;
type BootstrapState =
  | { kind: "loading" }
  | { error: unknown; kind: "error" }
  | {
      bootstrap: BootstrapResponse;
      kind: "ready";
      session: ClientSession;
      tenantId: string;
      tenantLabel: string;
    };

export function CrmApp() {
  const [bootstrapKey, setBootstrapKey] = React.useState(0);
  const [bootstrapState, setBootstrapState] = React.useState<BootstrapState>({ kind: "loading" });
  const [location, setLocation] = React.useState<CrmLocation>(() => currentLocation());
  const [openDrawer, setOpenDrawer] = React.useState<OpenDrawer>(null);
  const [themeMode, setThemeMode] = React.useState<PyrosaThemeMode>(readStoredThemeMode);

  React.useEffect(() => {
    const controller = new AbortController();
    setCrmCsrfToken(undefined);
    setBootstrapState({ kind: "loading" });
    void Promise.all([
      fetchAppJson<SessionResponse>("/api/crm/session", controller.signal),
      fetchAppJson<BootstrapResponse>("/api/crm/bootstrap", controller.signal)
    ]).then(([sessionResponse, bootstrap]) => {
      const session = sessionResponse.session;
      if (!session) {
        throw new CrmApiError("No se pudo establecer una sesion delegada valida.", {
          code: "crm.bootstrap.session_missing",
          retryable: false
        });
      }
      if (!session.csrfToken) {
        throw new CrmApiError("La sesion delegada no incluyo la proteccion de escritura requerida.", {
          code: "crm.bootstrap.csrf_missing",
          retryable: false
        });
      }
      setCrmCsrfToken(session.csrfToken);
      const tenantId = bootstrap.context?.activeTenantId ?? session.tenant?.id;
      if (!tenantId) {
        throw new CrmApiError("No hay un tenant autorizado activo para DemoCRM.", {
          code: "crm.bootstrap.tenant_missing",
          retryable: false
        });
      }
      if (!bootstrap.app?.version) {
        throw new CrmApiError("El runtime no informo una version verificable de DemoCRM.", {
          code: "crm.bootstrap.version_missing",
          retryable: true
        });
      }
      setBootstrapState({
        bootstrap,
        kind: "ready",
        session,
        tenantId,
        tenantLabel: bootstrap.context?.displayName ?? session.tenant?.label ?? "Tenant activo"
      });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setBootstrapState({ error, kind: "error" });
    });
    return () => controller.abort();
  }, [bootstrapKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleHashChange = () => {
      setLocation(currentLocation());
      setOpenDrawer(null);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.themeMode = themeMode;
    document.documentElement.dataset.themeResolved = themeMode;
    writeStoredThemeMode(themeMode);
  }, [themeMode]);

  React.useEffect(() => {
    if (!openDrawer) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      setOpenDrawer(null);
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [openDrawer]);

  const themeCss = React.useMemo(
    () => createThemeCssVariables(pyrosaBaseThemeManifest, themeMode),
    [themeMode]
  );
  const dashboard = useDashboardSummary(
    bootstrapState.kind === "ready" ? bootstrapState.tenantId : undefined
  );

  if (bootstrapState.kind === "loading") {
    return (
      <>
        <style>{themeCss}</style>
        <main className="crm-bootstrap-state">
          <LoadingState>Validando sesion, tenant y readiness de DemoCRM.</LoadingState>
        </main>
      </>
    );
  }

  if (bootstrapState.kind === "error") {
    return (
      <>
        <style>{themeCss}</style>
        <FatalErrorLanding
          issue={technicalIssueFrom(bootstrapState.error)}
          message={`${publicMessageFrom(bootstrapState.error)} No se activaron datos locales ni una vista de respaldo.`}
          onRetry={() => setBootstrapKey((value) => value + 1)}
        />
      </>
    );
  }

  const { bootstrap, session, tenantId, tenantLabel } = bootstrapState;
  const routeDefinition = routeById[location.routeId];
  const displayName = session.user?.displayName || session.user?.email || "Sesion delegada";
  const displayEmail = session.user?.email || session.user?.primaryEmail?.email || "pyrosa-iam";
  const title = viewTitle(location);
  const navigation = createCrmSidebarItems({
    activeRoute: location.routeId,
    onSelect: (routeId) => navigateToLocation(routeId),
    statusByRoute: navigationStatuses(dashboard.state, bootstrap.context?.profileVersion)
  });
  const canGoBack = location.routeId !== "dashboard";

  function navigateBack() {
    if (location.mode === "detail" || location.mode === "edit" || location.mode === "new") {
      navigateToLocation(location.routeId);
      return;
    }
    navigateToLocation("dashboard");
  }

  return (
    <>
      <style>{themeCss}</style>
      <BusinessOpsShellTemplate<ShellRoute>
        alertsCount={0}
        alertsExpanded={openDrawer === "alerts"}
        alertsLabel="Notificaciones"
        branch={bootstrap.app?.branch}
        brandLogoAlt=""
        brandLogoSrc="/public/assets/brand/crm-logo.png"
        brandTitle="PYROSA CRM"
        contentScrollPersistKey={`democrm-${location.routeId}-${location.mode}`}
        description={routeDefinition.description}
        environment="demo"
        leadingAction={canGoBack ? undefined : false}
        navigation={navigation}
        onAlertsClick={() => setOpenDrawer((current) => current === "alerts" ? null : "alerts")}
        onBack={canGoBack ? navigateBack : undefined}
        onEscapeBack={canGoBack ? navigateBack : undefined}
        onThemeToggle={() => setThemeMode((current) => current === "light" ? "dark" : "light")}
        onUserClick={() => setOpenDrawer((current) => current === "user" ? null : "user")}
        showTopbarMeta={false}
        sidebarPersistKey="pyrosa-democrm"
        themeMode={themeMode}
        title={title}
        userExpanded={openDrawer === "user"}
        userLabel="Cuenta"
        version={bootstrap.app?.version}
      >
        <UserDrawer
          links={[
            {
              description: "Datos personales y correos en Accounts",
              href: "https://accounts.pyrosa.com.do/ui#profile",
              icon: <UserRound size={15} />,
              label: "Perfil",
              onClick: () => setOpenDrawer(null)
            },
            {
              description: "Idioma, tema y preferencias de autoservicio",
              href: "https://accounts.pyrosa.com.do/ui#preferences",
              icon: <Settings size={15} />,
              label: "Preferencias",
              onClick: () => setOpenDrawer(null)
            },
            {
              description: "Factores MFA administrados por IAM y Accounts",
              href: "https://accounts.pyrosa.com.do/ui#mfa",
              icon: <ShieldCheck size={15} />,
              label: "MFA",
              onClick: () => setOpenDrawer(null)
            },
            {
              description: "Accesos y dispositivos activos",
              href: "https://accounts.pyrosa.com.do/ui#sessions",
              icon: <MonitorSmartphone size={15} />,
              label: "Sesiones",
              onClick: () => setOpenDrawer(null)
            }
          ]}
          logoutHref="/logout"
          logoutIcon={<LogOut size={15} />}
          logoutLabel="Cerrar sesion"
          onClose={() => setOpenDrawer(null)}
          open={openDrawer === "user"}
          sections={[
            {
              description: "IAM conserva identidad y seguridad; DemoCRM consume una sesion delegada.",
              details: [
                { label: "Estado", value: session.user?.status ?? "delegada" },
                { label: "Origen", value: "pyrosa-iam" }
              ],
              title: "Cuenta"
            },
            {
              description: "La preferencia de tema es presentacional y permanece en este navegador.",
              details: [{ label: "Tema", value: themeMode === "dark" ? "Oscuro" : "Claro" }],
              title: "Preferencias UI"
            },
            {
              description: "El tenant se resolvio en servidor y cada operacion vuelve a validar acceso compuesto.",
              details: [{ label: "Tenant", value: tenantLabel }],
              title: "Alcance DemoCRM"
            },
            {
              description: "El perfil efectivo adapta la operacion sin bifurcar el producto.",
              details: [{ label: "Perfil", value: bootstrap.context?.profileKey ? `${bootstrap.context.profileKey}@${bootstrap.context.profileVersion ?? "?"}` : "resuelto por CRM" }],
              title: "Configuracion efectiva"
            }
          ]}
          user={{
            avatarLabel: displayName.slice(0, 1).toUpperCase(),
            badges: <StatusBadge tone="success">v2607</StatusBadge>,
            email: displayEmail,
            name: displayName,
            role: session.user?.role ?? "Sesion IAM delegada"
          }}
        />

        <DetailDrawer closeLabel="Cerrar notificaciones" eyebrow="CRM" onClose={() => setOpenDrawer(null)} open={openDrawer === "alerts"} title="Notificaciones">
          <div className="crm-notification-stack">
            <EmptyState>No hay notificaciones pendientes.</EmptyState>
            <p className="crm-notification-note"><Bell aria-hidden="true" /> La entrega de notificaciones pertenece a Directory.</p>
          </div>
        </DetailDrawer>

        {renderView(location, tenantId, tenantLabel, dashboard)}
      </BusinessOpsShellTemplate>
    </>
  );
}

function renderView(
  location: CrmLocation,
  tenantId: string,
  tenantLabel: string,
  dashboard: ReturnType<typeof useDashboardSummary>
) {
  if (location.routeId === "dashboard") {
    return <DashboardView dashboard={dashboard} tenantLabel={tenantLabel} />;
  }
  if (location.routeId === "configuracion") {
    return <ConfigurationView tenantId={tenantId} tenantLabel={tenantLabel} />;
  }
  if (isResourceRoute(location.routeId)) {
    return <ResourceView initialAttention={location.attentionFilter} initialDirection={location.direction} initialSort={location.sort} initialStatus={location.statusFilter} mode={location.mode} recordId={location.recordId} routeId={location.routeId} tenantId={tenantId} tenantLabel={tenantLabel} />;
  }
  return null;
}

function navigationStatuses(
  dashboardState: ReturnType<typeof useDashboardSummary>["state"],
  profileVersion: string | undefined
) {
  const statuses: Partial<Record<CrmRouteId, React.ReactNode>> = {};
  if (dashboardState.kind === "ready") {
    const freshness = dashboardState.summary.freshness.state;
    statuses.dashboard = <StatusBadge tone={freshness === "live" ? "success" : freshness === "empty" ? "neutral" : "warning"}>{freshness}</StatusBadge>;
    for (const domain of dashboardState.summary.domains) {
      if (!domain.route) continue;
      const routeId = locationFromHash(domain.route.startsWith("#") ? domain.route : `#${domain.route}`).routeId;
      if (routeId === "dashboard" || routeId === "configuracion") continue;
      statuses[routeId] = <StatusBadge tone={domain.status === "ready" || domain.status === "live" ? "success" : "info"}>{domain.status ?? "live"}</StatusBadge>;
    }
  } else if (dashboardState.kind === "error") {
    statuses.dashboard = <StatusBadge tone="warning">unavailable</StatusBadge>;
  }
  if (profileVersion) {
    statuses.configuracion = <StatusBadge tone="info">{profileVersion}</StatusBadge>;
  }
  return statuses;
}

function currentLocation(): CrmLocation {
  return locationFromHash(typeof window === "undefined" ? "#dashboard" : window.location.hash);
}

function viewTitle(location: CrmLocation): string {
  const route = routeById[location.routeId];
  if (location.mode === "new") return `Nueva ${route.label.toLowerCase()}`;
  if (location.mode === "detail") return `Detalle · ${route.label}`;
  if (location.mode === "edit") return `Editar · ${route.label}`;
  return route.title;
}

const themeModeStorageKey = "pyrosa-democrm.themeMode.v1";

function readStoredThemeMode(): PyrosaThemeMode {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(themeModeStorageKey) === "dark" ? "dark" : "light";
}

function writeStoredThemeMode(themeMode: PyrosaThemeMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(themeModeStorageKey, themeMode);
}
