import React from "react";
import { createRoot } from "react-dom/client";
import {
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  Database,
  DollarSign,
  Eye,
  FileText,
  Gauge,
  Link2,
  ListChecks,
  LogOut,
  MonitorSmartphone,
  Search,
  Settings,
  ShieldCheck,
  Target,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import {
  Button,
  DataTable,
  DataTableInline,
  DetailDrawer,
  EmptyState,
  EntityCell,
  FilterPanel,
  IconButton,
  MetricCard,
  MetricGrid,
  Panel,
  SelectField,
  StatusBadge,
  StatusStrip,
  Tabs,
  TableActionGroup,
  UserDrawer,
  ViewNotice,
  ViewGrid
} from "@pyrosa/ui";
import type { DataTableColumn, NavigationRoute } from "@pyrosa/ui";
import { WorkspaceLayout } from "@pyrosa/ui-layouts";
import { BusinessOpsShellTemplate } from "@pyrosa/ui-templates";
import { createThemeCssVariables, pyrosaBaseThemeManifest } from "@pyrosa/ui-theme";
import type { PyrosaThemeMode } from "@pyrosa/ui-theme";
import {
  createCrmSidebarItems,
  resolveCrmRouteId,
  routeById,
  routeDefinitions
} from "./routeRegistry";
import type { CrmRouteId } from "./routeRegistry";
import "@pyrosa/ui/styles.css";
import "@pyrosa/ui-layouts/styles.css";
import "@pyrosa/ui-templates/styles.css";
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

type RecordAction = {
  description: string;
  endpoint: string;
  id: string;
  label: string;
  method: "GET";
  mutates: false;
};

type ActionPreview = {
  action: string;
  description: string;
  endpoint: string;
  method: string;
  mutates: boolean;
  recordId: string;
  recordTitle: string;
  scope: string;
  status: string;
  validation: string[];
};

type ActionPreviewResponse = {
  ok?: boolean;
  preview?: ActionPreview;
};

type ModuleCard = {
  detail: string;
  icon?: React.ReactNode;
  key: string;
  label: string;
  owner?: string;
  status: string;
};

type PlatformService = {
  icon?: React.ReactNode;
  name: string;
  owns: string;
  service: string;
  status: string;
};

type WorkbenchRouteId = Exclude<CrmRouteId, "dashboard" | "plataforma" | "marca" | "runtime">;
type CrmShellRoute = NavigationRoute<CrmRouteId>;
type OpenDrawer = "alerts" | "user" | null;

type CrmRecord = {
  actions?: RecordAction[];
  description: string;
  details: Array<{ label: string; value: string }>;
  id: string;
  kind: string;
  metric: string;
  owner: string;
  routeId: WorkbenchRouteId;
  segment: string;
  source: string;
  status: string;
  title: string;
};

type CrmRouteConfig = {
  description: string;
  emptyMessage: string;
  eyebrow: string;
  icon: React.ReactNode;
  id: WorkbenchRouteId;
  rows: CrmRecord[];
  tabs: Array<{ id: string; label: string }>;
  title: string;
};

type DomainContracts = {
  actionCatalog: string[];
  app: {
    branch?: string;
    version?: string;
  };
  contractVersion: string;
  modules: ModuleCard[];
  platformServices: PlatformService[];
  sessionContext?: {
    role?: string;
    status?: string;
    userId?: number;
  };
  workbench: Partial<Record<WorkbenchRouteId, Omit<CrmRouteConfig, "icon">>>;
};

type ContractsResponse = {
  contracts?: DomainContracts;
  ok?: boolean;
};

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

const statusOptions = [
  { label: "Todos", value: "all" },
  { label: "Scaffold", value: "scaffold" },
  { label: "Review", value: "review" },
  { label: "Planned", value: "planned" },
  { label: "External", value: "external" }
];

const workbenchRoutes: Record<WorkbenchRouteId, CrmRouteConfig> = {
  cuentas: {
    description: "Organizaciones comerciales simuladas para validar busqueda, filtros y seleccion de filas.",
    emptyMessage: "No hay cuentas para los filtros actuales.",
    eyebrow: "Inventario CRM",
    icon: <Building2 aria-hidden="true" />,
    id: "cuentas",
    rows: [
      {
        description: "Cuenta enterprise para validar relacion cuenta-contactos-oportunidades.",
        details: [
          { label: "Segmento", value: "Enterprise" },
          { label: "Territorio", value: "Santo Domingo" },
          { label: "Siguiente paso", value: "conectar API de lectura de cuentas" }
        ],
        id: "acct-atlas",
        kind: "Enterprise",
        metric: "USD 86K ARR",
        owner: "Equipo comercial",
        routeId: "cuentas",
        segment: "enterprise",
        source: "ui-contract-v0",
        status: "scaffold",
        title: "Atlas Retail Group"
      },
      {
        description: "Cuenta mid-market con pipeline activo y contacto principal asociado.",
        details: [
          { label: "Segmento", value: "Mid-market" },
          { label: "Territorio", value: "Santiago" },
          { label: "Siguiente paso", value: "normalizar owner y stage desde contrato CRM" }
        ],
        id: "acct-nova",
        kind: "Mid-market",
        metric: "3 oportunidades",
        owner: "Ventas Norte",
        routeId: "cuentas",
        segment: "midmarket",
        source: "ui-contract-v0",
        status: "review",
        title: "Nova Servicios"
      },
      {
        description: "Cuenta partner para probar estados externos y ownership compartido.",
        details: [
          { label: "Segmento", value: "Partner" },
          { label: "Territorio", value: "Regional" },
          { label: "Siguiente paso", value: "definir contrato con Directory para membresias externas" }
        ],
        id: "acct-caribe",
        kind: "Partner",
        metric: "2 cuentas referidas",
        owner: "Canales",
        routeId: "cuentas",
        segment: "partner",
        source: "directory-link",
        status: "external",
        title: "Caribe Partners"
      }
    ],
    tabs: [
      { id: "all", label: "Todas" },
      { id: "enterprise", label: "Enterprise" },
      { id: "midmarket", label: "Mid-market" },
      { id: "partner", label: "Partners" }
    ],
    title: "Cuentas"
  },
  contactos: {
    description: "Personas y roles comerciales con datos contract-first sin persistencia productiva todavia.",
    emptyMessage: "No hay contactos para los filtros actuales.",
    eyebrow: "Inventario CRM",
    icon: <UsersRound aria-hidden="true" />,
    id: "contactos",
    rows: [
      {
        description: "Decision maker asociado a cuenta enterprise.",
        details: [
          { label: "Cuenta", value: "Atlas Retail Group" },
          { label: "Canal", value: "email verificado" },
          { label: "Siguiente paso", value: "modelar preferencias y consentimiento" }
        ],
        id: "contact-maria",
        kind: "Decision maker",
        metric: "AAL2",
        owner: "Ventas Enterprise",
        routeId: "contactos",
        segment: "decisores",
        source: "iam-profile-link",
        status: "scaffold",
        title: "Maria Alvarez"
      },
      {
        description: "Contacto tecnico para validacion de integraciones.",
        details: [
          { label: "Cuenta", value: "Nova Servicios" },
          { label: "Canal", value: "telefono + correo" },
          { label: "Siguiente paso", value: "definir relacion contacto-oportunidad" }
        ],
        id: "contact-luis",
        kind: "Tecnico",
        metric: "2 actividades",
        owner: "Preventa",
        routeId: "contactos",
        segment: "tecnicos",
        source: "ui-contract-v0",
        status: "review",
        title: "Luis Batista"
      },
      {
        description: "Representante de canal para probar contacto externo.",
        details: [
          { label: "Cuenta", value: "Caribe Partners" },
          { label: "Canal", value: "Directory external" },
          { label: "Siguiente paso", value: "conectar fuente Directory/Accounts si aplica" }
        ],
        id: "contact-ana",
        kind: "Partner",
        metric: "4 referidos",
        owner: "Canales",
        routeId: "contactos",
        segment: "partners",
        source: "directory-link",
        status: "external",
        title: "Ana Rosario"
      }
    ],
    tabs: [
      { id: "all", label: "Todos" },
      { id: "decisores", label: "Decisores" },
      { id: "tecnicos", label: "Tecnicos" },
      { id: "partners", label: "Partners" }
    ],
    title: "Contactos"
  },
  oportunidades: {
    description: "Pipeline base para validar columnas comerciales, filtros por etapa y detalle lateral.",
    emptyMessage: "No hay oportunidades para los filtros actuales.",
    eyebrow: "Pipeline",
    icon: <Target aria-hidden="true" />,
    id: "oportunidades",
    rows: [
      {
        description: "Renovacion anual con alcance multi-tenant.",
        details: [
          { label: "Cuenta", value: "Atlas Retail Group" },
          { label: "Etapa", value: "Propuesta" },
          { label: "Siguiente paso", value: "contrato de forecast y aprobaciones" }
        ],
        id: "opp-atlas-renewal",
        kind: "Renewal",
        metric: "72% prob.",
        owner: "Ventas Enterprise",
        routeId: "oportunidades",
        segment: "propuesta",
        source: "ui-contract-v0",
        status: "scaffold",
        title: "Atlas renovacion 2026"
      },
      {
        description: "Proyecto de onboarding para nuevo tenant regional.",
        details: [
          { label: "Cuenta", value: "Nova Servicios" },
          { label: "Etapa", value: "Descubrimiento" },
          { label: "Siguiente paso", value: "API de etapas y montos ponderados" }
        ],
        id: "opp-nova-onboarding",
        kind: "New business",
        metric: "USD 24K",
        owner: "Ventas Norte",
        routeId: "oportunidades",
        segment: "descubrimiento",
        source: "ui-contract-v0",
        status: "review",
        title: "Nova onboarding"
      },
      {
        description: "Oportunidad referida por partner en revision comercial.",
        details: [
          { label: "Cuenta", value: "Caribe Partners" },
          { label: "Etapa", value: "Calificacion" },
          { label: "Siguiente paso", value: "definir modelo de comisiones y ownership" }
        ],
        id: "opp-caribe-referral",
        kind: "Referral",
        metric: "USD 11K",
        owner: "Canales",
        routeId: "oportunidades",
        segment: "calificacion",
        source: "directory-link",
        status: "planned",
        title: "Referral Caribe"
      }
    ],
    tabs: [
      { id: "all", label: "Todas" },
      { id: "calificacion", label: "Calificacion" },
      { id: "descubrimiento", label: "Descubrimiento" },
      { id: "propuesta", label: "Propuesta" }
    ],
    title: "Oportunidades"
  },
  actividades: {
    description: "Seguimientos y tareas para probar agenda comercial sin mutaciones reales.",
    emptyMessage: "No hay actividades para los filtros actuales.",
    eyebrow: "Agenda",
    icon: <CalendarClock aria-hidden="true" />,
    id: "actividades",
    rows: [
      {
        description: "Llamada de revision de propuesta con decision maker.",
        details: [
          { label: "Relacionado", value: "Atlas renovacion 2026" },
          { label: "Canal", value: "llamada" },
          { label: "Siguiente paso", value: "crear endpoint read-only de actividades" }
        ],
        id: "act-atlas-call",
        kind: "Llamada",
        metric: "hoy",
        owner: "Ventas Enterprise",
        routeId: "actividades",
        segment: "llamadas",
        source: "ui-contract-v0",
        status: "scaffold",
        title: "Revision Atlas"
      },
      {
        description: "Correo de seguimiento posterior a demo tecnica.",
        details: [
          { label: "Relacionado", value: "Nova onboarding" },
          { label: "Canal", value: "email" },
          { label: "Siguiente paso", value: "integrar notificaciones Directory si aplica" }
        ],
        id: "act-nova-email",
        kind: "Email",
        metric: "24h",
        owner: "Preventa",
        routeId: "actividades",
        segment: "emails",
        source: "directory-notifications",
        status: "external",
        title: "Follow-up Nova"
      },
      {
        description: "Tarea de validacion interna para oportunidad referida.",
        details: [
          { label: "Relacionado", value: "Referral Caribe" },
          { label: "Canal", value: "tarea interna" },
          { label: "Siguiente paso", value: "definir permisos antes de mutaciones" }
        ],
        id: "act-caribe-task",
        kind: "Tarea",
        metric: "pendiente",
        owner: "Canales",
        routeId: "actividades",
        segment: "tareas",
        source: "ui-contract-v0",
        status: "planned",
        title: "Validar partner"
      }
    ],
    tabs: [
      { id: "all", label: "Todas" },
      { id: "llamadas", label: "Llamadas" },
      { id: "emails", label: "Emails" },
      { id: "tareas", label: "Tareas" }
    ],
    title: "Actividades"
  },
  reportes: {
    description: "Lecturas comerciales base para validar tableros antes de conectar consultas productivas.",
    emptyMessage: "No hay reportes para los filtros actuales.",
    eyebrow: "Analitica",
    icon: <Database aria-hidden="true" />,
    id: "reportes",
    rows: [
      {
        description: "Resumen de pipeline ponderado por etapa.",
        details: [
          { label: "Frecuencia", value: "diaria" },
          { label: "Dataset", value: "opportunities" },
          { label: "Siguiente paso", value: "query productiva con snapshot auditable" }
        ],
        id: "report-forecast",
        kind: "Forecast",
        metric: "USD 121K",
        owner: "Direccion comercial",
        routeId: "reportes",
        segment: "pipeline",
        source: "ui-contract-v0",
        status: "planned",
        title: "Forecast ponderado"
      },
      {
        description: "Resumen de actividad por owner comercial.",
        details: [
          { label: "Frecuencia", value: "semanal" },
          { label: "Dataset", value: "activities" },
          { label: "Siguiente paso", value: "definir metrica de completitud" }
        ],
        id: "report-activity",
        kind: "Actividad",
        metric: "7 seguimientos",
        owner: "Operacion comercial",
        routeId: "reportes",
        segment: "actividad",
        source: "ui-contract-v0",
        status: "review",
        title: "Actividad semanal"
      }
    ],
    tabs: [
      { id: "all", label: "Todos" },
      { id: "pipeline", label: "Pipeline" },
      { id: "actividad", label: "Actividad" }
    ],
    title: "Reportes"
  },
  configuracion: {
    description: "Preferencias y fronteras de integracion que aun no realizan cambios mutables.",
    emptyMessage: "No hay configuraciones para los filtros actuales.",
    eyebrow: "Configuracion",
    icon: <Settings aria-hidden="true" />,
    id: "configuracion",
    rows: [
      {
        description: "Parametros de pipeline y etapas visibles.",
        details: [
          { label: "Ambito", value: "tenant demo" },
          { label: "Mutacion", value: "bloqueada" },
          { label: "Siguiente paso", value: "API read-only de preferencias CRM" }
        ],
        id: "cfg-pipeline",
        kind: "Pipeline",
        metric: "3 etapas",
        owner: "Gobierno CRM",
        routeId: "configuracion",
        segment: "pipeline",
        source: "ui-contract-v0",
        status: "scaffold",
        title: "Etapas comerciales"
      },
      {
        description: "Mapa de integraciones externas consumidas por DemoCRM.",
        details: [
          { label: "Ambito", value: "Platform/IAM/Directory" },
          { label: "Mutacion", value: "bloqueada" },
          { label: "Siguiente paso", value: "contrato de estado de conectores" }
        ],
        id: "cfg-integrations",
        kind: "Integraciones",
        metric: "3 servicios",
        owner: "Platform",
        routeId: "configuracion",
        segment: "integraciones",
        source: "platform-contracts",
        status: "external",
        title: "Fronteras Pyrosa"
      }
    ],
    tabs: [
      { id: "all", label: "Todas" },
      { id: "pipeline", label: "Pipeline" },
      { id: "integraciones", label: "Integraciones" }
    ],
    title: "Configuracion"
  }
};

function activeRouteFromLocation(): CrmRouteId {
  if (typeof window === "undefined") {
    return "dashboard";
  }
  return resolveCrmRouteId(window.location.hash);
}

function App() {
  const [session, setSession] = React.useState<ClientSession | null>(null);
  const [bootstrap, setBootstrap] = React.useState<BootstrapResponse | null>(null);
  const [contracts, setContracts] = React.useState<DomainContracts | null>(null);
  const [contractsError, setContractsError] = React.useState<string | null>(null);
  const [actionPreview, setActionPreview] = React.useState<ActionPreview | null>(null);
  const [brandLogoReady, setBrandLogoReady] = React.useState(true);
  const [activeRoute, setActiveRoute] = React.useState<CrmRouteId>(activeRouteFromLocation);
  const [openDrawer, setOpenDrawer] = React.useState<OpenDrawer>(null);
  const [themeMode, setThemeMode] = React.useState<PyrosaThemeMode>(readStoredThemeMode);

  React.useEffect(() => {
    let active = true;

    void Promise.allSettled([
      fetchJson<SessionResponse>("/api/crm/session"),
      fetchJson<BootstrapResponse>("/api/crm/bootstrap"),
      fetchJson<ContractsResponse>("/api/crm/contracts")
    ]).then(([sessionResult, bootstrapResult, contractsResult]) => {
      if (!active) {
        return;
      }
      if (sessionResult.status === "fulfilled" && sessionResult.value?.session) {
        setSession(sessionResult.value.session);
      }
      if (bootstrapResult.status === "fulfilled" && bootstrapResult.value) {
        setBootstrap(bootstrapResult.value);
      }
      if (contractsResult.status === "fulfilled" && contractsResult.value?.contracts) {
        setContracts(contractsResult.value.contracts);
        setContractsError(null);
      } else {
        setContractsError("No se pudo leer el contrato CRM; usando fallback local.");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.dataset.themeMode = themeMode;
    document.documentElement.dataset.themeResolved = themeMode;
    writeStoredThemeMode(themeMode);
  }, [themeMode]);

  React.useEffect(() => {
    if (!openDrawer || typeof document === "undefined") {
      return undefined;
    }

    function closeDrawerOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setOpenDrawer(null);
    }

    document.addEventListener("keydown", closeDrawerOnEscape, true);
    return () => document.removeEventListener("keydown", closeDrawerOnEscape, true);
  }, [openDrawer]);

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
  const branch = contracts?.app.branch ?? bootstrap?.app?.branch ?? "main";
  const version = contracts?.app.version ?? bootstrap?.app?.version ?? "v2606";
  const moduleCards = moduleCardsWithIcons(contracts?.modules ?? modules);
  const platformData = platformServicesWithIcons(contracts?.platformServices ?? platformServices);
  const workbenchData = mergeWorkbenchContracts(contracts);
  const activeRouteDefinition = routeById[activeRoute];
  const themeCss = React.useMemo(
    () => createThemeCssVariables(pyrosaBaseThemeManifest, themeMode),
    [themeMode]
  );
  const mfaLabel = session?.user?.security?.activeMfaMethods
    ? `${session.user.security.activeMfaMethods} MFA`
    : session?.user?.security?.mfaRequired
      ? "MFA requerido"
      : "MFA gestionado";

  function navigateToRoute(routeId: CrmRouteId) {
    const route = routeById[routeId];
    setOpenDrawer(null);
    setActiveRoute(routeId);
    if (typeof window !== "undefined" && window.location.hash !== `#${route.hash}`) {
      window.location.hash = route.hash;
    }
  }

  async function handleActionPreview(scope: string, recordId: string, actionId: string) {
    const params = new URLSearchParams({ action: actionId, record_id: recordId, scope });
    try {
      const payload = await fetchJson<ActionPreviewResponse>(`/api/crm/contracts/action-preview?${params.toString()}`);
      if (payload?.preview) {
        setActionPreview(payload.preview);
        return;
      }
    } catch {
      // The fallback below keeps the UX deterministic if the preview endpoint is temporarily unavailable.
    }
    setActionPreview({
      action: actionId,
      description: "Preview local fallback para accion contract-first.",
      endpoint: `/api/crm/contracts/action-preview?${params.toString()}`,
      method: "GET",
      mutates: false,
      recordId,
      recordTitle: recordId,
      scope,
      status: "fallback-preview",
      validation: ["requiere sesion CRM activa", "no ejecuta escrituras", "endpoint productivo pendiente"]
    });
  }

  const statusByRoute = Object.fromEntries(
    routeDefinitions.map((route) => [
      route.id,
      <StatusBadge tone="info">{routeRecordCount(route.id, platformData, workbenchData)}</StatusBadge>
    ])
  ) as Record<CrmRouteId, React.ReactNode>;
  const navItems = createCrmSidebarItems({
    activeRoute,
    onSelect: navigateToRoute,
    statusByRoute
  });
  const alertCount = Number(Boolean(contractsError)) + Number(Boolean(actionPreview));

  return (
    <>
      <style>{themeCss}</style>
      <BusinessOpsShellTemplate<CrmShellRoute>
        alertsCount={alertCount}
        alertsExpanded={openDrawer === "alerts"}
        alertsLabel="Notificaciones"
        branch={branch}
        brandLogoAlt=""
        brandLogoSrc={brandLogoUrl}
        brandTitle="PYROSA CRM"
        contentScrollPersistKey={`democrm-${activeRoute}`}
        description={activeRouteDefinition.description}
        environment="demo"
        leadingAction={activeRoute === "dashboard" ? false : undefined}
        navigation={navItems}
        navigationBack={
          activeRoute === "dashboard"
            ? undefined
            : {
                activeView: activeRoute,
                onNavigate: (destination) => {
                  if (destination) {
                    navigateToRoute(destination.view);
                  }
                },
                overviewView: "dashboard",
                route: { view: activeRoute }
              }
        }
        onAlertsClick={() => setOpenDrawer((current) => current === "alerts" ? null : "alerts")}
        onThemeToggle={() => setThemeMode((current) => current === "light" ? "dark" : "light")}
        onUserClick={() => setOpenDrawer((current) => current === "user" ? null : "user")}
        sidebarPersistKey="pyrosa-democrm"
        themeMode={themeMode}
        title={activeRouteDefinition.title}
        userExpanded={openDrawer === "user"}
        userLabel="Cuenta"
        version={version}
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
              description: "Idioma, tema y experiencia de autoservicio",
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
              description: "La identidad y la seguridad son autoridad de IAM; DemoCRM solo presenta la sesion delegada.",
              details: [
                { label: "Estado", value: session?.user?.status ?? "delegada" },
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
              description: "Las vistas operativas permanecen read-only hasta que cada mutacion tenga contrato y auditoria.",
              details: [{ label: "Perfil", value: "business-ops" }],
              title: "Alcance DemoCRM"
            },
            {
              description: "La promocion a pyrosa-crm requiere checklist y autorizacion independiente.",
              details: [{ label: "Entorno", value: "demo" }],
              title: "Promocion productiva"
            }
          ]}
          user={{
            avatarLabel: displayName.slice(0, 1).toUpperCase(),
            badges: <StatusBadge tone="warning">DemoCRM</StatusBadge>,
            email: displayEmail,
            name: displayName,
            role: session?.user?.role ?? "Sesion IAM delegada"
          }}
        />

        <DetailDrawer
          closeLabel="Cerrar notificaciones"
          eyebrow="CRM"
          onClose={() => setOpenDrawer(null)}
          open={openDrawer === "alerts"}
          title="Notificaciones"
        >
          <div className="crm-notification-stack">
            {alertCount === 0 ? <EmptyState>No hay notificaciones pendientes.</EmptyState> : null}
            {contractsError ? (
              <ViewNotice
                action={{ label: "Descartar", onClick: () => setContractsError(null) }}
                message={contractsError}
                title="Contrato local"
                tone="warning"
              />
            ) : null}
            {actionPreview ? (
              <ViewNotice
                action={{ label: "Descartar", onClick: () => setActionPreview(null) }}
                message={`${actionPreview.recordTitle}: ${actionPreview.description}`}
                title={`Preview ${actionPreview.action}`}
                tone="info"
              />
            ) : null}
          </div>
        </DetailDrawer>

        <WorkspaceLayout className="crm-workspace">
          <StatusStrip
            items={[
              { icon: <Gauge aria-hidden="true" />, key: "view", label: "Vista", tone: "info", value: activeRouteDefinition.label },
              { icon: <Database aria-hidden="true" />, key: "records", label: "Registros", tone: "success", value: routeRecordCount(activeRoute, platformData, workbenchData) },
              { icon: <ShieldCheck aria-hidden="true" />, key: "security", label: "Seguridad", tone: "info", value: mfaLabel },
              { icon: <CheckCircle2 aria-hidden="true" />, key: "runtime", label: "Runtime", tone: "success", value: version }
            ]}
          />

          {renderRoute({
            actionPreview,
            activeRoute,
            bootstrap,
            brandLogoReady,
            brandLogoUrl,
            displayEmail,
            displayName,
            moduleCards,
            onActionPreview: handleActionPreview,
            platformData,
            setBrandLogoReady,
            setRoute: navigateToRoute,
            workbenchData
          })}
        </WorkspaceLayout>
      </BusinessOpsShellTemplate>
    </>
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
  actionPreview,
  activeRoute,
  bootstrap,
  brandLogoReady,
  brandLogoUrl,
  displayEmail,
  displayName,
  moduleCards,
  onActionPreview,
  platformData,
  setBrandLogoReady,
  setRoute,
  workbenchData
}: {
  actionPreview: ActionPreview | null;
  activeRoute: CrmRouteId;
  bootstrap: BootstrapResponse | null;
  brandLogoReady: boolean;
  brandLogoUrl: string;
  displayEmail: string;
  displayName: string;
  moduleCards: ModuleCard[];
  onActionPreview: (scope: string, recordId: string, actionId: string) => void;
  platformData: PlatformService[];
  setBrandLogoReady: (ready: boolean) => void;
  setRoute: (routeId: CrmRouteId) => void;
  workbenchData: Record<WorkbenchRouteId, CrmRouteConfig>;
}) {
  if (activeRoute === "plataforma") {
    return <PlatformRoute rows={platformData} />;
  }
  if (activeRoute === "marca") {
    return <BrandRoute brandLogoReady={brandLogoReady} brandLogoUrl={brandLogoUrl} setBrandLogoReady={setBrandLogoReady} />;
  }
  if (activeRoute === "runtime") {
    return <RuntimeRoute bootstrap={bootstrap} displayEmail={displayEmail} displayName={displayName} />;
  }
  if (activeRoute === "dashboard") {
    return <DashboardRoute bootstrap={bootstrap} moduleCards={moduleCards} setRoute={setRoute} workbenchData={workbenchData} />;
  }
  return (
    <WorkbenchRoute
      actionPreview={actionPreview}
      config={workbenchData[activeRoute]}
      onActionPreview={onActionPreview}
    />
  );
}

function DashboardRoute({
  bootstrap,
  moduleCards,
  setRoute,
  workbenchData
}: {
  bootstrap: BootstrapResponse | null;
  moduleCards: ModuleCard[];
  setRoute: (routeId: CrmRouteId) => void;
  workbenchData: Record<WorkbenchRouteId, CrmRouteConfig>;
}) {
  const bootstrapModules = bootstrap?.modules?.length ? bootstrap.modules : moduleCards;
  const domainReadings: Array<{
    description: string;
    icon: React.ReactNode;
    label: string;
    metric: string | number;
    routeId: CrmRouteId;
    status: string;
  }> = [
    {
      description: "Cuentas y contactos disponibles en contratos read-only.",
      icon: <UsersRound aria-hidden="true" />,
      label: "Relacion comercial",
      metric: workbenchData.cuentas.rows.length + workbenchData.contactos.rows.length,
      routeId: "cuentas",
      status: "lectura"
    },
    {
      description: "Oportunidades por etapa, monto y probabilidad comercial.",
      icon: <Target aria-hidden="true" />,
      label: "Pipeline",
      metric: workbenchData.oportunidades.rows.length,
      routeId: "oportunidades",
      status: "contract-first"
    },
    {
      description: "Seguimientos y proximas acciones sin mutaciones locales.",
      icon: <CalendarClock aria-hidden="true" />,
      label: "Actividad",
      metric: workbenchData.actividades.rows.length,
      routeId: "actividades",
      status: "read-only"
    },
    {
      description: "Snapshots analiticos preparados para consultas auditables.",
      icon: <FileText aria-hidden="true" />,
      label: "Reportes",
      metric: workbenchData.reportes.rows.length,
      routeId: "reportes",
      status: "planeado"
    },
    {
      description: "Configuracion y fronteras con Platform, IAM y Accounts.",
      icon: <ShieldCheck aria-hidden="true" />,
      label: "Gobierno",
      metric: bootstrapModules.length,
      routeId: "configuracion",
      status: "delegado"
    }
  ];

  return (
    <section className="crm-dashboard" data-dashboard-kind="analytic">
      <MetricGrid aria-label="Score ejecutivo CRM" columns={3} density="comfortable">
        <MetricCard detail="operacion sin escrituras" icon={<CheckCircle2 />} label="Readiness demo" tone="green" value="Read-only" />
        <MetricCard detail="organizaciones visibles" icon={<Building2 />} label="Cuentas" value={workbenchData.cuentas.rows.length} />
        <MetricCard detail="personas relacionadas" icon={<UsersRound />} label="Contactos" value={workbenchData.contactos.rows.length} />
        <MetricCard detail="pipeline contract-first" icon={<DollarSign />} label="Oportunidades" tone="amber" value={workbenchData.oportunidades.rows.length} />
        <MetricCard detail="seguimientos visibles" icon={<CalendarClock />} label="Actividades" value={workbenchData.actividades.rows.length} />
        <MetricCard detail="sesion IAM + PostgreSQL" icon={<Gauge />} label="Runtime" tone="green" value="Activo" />
      </MetricGrid>

      <ViewGrid className="crm-overview-grid" variant="wide-main">
        <Panel
          className="crm-overview-panel"
          description="Cada dominio conduce a su inventario operativo; el overview conserva solo lectura ejecutiva."
          eyebrow="Analitica CRM"
          title="Dominios de lectura"
        >
          <div className="crm-route-grid">
            {domainReadings.map((domain) => (
                <button className="crm-route-tile" key={domain.label} onClick={() => setRoute(domain.routeId)} type="button">
                  {domain.icon}
                  <span>
                    <strong>{domain.label}</strong>
                    <small>{domain.description}</small>
                  </span>
                  <span className="crm-route-tile__metric">
                    <strong>{domain.metric}</strong>
                    <small>{domain.status}</small>
                  </span>
                </button>
              ))}
          </div>
        </Panel>

        <Panel eyebrow="Gobierno" title="Frontera de dominio">
          <div className="crm-module-stack">
            {moduleCards.map((module) => (
              <div className="crm-module-row" key={module.key}>
                {module.icon ?? moduleIcon(module.key)}
                <span>
                  <strong>{module.label}</strong>
                  <small>{module.detail}</small>
                </span>
                <StatusBadge tone={statusTone(module.status)}>{module.status}</StatusBadge>
              </div>
            ))}
          </div>
        </Panel>
      </ViewGrid>
    </section>
  );
}

function RecordDetail({
  actionPreview,
  actions,
  onAction,
  rows
}: {
  actionPreview?: ActionPreview | null;
  actions?: RecordAction[];
  onAction?: (actionId: string) => void;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="crm-detail-stack">
      <dl className="crm-detail-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="crm-readonly-actions">
        {actions?.length && onAction ? <RecordActions actions={actions} onAction={onAction} /> : <StatusBadge tone="info">ui-contract-v0</StatusBadge>}
        <StatusBadge tone="warning">mutaciones bloqueadas</StatusBadge>
      </div>
      {actionPreview ? (
        <div className="crm-action-preview">
          <strong>{actionPreview.status}</strong>
          <span>{actionPreview.validation.join(" · ")}</span>
        </div>
      ) : null}
    </div>
  );
}

function WorkbenchRoute({
  actionPreview,
  config,
  onActionPreview
}: {
  actionPreview: ActionPreview | null;
  config: CrmRouteConfig;
  onActionPreview: (scope: string, recordId: string, actionId: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [tab, setTab] = React.useState(config.tabs[0]?.id ?? "all");
  const [selectedRowId, setSelectedRowId] = React.useState(config.rows[0]?.id ?? "");
  const rows = filteredCrmRows(config.rows, tab, query, status);
  const selectedRow = config.rows.find((row) => row.id === selectedRowId) ?? rows[0] ?? null;
  const hasFilters = Boolean(query.trim()) || status !== "all";

  React.useEffect(() => {
    setQuery("");
    setStatus("all");
    setTab(config.tabs[0]?.id ?? "all");
    setSelectedRowId(config.rows[0]?.id ?? "");
  }, [config]);

  React.useEffect(() => {
    if (selectedRow && rows.some((row) => row.id === selectedRow.id)) {
      return;
    }
    setSelectedRowId(rows[0]?.id ?? "");
  }, [rows, selectedRow]);

  const columns: Array<DataTableColumn<CrmRecord>> = [
    {
      key: "record",
      label: "Elemento",
      render: (row) => (
        <EntityCell
          description={row.description}
          icon={config.icon}
          meta={<DataTableInline>{row.kind}</DataTableInline>}
          title={row.title}
        />
      ),
      width: "34%"
    },
    { key: "owner", label: "Owner", render: (row) => <DataTableInline>{row.owner}</DataTableInline> },
    { key: "metric", label: "Metrica", render: (row) => <DataTableInline strong>{row.metric}</DataTableInline> },
    { key: "source", label: "Fuente", render: (row) => <DataTableInline>{row.source}</DataTableInline> },
    { key: "status", label: "Estado", render: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
    {
      key: "actions",
      kind: "actions",
      label: "Acciones",
      render: (row) => (
        <RecordActions
          actions={recordActions(row)}
          onAction={(actionId) => onActionPreview(row.routeId, row.id, actionId)}
        />
      )
    }
  ];

  return (
    <>
      <FilterPanel
        actions={
          <Button
            disabled={!hasFilters}
            icon={<X aria-hidden="true" />}
            onClick={() => {
              setQuery("");
              setStatus("all");
            }}
            variant="secondary"
          >
            Limpiar
          </Button>
        }
        onEscapeClear={() => {
          setQuery("");
          setStatus("all");
        }}
      >
        <label className="crm-field">
          <span>Buscar</span>
          <span className="crm-search-control">
            <Search aria-hidden="true" />
            <input
              className={`py-input ${query.trim() ? "is-filter-active" : ""}`.trim()}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="nombre, owner, fuente o tipo"
              type="search"
              value={query}
            />
          </span>
        </label>
        <SelectField active={status !== "all"} label="Estado" onValueChange={setStatus} options={statusOptions} value={status} />
      </FilterPanel>

      <ViewGrid className="crm-inventory-layout" variant="wide-main">
        <Panel className="crm-table-panel" description={config.description} eyebrow={config.eyebrow} title={config.title}>
          <Tabs
            activeId={tab}
            ariaLabel={`Inventario ${config.title}`}
            className="crm-tabs"
            onChange={setTab}
            tabs={config.tabs.map((item) => ({
              badge: item.id === "all" ? config.rows.length : config.rows.filter((row) => row.segment === item.id).length,
              id: item.id,
              label: item.label,
              panel: (
                <DataTable<CrmRecord>
                  columns={columns}
                  density="compact"
                  emptyMessage={config.emptyMessage}
                  getRowId={(row) => row.id}
                  onRowClick={(row) => setSelectedRowId(row.id)}
                  onSelectedRowIdChange={setSelectedRowId}
                  rows={rows}
                  scrollPersistenceKey={`democrm-${config.id}-${item.id}`}
                  selectedRowId={selectedRow?.id}
                  selectedRowPersistenceKey={`democrm-${config.id}-${item.id}`}
                  tableMinWidth="820px"
                />
              )
            }))}
          />
        </Panel>

        <Panel className="crm-detail-panel" eyebrow="Detalle" title={selectedRow?.title ?? "Sin seleccion"}>
          {selectedRow ? (
            <RecordDetail
              actionPreview={actionPreview?.recordId === selectedRow.id ? actionPreview : null}
              actions={recordActions(selectedRow)}
              onAction={(actionId) => onActionPreview(selectedRow.routeId, selectedRow.id, actionId)}
              rows={[
                ["Tipo", selectedRow.kind],
                ["Owner", selectedRow.owner],
                ["Fuente", selectedRow.source],
                ["Estado", selectedRow.status],
                ["Descripcion", selectedRow.description],
                ...selectedRow.details.map((item) => [item.label, item.value] as [string, string])
              ]}
            />
          ) : (
            <EmptyState>Selecciona un elemento.</EmptyState>
          )}
        </Panel>
      </ViewGrid>
    </>
  );
}

function PlatformRoute({ rows }: { rows: PlatformService[] }) {
  const columns: Array<DataTableColumn<PlatformService>> = [
    {
      key: "service",
      label: "Servicio",
      render: (row) => <EntityCell description={row.service} icon={row.icon ?? platformIcon(row.service)} title={row.name} />,
      width: "30%"
    },
    { key: "owns", label: "Responsabilidad", render: (row) => <DataTableInline>{row.owns}</DataTableInline> },
    { key: "status", label: "Estado", render: (row) => <StatusBadge tone="info">{row.status}</StatusBadge> }
  ];

  return (
    <Panel
      className="crm-table-panel"
      description="Frontera de servicios consumidos por DemoCRM sin duplicar ownership de Platform, IAM o Accounts."
      eyebrow="Plataforma"
      title="Contratos con servicios Pyrosa"
    >
      <DataTable columns={columns} density="compact" getRowId={(row) => row.service} rows={rows} tableMinWidth="760px" />
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

function RecordActions({
  actions,
  onAction
}: {
  actions: RecordAction[];
  onAction: (actionId: string) => void;
}) {
  if (!actions.length) {
    return <DataTableInline>sin acciones</DataTableInline>;
  }
  return (
    <TableActionGroup>
      {actions.map((action) => (
        <IconButton
          icon={action.id === "prepare" ? <ListChecks aria-hidden="true" /> : <Eye aria-hidden="true" />}
          key={action.id}
          label={action.label}
          onClick={(event) => {
            event.stopPropagation();
            onAction(action.id);
          }}
          title={`${action.label}: ${action.description}`}
          variant="secondary"
        />
      ))}
    </TableActionGroup>
  );
}

function routeRecordCount(
  routeId: CrmRouteId,
  platformData: PlatformService[],
  workbenchData: Record<WorkbenchRouteId, CrmRouteConfig>
) {
  if (routeId === "dashboard") {
    return routeDefinitions.length;
  }
  if (routeId === "plataforma") {
    return platformData.length;
  }
  if (routeId === "marca" || routeId === "runtime") {
    return 1;
  }
  return workbenchData[routeId].rows.length;
}

function mergeWorkbenchContracts(contracts: DomainContracts | null): Record<WorkbenchRouteId, CrmRouteConfig> {
  const routeIds = Object.keys(workbenchRoutes) as WorkbenchRouteId[];
  return Object.fromEntries(
    routeIds.map((routeId) => {
      const fallback = workbenchRoutes[routeId];
      const contract = contracts?.workbench[routeId];
      return [
        routeId,
        {
          ...fallback,
          ...contract,
          icon: fallback.icon,
          rows: contract?.rows ?? fallback.rows,
          tabs: contract?.tabs ?? fallback.tabs
        }
      ];
    })
  ) as Record<WorkbenchRouteId, CrmRouteConfig>;
}

function moduleCardsWithIcons(rows: ModuleCard[]): ModuleCard[] {
  return rows.map((row) => ({
    ...row,
    icon: row.icon ?? moduleIcon(row.key)
  }));
}

function moduleIcon(key: string) {
  if (key.includes("account")) {
    return <Building2 aria-hidden="true" />;
  }
  if (key.includes("contact")) {
    return <UsersRound aria-hidden="true" />;
  }
  if (key.includes("opportunit")) {
    return <Target aria-hidden="true" />;
  }
  if (key.includes("activit")) {
    return <CalendarClock aria-hidden="true" />;
  }
  return <Database aria-hidden="true" />;
}

function platformServicesWithIcons(rows: PlatformService[]): PlatformService[] {
  return rows.map((row) => ({
    ...row,
    icon: row.icon ?? platformIcon(row.service)
  }));
}

function platformIcon(service: string) {
  if (service.includes("platform")) {
    return <Database aria-hidden="true" />;
  }
  if (service.includes("iam")) {
    return <ShieldCheck aria-hidden="true" />;
  }
  if (service.includes("account")) {
    return <UserRound aria-hidden="true" />;
  }
  return <Link2 aria-hidden="true" />;
}

function recordActions(row: CrmRecord): RecordAction[] {
  return row.actions?.length ? row.actions : [readonlyAction(row.routeId, row.id, "inspect"), readonlyAction(row.routeId, row.id, "prepare")];
}

function readonlyAction(scope: string, recordId: string, actionId: "inspect" | "prepare"): RecordAction {
  return {
    description: actionId === "prepare"
      ? "Prepara el comando futuro y devuelve su checklist de validacion."
      : "Devuelve una vista segura del contrato CRM sin mutar datos.",
    endpoint: `/api/crm/contracts/action-preview?scope=${scope}&record_id=${recordId}&action=${actionId}`,
    id: actionId,
    label: actionId === "prepare" ? "Preparar" : "Inspeccionar",
    method: "GET",
    mutates: false
  };
}

function filteredCrmRows(rows: CrmRecord[], tab: string, query: string, status: string) {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    const tabMatches = tab === "all" || row.segment === tab;
    const statusMatches = status === "all" || row.status === status;
    const queryMatches =
      !needle ||
      [row.title, row.description, row.kind, row.owner, row.metric, row.source, row.status]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    return tabMatches && statusMatches && queryMatches;
  });
}

function statusTone(status: string): "neutral" | "success" | "warning" | "info" {
  if (status === "scaffold") {
    return "success";
  }
  if (status === "review" || status === "external") {
    return "warning";
  }
  if (status === "planned") {
    return "info";
  }
  return "neutral";
}

const themeModeStorageKey = "pyrosa-democrm.themeMode.v1";

function readStoredThemeMode(): PyrosaThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.localStorage.getItem(themeModeStorageKey) === "dark" ? "dark" : "light";
}

function writeStoredThemeMode(themeMode: PyrosaThemeMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(themeModeStorageKey, themeMode);
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
