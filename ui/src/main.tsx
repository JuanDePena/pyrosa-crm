import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Bell,
  Building2,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";
import {
  AppShell,
  Button,
  MetricCard,
  MetricGrid,
  Panel,
  ShellMetaBadge,
  Sidebar,
  StatusBadge,
  StatusStrip,
  Topbar,
  ViewGrid
} from "@pyrosa/ui";
import { WorkspaceLayout } from "@pyrosa/ui-layouts";
import "@pyrosa/ui/styles.css";
import "@pyrosa/ui-layouts/styles.css";
import "./styles.css";

type ClientSession = {
  expiresAt?: string;
  uiAuthAuthenticatedAt?: string;
  user?: {
    email?: string;
    displayName?: string;
    role?: string;
    locale?: string;
    timezone?: string;
    status?: string;
    primaryEmail?: {
      email?: string;
      isVerified?: boolean;
    };
    security?: {
      mfaRequired?: boolean;
      activeMfaMethods?: number;
    };
  };
};

type SessionResponse = {
  ok?: boolean;
  session?: ClientSession;
};

type BootstrapModule = {
  key: string;
  label: string;
  status: string;
};

type BootstrapResponse = {
  app?: {
    branch?: string;
    name?: string;
    version?: string;
  };
  modules?: BootstrapModule[];
  platform?: Record<string, unknown>;
};

type CrmRouteId =
  | "dashboard"
  | "cuentas"
  | "contactos"
  | "oportunidades"
  | "actividades"
  | "reportes"
  | "configuracion"
  | "plataforma"
  | "marca"
  | "runtime";

type RouteDefinition = {
  description: string;
  groupId: "crm" | "plataforma";
  groupLabel: string;
  groupOrder: number;
  hash: string;
  icon: React.ReactNode;
  id: CrmRouteId;
  itemOrder: number;
  label: string;
  title: string;
};

type ModuleCard = {
  detail: string;
  icon: React.ReactNode;
  key: string;
  label: string;
  owner: string;
  status: string;
};

type PlatformService = {
  icon: React.ReactNode;
  name: string;
  owns: string;
  service: string;
  status: string;
};

const routeDefinitions: RouteDefinition[] = [
  {
    description: "Resumen del scaffold CRM y estado de la sesion delegada.",
    groupId: "crm",
    groupLabel: "CRM",
    groupOrder: 1,
    hash: "dashboard",
    icon: <LayoutDashboard aria-hidden="true" />,
    id: "dashboard",
    itemOrder: 1,
    label: "Dashboard",
    title: "Dashboard CRM"
  },
  {
    description: "Cuentas y organizaciones comerciales pendientes de contrato productivo.",
    groupId: "crm",
    groupLabel: "CRM",
    groupOrder: 1,
    hash: "cuentas",
    icon: <Building2 aria-hidden="true" />,
    id: "cuentas",
    itemOrder: 2,
    label: "Cuentas",
    title: "Cuentas"
  },
  {
    description: "Contactos, roles y preferencias comerciales.",
    groupId: "crm",
    groupLabel: "CRM",
    groupOrder: 1,
    hash: "contactos",
    icon: <UsersRound aria-hidden="true" />,
    id: "contactos",
    itemOrder: 3,
    label: "Contactos",
    title: "Contactos"
  },
  {
    description: "Pipeline, etapas, propuestas y probabilidad comercial.",
    groupId: "crm",
    groupLabel: "CRM",
    groupOrder: 1,
    hash: "oportunidades",
    icon: <FileText aria-hidden="true" />,
    id: "oportunidades",
    itemOrder: 4,
    label: "Oportunidades",
    title: "Oportunidades"
  },
  {
    description: "Seguimientos, tareas y proximas acciones.",
    groupId: "crm",
    groupLabel: "CRM",
    groupOrder: 1,
    hash: "actividades",
    icon: <Bell aria-hidden="true" />,
    id: "actividades",
    itemOrder: 5,
    label: "Actividades",
    title: "Actividades"
  },
  {
    description: "Lecturas comerciales y tableros por conectar a contratos CRM.",
    groupId: "crm",
    groupLabel: "CRM",
    groupOrder: 1,
    hash: "reportes",
    icon: <Database aria-hidden="true" />,
    id: "reportes",
    itemOrder: 6,
    label: "Reportes",
    title: "Reportes"
  },
  {
    description: "Parametros, fronteras de integracion y preferencias por tenant.",
    groupId: "crm",
    groupLabel: "CRM",
    groupOrder: 1,
    hash: "configuracion",
    icon: <Settings aria-hidden="true" />,
    id: "configuracion",
    itemOrder: 7,
    label: "Configuracion",
    title: "Configuracion"
  },
  {
    description: "Servicios Pyrosa consumidos por DemoCRM sin acoplamiento directo.",
    groupId: "plataforma",
    groupLabel: "Plataforma",
    groupOrder: 2,
    hash: "plataforma",
    icon: <Link2 aria-hidden="true" />,
    id: "plataforma",
    itemOrder: 1,
    label: "Servicios",
    title: "Servicios plataforma"
  },
  {
    description: "Identidad visual y assets propios de DemoCRM.",
    groupId: "plataforma",
    groupLabel: "Plataforma",
    groupOrder: 2,
    hash: "marca",
    icon: <ImageIcon aria-hidden="true" />,
    id: "marca",
    itemOrder: 2,
    label: "Marca",
    title: "Marca CRM"
  },
  {
    description: "Sesion delegada, runtime y limites de plataforma.",
    groupId: "plataforma",
    groupLabel: "Plataforma",
    groupOrder: 2,
    hash: "runtime",
    icon: <Activity aria-hidden="true" />,
    id: "runtime",
    itemOrder: 3,
    label: "Runtime",
    title: "Runtime"
  }
];

const routeById = Object.fromEntries(routeDefinitions.map((route) => [route.id, route])) as Record<CrmRouteId, RouteDefinition>;
const routeIdByHash = new Map<string, CrmRouteId>([
  ["inicio", "dashboard"],
  ["modulos", "dashboard"],
  ...routeDefinitions.map((route) => [route.hash, route.id] as const)
]);

const modules: ModuleCard[] = [
  {
    detail: "Organizaciones comerciales, segmentos y relaciones activas.",
    icon: <Building2 aria-hidden="true" />,
    key: "accounts",
    label: "Cuentas",
    owner: "CRM",
    status: "planned"
  },
  {
    detail: "Personas, roles, preferencias y datos de relacion.",
    icon: <UsersRound aria-hidden="true" />,
    key: "contacts",
    label: "Contactos",
    owner: "CRM",
    status: "planned"
  },
  {
    detail: "Pipeline, etapas, propuestas y probabilidad comercial.",
    icon: <FileText aria-hidden="true" />,
    key: "opportunities",
    label: "Oportunidades",
    owner: "CRM",
    status: "planned"
  },
  {
    detail: "Seguimientos, tareas, recordatorios y proximas acciones.",
    icon: <Bell aria-hidden="true" />,
    key: "activities",
    label: "Actividades",
    owner: "CRM",
    status: "planned"
  }
];

const platformServices: PlatformService[] = [
  {
    icon: <Database aria-hidden="true" />,
    name: "Platform",
    owns: "Catalogo de apps, gobierno visual, contratos runtime y estado operativo",
    service: "pyrosa-platform",
    status: "Contrato externo"
  },
  {
    icon: <ShieldCheck aria-hidden="true" />,
    name: "IAM",
    owns: "Autenticacion, MFA, tickets ui-auth, sesiones globales y politicas de acceso",
    service: "pyrosa-iam",
    status: "Auth delegada"
  },
  {
    icon: <UserRound aria-hidden="true" />,
    name: "Accounts",
    owns: "Centro de cuenta, perfil de usuario, preferencias y autoservicio",
    service: "pyrosa-accounts",
    status: "Contrato externo"
  }
];

function activeRouteFromLocation(): CrmRouteId {
  if (typeof window === "undefined") {
    return "dashboard";
  }
  const hash = window.location.hash.replace(/^#/, "");
  return routeIdByHash.get(hash) ?? "dashboard";
}

function App() {
  const [session, setSession] = React.useState<ClientSession | null>(null);
  const [bootstrap, setBootstrap] = React.useState<BootstrapResponse | null>(null);
  const [brandLogoReady, setBrandLogoReady] = React.useState(true);
  const [activeRoute, setActiveRoute] = React.useState<CrmRouteId>(activeRouteFromLocation);

  React.useEffect(() => {
    let active = true;

    void Promise.allSettled([
      fetchJson<SessionResponse>("/api/crm/session"),
      fetchJson<BootstrapResponse>("/api/crm/bootstrap")
    ]).then(([sessionResult, bootstrapResult]) => {
      if (!active) {
        return;
      }
      if (sessionResult.status === "fulfilled" && sessionResult.value?.session) {
        setSession(sessionResult.value.session);
      }
      if (bootstrapResult.status === "fulfilled" && bootstrapResult.value) {
        setBootstrap(bootstrapResult.value);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function handleHashChange() {
      setActiveRoute(activeRouteFromLocation());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const displayName = session?.user?.displayName || session?.user?.email || "Sesion delegada";
  const displayEmail = session?.user?.email || session?.user?.primaryEmail?.email || "pyrosa-iam";
  const brandLogoUrl = "/public/assets/brand/crm-logo.png";
  const branch = bootstrap?.app?.branch ?? "main";
  const version = bootstrap?.app?.version ?? "v2606";
  const bootstrapModules = bootstrap?.modules?.length ? bootstrap.modules : modules;
  const activeRouteDefinition = routeById[activeRoute];
  const mfaLabel = session?.user?.security?.activeMfaMethods
    ? `${session.user.security.activeMfaMethods} MFA`
    : session?.user?.security?.mfaRequired
      ? "MFA requerido"
      : "MFA gestionado";

  function navigateToRoute(routeId: CrmRouteId) {
    const route = routeById[routeId];
    setActiveRoute(routeId);
    if (typeof window !== "undefined" && window.location.hash !== `#${route.hash}`) {
      window.location.hash = route.hash;
    }
  }

  function handleLogout() {
    window.location.assign("/logout");
  }

  const navItems = routeDefinitions.map((route) => ({
    active: activeRoute === route.id,
    groupId: route.groupId,
    groupLabel: route.groupLabel,
    groupOrder: route.groupOrder,
    href: `#${route.hash}`,
    icon: route.icon,
    id: route.id,
    itemOrder: route.itemOrder,
    label: route.label,
    onSelect: () => navigateToRoute(route.id),
    status: route.id === "dashboard"
      ? <StatusBadge tone="info">{modules.length}</StatusBadge>
      : route.id === "plataforma"
        ? <StatusBadge tone="info">{platformServices.length}</StatusBadge>
        : undefined
  }));

  return (
    <AppShell
      className="crm-shell"
      contentClassName="crm-shell__content"
      contentScrollPersistKey="democrm-shell-v1"
      sidebar={
        <Sidebar
          ariaLabel="CRM"
          brand={
            <div className="crm-brand">
              <div className="crm-brand__mark">
                {brandLogoReady ? (
                  <img alt="" src={brandLogoUrl} onError={() => setBrandLogoReady(false)} />
                ) : (
                  "PC"
                )}
              </div>
              <div>
                <div className="crm-brand__title">PYROSA CRM</div>
                <div className="crm-brand__subtitle">{version} demo</div>
              </div>
            </div>
          }
          footer={
            <div className="crm-session-summary">
              <UserRound aria-hidden="true" />
              <span>
                <strong>{displayName}</strong>
                <small>{displayEmail}</small>
              </span>
              <Button icon={<LogOut aria-hidden="true" />} onClick={handleLogout} variant="ghost">
                Salir
              </Button>
            </div>
          }
          items={navItems}
          meta={
            <>
              <ShellMetaBadge tone="env">demo</ShellMetaBadge>
              <ShellMetaBadge tone="version">{branch}</ShellMetaBadge>
            </>
          }
          persistKey="democrm-main-v1"
          searchable
          showGroupCounts
        />
      }
      topbar={
        <Topbar
          actions={
            <Button icon={<LogOut aria-hidden="true" />} onClick={handleLogout} variant="secondary">
              Salir
            </Button>
          }
          description={activeRouteDefinition.description}
          eyebrow="democrm.pyrosa.com.do"
          meta={
            <>
              <ShellMetaBadge tone="success">Auth delegada</ShellMetaBadge>
              <ShellMetaBadge tone="info">PostgreSQL demo</ShellMetaBadge>
            </>
          }
          title={activeRouteDefinition.title}
        />
      }
    >
      <WorkspaceLayout className="crm-workspace">
        <StatusStrip
          items={[
            { icon: <Gauge aria-hidden="true" />, key: "view", label: "Vista", tone: "info", value: activeRouteDefinition.label },
            { icon: <Database aria-hidden="true" />, key: "modules", label: "Modulos", tone: "success", value: bootstrapModules.length },
            { icon: <ShieldCheck aria-hidden="true" />, key: "security", label: "Seguridad", tone: "info", value: mfaLabel },
            { icon: <CheckCircle2 aria-hidden="true" />, key: "runtime", label: "Runtime", tone: "success", value: "v2606" }
          ]}
        />

        {renderRoute({
          activeRoute,
          bootstrap,
          brandLogoReady,
          brandLogoUrl,
          displayEmail,
          displayName,
          setBrandLogoReady,
          setRoute: navigateToRoute
        })}
      </WorkspaceLayout>
    </AppShell>
  );
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  return response.ok ? (response.json() as Promise<T>) : null;
}

function renderRoute({
  activeRoute,
  bootstrap,
  brandLogoReady,
  brandLogoUrl,
  displayEmail,
  displayName,
  setBrandLogoReady,
  setRoute
}: {
  activeRoute: CrmRouteId;
  bootstrap: BootstrapResponse | null;
  brandLogoReady: boolean;
  brandLogoUrl: string;
  displayEmail: string;
  displayName: string;
  setBrandLogoReady: (ready: boolean) => void;
  setRoute: (routeId: CrmRouteId) => void;
}) {
  if (activeRoute === "plataforma") {
    return <PlatformRoute />;
  }
  if (activeRoute === "marca") {
    return <BrandRoute brandLogoReady={brandLogoReady} brandLogoUrl={brandLogoUrl} setBrandLogoReady={setBrandLogoReady} />;
  }
  if (activeRoute === "runtime") {
    return <RuntimeRoute bootstrap={bootstrap} displayEmail={displayEmail} displayName={displayName} />;
  }
  if (activeRoute === "dashboard") {
    return <DashboardRoute bootstrap={bootstrap} setRoute={setRoute} />;
  }
  return <ModuleRoute route={routeById[activeRoute]} />;
}

function DashboardRoute({
  bootstrap,
  setRoute
}: {
  bootstrap: BootstrapResponse | null;
  setRoute: (routeId: CrmRouteId) => void;
}) {
  const bootstrapModules = bootstrap?.modules?.length ? bootstrap.modules : modules;
  return (
    <>
      <MetricGrid columns={4} density="comfortable">
        <MetricCard detail="rutas shell" icon={<LayoutDashboard />} label="Vistas" value={routeDefinitions.length} />
        <MetricCard detail="cuentas/contactos/pipeline" icon={<Building2 />} label="Dominios" tone="green" value={modules.length} />
        <MetricCard detail="Platform, IAM, Accounts" icon={<Link2 />} label="Servicios" value={platformServices.length} />
        <MetricCard detail="desde bootstrap" icon={<CheckCircle2 />} label="Modulos" tone="amber" value={bootstrapModules.length} />
      </MetricGrid>

      <ViewGrid className="crm-overview-grid" variant="wide-main">
        <Panel className="crm-overview-panel" eyebrow="CRM" title="Superficie demo">
          <div className="crm-route-grid">
            {routeDefinitions
              .filter((route) => route.groupId === "crm" && route.id !== "dashboard")
              .map((route) => (
                <button className="crm-route-tile" key={route.id} onClick={() => setRoute(route.id)} type="button">
                  {route.icon}
                  <span>
                    <strong>{route.label}</strong>
                    <small>{route.description}</small>
                  </span>
                </button>
              ))}
          </div>
        </Panel>

        <Panel eyebrow="Modulos" title="Contratos iniciales">
          <div className="crm-module-stack">
            {modules.map((module) => (
              <div className="crm-module-row" key={module.key}>
                {module.icon}
                <span>
                  <strong>{module.label}</strong>
                  <small>{module.detail}</small>
                </span>
                <StatusBadge tone="warning">{module.status}</StatusBadge>
              </div>
            ))}
          </div>
        </Panel>
      </ViewGrid>
    </>
  );
}

function ModuleRoute({ route }: { route: RouteDefinition }) {
  const module = modules.find((entry) => entry.label === route.label);
  return (
    <ViewGrid variant="wide-main">
      <Panel eyebrow="CRM" title={route.title}>
        <div className="crm-domain-panel">
          <span className="crm-domain-panel__icon">{route.icon}</span>
          <dl className="crm-facts">
            <div>
              <dt>Estado</dt>
              <dd>{module?.status ?? "planned"}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{module?.owner ?? "CRM"}</dd>
            </div>
            <div>
              <dt>Contrato</dt>
              <dd>ui-contract-v0</dd>
            </div>
          </dl>
        </div>
      </Panel>

      <Panel eyebrow="Siguiente" title="Contrato de datos">
        <dl className="crm-facts">
          <div>
            <dt>Lectura</dt>
            <dd>pendiente</dd>
          </div>
          <div>
            <dt>Comandos</dt>
            <dd>bloqueados hasta validacion</dd>
          </div>
          <div>
            <dt>Auditoria</dt>
            <dd>requerida para mutaciones</dd>
          </div>
        </dl>
      </Panel>
    </ViewGrid>
  );
}

function PlatformRoute() {
  return (
    <Panel eyebrow="Plataforma" title="Contratos con servicios Pyrosa">
      <div className="crm-service-grid">
        {platformServices.map((service) => (
          <article className="crm-service-row" key={service.name}>
            {service.icon}
            <div>
              <h3>{service.name}</h3>
              <p className="crm-mono">{service.service}</p>
              <p>{service.owns}</p>
            </div>
            <StatusBadge tone="info">{service.status}</StatusBadge>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function BrandRoute({
  brandLogoReady,
  brandLogoUrl,
  setBrandLogoReady
}: {
  brandLogoReady: boolean;
  brandLogoUrl: string;
  setBrandLogoReady: (ready: boolean) => void;
}) {
  return (
    <Panel eyebrow="Marca" title="PYROSA CRM">
      <div className="crm-brand-manager">
        <div className="crm-brand-preview" aria-label="Logo PYROSA CRM">
          {brandLogoReady ? (
            <img alt="" src={brandLogoUrl} onError={() => setBrandLogoReady(false)} />
          ) : (
            <span>PC</span>
          )}
        </div>
        <dl className="crm-facts">
          <div>
            <dt>Asset</dt>
            <dd>/public/assets/brand/crm-logo.png</dd>
          </div>
          <div>
            <dt>Fuente</dt>
            <dd>ui/public/public/assets/brand/crm-logo.png</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>Activo en el shell</dd>
          </div>
        </dl>
      </div>
    </Panel>
  );
}

function RuntimeRoute({
  bootstrap,
  displayEmail,
  displayName
}: {
  bootstrap: BootstrapResponse | null;
  displayEmail: string;
  displayName: string;
}) {
  return (
    <ViewGrid variant="balanced">
      <Panel eyebrow="Sesion" title="Identidad delegada">
        <div className="crm-user-card">
          <UserRound aria-hidden="true" />
          <span>
            <strong>{displayName}</strong>
            <small>{displayEmail}</small>
          </span>
          <StatusBadge tone="success">active</StatusBadge>
        </div>
      </Panel>

      <Panel eyebrow="Runtime" title="Node/TypeScript">
        <dl className="crm-facts">
          <div>
            <dt>Health</dt>
            <dd>/__pyrosa_crm_health</dd>
          </div>
          <div>
            <dt>DB demo</dt>
            <dd>app_pyrosa_democrm</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{bootstrap?.app?.version ?? "v2606"}</dd>
          </div>
        </dl>
      </Panel>
    </ViewGrid>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
