import type { CrmSession } from "./auth.js";
import type { CrmServerConfig } from "./config.js";

type ContractAction = {
  description: string;
  endpoint: string;
  id: string;
  label: string;
  method: "GET";
  mutates: false;
};

type WorkbenchRouteId = "cuentas" | "contactos" | "oportunidades" | "actividades" | "reportes" | "configuracion";

type CrmRecord = {
  actions: ContractAction[];
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

type WorkbenchContract = {
  description: string;
  emptyMessage: string;
  eyebrow: string;
  rows: CrmRecord[];
  tabs: Array<{ id: string; label: string }>;
  title: string;
};

type PlatformServiceContract = {
  name: string;
  owns: string;
  service: string;
  status: string;
};

type ModuleContract = {
  detail: string;
  key: string;
  label: string;
  status: string;
};

const contractVersion = "democrm-contract-v0.4";

const readonlyActions = {
  inspect: (scope: string, id: string): ContractAction => ({
    description: "Devuelve una vista segura del contrato CRM sin mutar datos.",
    endpoint: `/api/crm/contracts/action-preview?scope=${scope}&record_id=${id}&action=inspect`,
    id: "inspect",
    label: "Inspeccionar",
    method: "GET",
    mutates: false
  }),
  prepare: (scope: string, id: string): ContractAction => ({
    description: "Prepara el comando futuro y devuelve su checklist de validacion.",
    endpoint: `/api/crm/contracts/action-preview?scope=${scope}&record_id=${id}&action=prepare`,
    id: "prepare",
    label: "Preparar",
    method: "GET",
    mutates: false
  })
};

const workbench: Record<WorkbenchRouteId, WorkbenchContract> = {
  cuentas: {
    description: "Organizaciones comerciales simuladas para validar busqueda, filtros y seleccion de filas.",
    emptyMessage: "No hay cuentas para los filtros actuales.",
    eyebrow: "Inventario CRM",
    rows: [
      crmRecord("cuentas", "acct-atlas", "Atlas Retail Group", "Enterprise", "Equipo comercial", "scaffold", "USD 86K ARR", "enterprise", "Cuenta enterprise para validar relacion cuenta-contactos-oportunidades.", [
        ["Segmento", "Enterprise"],
        ["Territorio", "Santo Domingo"],
        ["Siguiente paso", "conectar API de lectura de cuentas"]
      ]),
      crmRecord("cuentas", "acct-nova", "Nova Servicios", "Mid-market", "Ventas Norte", "review", "3 oportunidades", "midmarket", "Cuenta mid-market con pipeline activo y contacto principal asociado.", [
        ["Segmento", "Mid-market"],
        ["Territorio", "Santiago"],
        ["Siguiente paso", "normalizar owner y stage desde contrato CRM"]
      ]),
      crmRecord("cuentas", "acct-caribe", "Caribe Partners", "Partner", "Canales", "external", "2 cuentas referidas", "partner", "Cuenta partner para probar estados externos y ownership compartido.", [
        ["Segmento", "Partner"],
        ["Territorio", "Regional"],
        ["Siguiente paso", "definir contrato con Directory para membresias externas"]
      ])
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
    rows: [
      crmRecord("contactos", "contact-maria", "Maria Alvarez", "Decision maker", "Ventas Enterprise", "scaffold", "AAL2", "decisores", "Decision maker asociado a cuenta enterprise.", [
        ["Cuenta", "Atlas Retail Group"],
        ["Canal", "email verificado"],
        ["Siguiente paso", "modelar preferencias y consentimiento"]
      ]),
      crmRecord("contactos", "contact-luis", "Luis Batista", "Tecnico", "Preventa", "review", "2 actividades", "tecnicos", "Contacto tecnico para validacion de integraciones.", [
        ["Cuenta", "Nova Servicios"],
        ["Canal", "telefono + correo"],
        ["Siguiente paso", "definir relacion contacto-oportunidad"]
      ]),
      crmRecord("contactos", "contact-ana", "Ana Rosario", "Partner", "Canales", "external", "4 referidos", "partners", "Representante de canal para probar contacto externo.", [
        ["Cuenta", "Caribe Partners"],
        ["Canal", "Directory external"],
        ["Siguiente paso", "conectar fuente Directory/Accounts si aplica"]
      ])
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
    rows: [
      crmRecord("oportunidades", "opp-atlas-renewal", "Atlas renovacion 2026", "Renewal", "Ventas Enterprise", "scaffold", "72% prob.", "propuesta", "Renovacion anual con alcance multi-tenant.", [
        ["Cuenta", "Atlas Retail Group"],
        ["Etapa", "Propuesta"],
        ["Siguiente paso", "contrato de forecast y aprobaciones"]
      ]),
      crmRecord("oportunidades", "opp-nova-onboarding", "Nova onboarding", "New business", "Ventas Norte", "review", "USD 24K", "descubrimiento", "Proyecto de onboarding para nuevo tenant regional.", [
        ["Cuenta", "Nova Servicios"],
        ["Etapa", "Descubrimiento"],
        ["Siguiente paso", "API de etapas y montos ponderados"]
      ]),
      crmRecord("oportunidades", "opp-caribe-referral", "Referral Caribe", "Referral", "Canales", "planned", "USD 11K", "calificacion", "Oportunidad referida por partner en revision comercial.", [
        ["Cuenta", "Caribe Partners"],
        ["Etapa", "Calificacion"],
        ["Siguiente paso", "definir modelo de comisiones y ownership"]
      ])
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
    rows: [
      crmRecord("actividades", "act-atlas-call", "Revision Atlas", "Llamada", "Ventas Enterprise", "scaffold", "hoy", "llamadas", "Llamada de revision de propuesta con decision maker.", [
        ["Relacionado", "Atlas renovacion 2026"],
        ["Canal", "llamada"],
        ["Siguiente paso", "crear endpoint read-only de actividades"]
      ]),
      crmRecord("actividades", "act-nova-email", "Follow-up Nova", "Email", "Preventa", "external", "24h", "emails", "Correo de seguimiento posterior a demo tecnica.", [
        ["Relacionado", "Nova onboarding"],
        ["Canal", "email"],
        ["Siguiente paso", "integrar notificaciones Directory si aplica"]
      ]),
      crmRecord("actividades", "act-caribe-task", "Validar partner", "Tarea", "Canales", "planned", "pendiente", "tareas", "Tarea de validacion interna para oportunidad referida.", [
        ["Relacionado", "Referral Caribe"],
        ["Canal", "tarea interna"],
        ["Siguiente paso", "definir permisos antes de mutaciones"]
      ])
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
    rows: [
      crmRecord("reportes", "report-forecast", "Forecast ponderado", "Forecast", "Direccion comercial", "planned", "USD 121K", "pipeline", "Resumen de pipeline ponderado por etapa.", [
        ["Frecuencia", "diaria"],
        ["Dataset", "opportunities"],
        ["Siguiente paso", "query productiva con snapshot auditable"]
      ]),
      crmRecord("reportes", "report-activity", "Actividad semanal", "Actividad", "Operacion comercial", "review", "7 seguimientos", "actividad", "Resumen de actividad por owner comercial.", [
        ["Frecuencia", "semanal"],
        ["Dataset", "activities"],
        ["Siguiente paso", "definir metrica de completitud"]
      ])
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
    rows: [
      crmRecord("configuracion", "cfg-pipeline", "Etapas comerciales", "Pipeline", "Gobierno CRM", "scaffold", "3 etapas", "pipeline", "Parametros de pipeline y etapas visibles.", [
        ["Ambito", "tenant demo"],
        ["Mutacion", "bloqueada"],
        ["Siguiente paso", "API read-only de preferencias CRM"]
      ]),
      crmRecord("configuracion", "cfg-integrations", "Fronteras Pyrosa", "Integraciones", "Platform", "external", "3 servicios", "integraciones", "Mapa de integraciones externas consumidas por DemoCRM.", [
        ["Ambito", "Platform/IAM/Directory"],
        ["Mutacion", "bloqueada"],
        ["Siguiente paso", "contrato de estado de conectores"]
      ])
    ],
    tabs: [
      { id: "all", label: "Todas" },
      { id: "pipeline", label: "Pipeline" },
      { id: "integraciones", label: "Integraciones" }
    ],
    title: "Configuracion"
  }
};

const modules: ModuleContract[] = [
  { detail: "Organizaciones comerciales, segmentos y relaciones activas.", key: "accounts", label: "Cuentas", status: "scaffold" },
  { detail: "Personas, roles, preferencias y datos de relacion.", key: "contacts", label: "Contactos", status: "scaffold" },
  { detail: "Pipeline, etapas, propuestas y probabilidad comercial.", key: "opportunities", label: "Oportunidades", status: "scaffold" },
  { detail: "Seguimientos, tareas, recordatorios y proximas acciones.", key: "activities", label: "Actividades", status: "scaffold" }
];

export function buildCrmContracts(config: CrmServerConfig, session: CrmSession) {
  return {
    ok: true,
    contracts: {
      actionCatalog: ["inspect", "prepare"],
      app: {
        branch: config.branch,
        version: config.version
      },
      contractVersion,
      modules,
      platformServices: buildPlatformServices(config),
      sessionContext: {
        role: session.user.role,
        status: session.user.status,
        userId: session.user.id
      },
      workbench
    }
  };
}

export function buildActionPreview(scope: string, recordId: string, actionId: string) {
  const record = findRecord(scope, recordId);
  if (!record) {
    return null;
  }
  const action = record.actions.find((entry) => entry.id === actionId);
  if (!action) {
    return null;
  }
  return {
    ok: true,
    preview: {
      action: action.id,
      description: action.description,
      endpoint: action.endpoint,
      method: action.method,
      mutates: action.mutates,
      recordId,
      recordTitle: record.title,
      scope,
      status: "preview-only",
      validation: [
        "requiere sesion CRM activa",
        "no ejecuta DDL ni escrituras",
        "pendiente de endpoint productivo"
      ]
    }
  };
}

function crmRecord(
  routeId: WorkbenchRouteId,
  id: string,
  title: string,
  kind: string,
  owner: string,
  status: string,
  metric: string,
  segment: string,
  description: string,
  details: Array<[string, string]>
): CrmRecord {
  return {
    actions: [readonlyActions.inspect(routeId, id), readonlyActions.prepare(routeId, id)],
    description,
    details: [
      { label: "Owner", value: owner },
      { label: "Estado", value: status },
      { label: "Metrica", value: metric },
      ...details.map(([label, value]) => ({ label, value }))
    ],
    id,
    kind,
    metric,
    owner,
    routeId,
    segment,
    source: owner === "Platform" || owner === "Canales" ? "platform-contracts" : "api-contract-v0",
    status,
    title
  };
}

function buildPlatformServices(config: CrmServerConfig): PlatformServiceContract[] {
  return [
    {
      name: "Platform",
      owns: "Catalogo de apps, gobierno visual, contratos runtime y estado operativo",
      service: "pyrosa-platform",
      status: config.platformInternalBaseUrl ? "Contrato externo" : "Pendiente"
    },
    {
      name: "IAM",
      owns: "Autenticacion, MFA, tickets ui-auth, sesiones globales y politicas de acceso",
      service: "pyrosa-iam",
      status: "Auth delegada"
    },
    {
      name: "Accounts",
      owns: "Centro de cuenta, perfil de usuario, preferencias y autoservicio",
      service: "pyrosa-accounts",
      status: config.accountsInternalBaseUrl ? "Contrato externo" : "Pendiente"
    }
  ];
}

function findRecord(scope: string, recordId: string): CrmRecord | null {
  if (!isWorkbenchRouteId(scope)) {
    return null;
  }
  return workbench[scope].rows.find((record) => record.id === recordId) ?? null;
}

function isWorkbenchRouteId(value: string): value is WorkbenchRouteId {
  return ["cuentas", "contactos", "oportunidades", "actividades", "reportes", "configuracion"].includes(value);
}
