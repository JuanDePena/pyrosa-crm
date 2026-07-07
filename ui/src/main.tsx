import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  Database,
  DollarSign,
  Eye,
  FileText,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  ListChecks,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Target,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import {
  AppShell,
  Button,
  DataTable,
  DataTableInline,
  EmptyState,
  EntityCell,
  FilterPanel,
  IconButton,
  MetricCard,
  MetricGrid,
  Panel,
  SelectField,
  ShellMetaBadge,
  Sidebar,
  StatusBadge,
  StatusStrip,
  Tabs,
  TableActionGroup,
  Topbar,
  ViewNotice,
  ViewGrid
} from "@pyrosa/ui";
import type { DataTableColumn } from "@pyrosa/ui";
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
  const hash = window.location.hash.replace(/^#/, "");
  return routeIdByHash.get(hash) ?? "dashboard";
}

function App() {
  const [session, setSession] = React.useState<ClientSession | null>(null);
  const [bootstrap, setBootstrap] = React.useState<BootstrapResponse | null>(null);
  const [contracts, setContracts] = React.useState<DomainContracts | null>(null);
  const [contractsError, setContractsError] = React.useState<string | null>(null);
  const [actionPreview, setActionPreview] = React.useState<ActionPreview | null>(null);
  const [brandLogoReady, setBrandLogoReady] = React.useState(true);
  const [activeRoute, setActiveRoute] = React.useState<CrmRouteId>(activeRouteFromLocation);

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
  const bootstrapModules = bootstrap?.modules?.length ? bootstrap.modules : moduleCards;
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
    status: <StatusBadge tone="info">{routeRecordCount(route.id, platformData, workbenchData)}</StatusBadge>
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
            { icon: <Database aria-hidden="true" />, key: "records", label: "Registros", tone: "success", value: routeRecordCount(activeRoute, platformData, workbenchData) },
            { icon: <ShieldCheck aria-hidden="true" />, key: "security", label: "Seguridad", tone: "info", value: mfaLabel },
            { icon: <CheckCircle2 aria-hidden="true" />, key: "runtime", label: "Runtime", tone: "success", value: "v2606" }
          ]}
        />

        {contractsError ? (
          <ViewNotice
            action={{ label: "Cerrar", onClick: () => setContractsError(null) }}
            message={contractsError}
            title="Contrato local"
            tone="warning"
          />
        ) : null}

        {actionPreview ? (
          <ViewNotice
            action={{ label: "Cerrar", onClick: () => setActionPreview(null) }}
            message={`${actionPreview.recordTitle}: ${actionPreview.description}`}
            title={`Preview ${actionPreview.action}`}
            tone="info"
          />
        ) : null}

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
  const totalRecords = Object.values(workbenchData).reduce((sum, route) => sum + route.rows.length, 0);
  return (
    <>
      <MetricGrid columns={4} density="comfortable">
        <MetricCard detail="rutas shell" icon={<LayoutDashboard />} label="Vistas" value={routeDefinitions.length} />
        <MetricCard detail="filas contract-first" icon={<Building2 />} label="Registros" tone="green" value={totalRecords} />
        <MetricCard detail="pipeline contract-first" icon={<DollarSign />} label="Forecast" value="121K" />
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
            {moduleCards.map((module) => (
              <div className="crm-module-row" key={module.key}>
                {module.icon ?? moduleIcon(module.key)}
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

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
