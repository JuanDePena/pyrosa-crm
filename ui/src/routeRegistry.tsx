import React from "react";
import {
  Activity,
  Building2,
  CalendarDays,
  FileBarChart,
  LayoutDashboard,
  Settings,
  Target,
  Tickets,
  UsersRound
} from "lucide-react";
import type { SidebarItem } from "@pyrosa/ui";

export type CrmRouteId =
  | "dashboard"
  | "cuentas"
  | "contactos"
  | "casos"
  | "actividades"
  | "agenda"
  | "oportunidades"
  | "reportes"
  | "configuracion";

export type CrmRouteDefinition = {
  description: string;
  groupId: "gestion" | "relacion" | "operacion" | "analitica" | "gobierno";
  groupLabel: "Gestion" | "Relacion" | "Operacion" | "Analitica" | "Gobierno";
  groupOrder: number;
  hash: string;
  icon: React.ReactNode;
  id: CrmRouteId;
  itemOrder: number;
  keywords: string[];
  label: string;
  title: string;
};

export const routeDefinitions: CrmRouteDefinition[] = [
  {
    description: "Lectura ejecutiva de la operacion, relacion, pipeline, SLA y agenda CRM.",
    groupId: "gestion",
    groupLabel: "Gestion",
    groupOrder: 1,
    hash: "dashboard",
    icon: <LayoutDashboard aria-hidden="true" />,
    id: "dashboard",
    itemOrder: 1,
    keywords: ["inicio", "overview", "resumen", "metricas", "indicadores"],
    label: "Dashboard",
    title: "Overview CRM"
  },
  {
    description: "Organizaciones y relaciones comerciales administradas por CRM.",
    groupId: "relacion",
    groupLabel: "Relacion",
    groupOrder: 2,
    hash: "cuentas",
    icon: <Building2 aria-hidden="true" />,
    id: "cuentas",
    itemOrder: 1,
    keywords: ["cuentas", "organizaciones", "clientes", "clinicas", "empresas"],
    label: "Cuentas",
    title: "Cuentas"
  },
  {
    description: "Personas, roles, canales, preferencias y consentimientos de relacion.",
    groupId: "relacion",
    groupLabel: "Relacion",
    groupOrder: 2,
    hash: "contactos",
    icon: <UsersRound aria-hidden="true" />,
    id: "contactos",
    itemOrder: 2,
    keywords: ["contactos", "personas", "roles", "medicos", "pacientes"],
    label: "Contactos",
    title: "Contactos"
  },
  {
    description: "Solicitudes de servicio, colas, asignacion, SLA y resolucion.",
    groupId: "operacion",
    groupLabel: "Operacion",
    groupOrder: 3,
    hash: "casos",
    icon: <Tickets aria-hidden="true" />,
    id: "casos",
    itemOrder: 1,
    keywords: ["casos", "seguimientos", "colas", "sla", "elegibilidad", "autorizacion"],
    label: "Casos",
    title: "Casos"
  },
  {
    description: "Llamadas, tareas, notas y seguimientos auditables.",
    groupId: "operacion",
    groupLabel: "Operacion",
    groupOrder: 3,
    hash: "actividades",
    icon: <Activity aria-hidden="true" />,
    id: "actividades",
    itemOrder: 2,
    keywords: ["actividades", "llamadas", "tareas", "notas", "seguimientos"],
    label: "Actividades",
    title: "Actividades"
  },
  {
    description: "Coordinacion de citas, participantes, recursos y excepciones de agenda.",
    groupId: "operacion",
    groupLabel: "Operacion",
    groupOrder: 3,
    hash: "agenda",
    icon: <CalendarDays aria-hidden="true" />,
    id: "agenda",
    itemOrder: 3,
    keywords: ["agenda", "citas", "calendario", "recursos", "confirmacion"],
    label: "Agenda",
    title: "Agenda"
  },
  {
    description: "Pipeline comercial, etapas, forecast y proximas acciones.",
    groupId: "relacion",
    groupLabel: "Relacion",
    groupOrder: 2,
    hash: "oportunidades",
    icon: <Target aria-hidden="true" />,
    id: "oportunidades",
    itemOrder: 3,
    keywords: ["oportunidades", "pipeline", "forecast", "etapas", "ventas"],
    label: "Oportunidades",
    title: "Oportunidades"
  },
  {
    description: "Catalogo de reportes, corridas auditadas y exportaciones autorizadas.",
    groupId: "analitica",
    groupLabel: "Analitica",
    groupOrder: 4,
    hash: "reportes",
    icon: <FileBarChart aria-hidden="true" />,
    id: "reportes",
    itemOrder: 1,
    keywords: ["reportes", "analitica", "exportaciones", "metricas", "vistas"],
    label: "Reportes",
    title: "Reportes"
  },
  {
    description: "Perfil efectivo, vocabulario, SLA, metricas e integraciones declarativas.",
    groupId: "gobierno",
    groupLabel: "Gobierno",
    groupOrder: 5,
    hash: "configuracion",
    icon: <Settings aria-hidden="true" />,
    id: "configuracion",
    itemOrder: 1,
    keywords: ["configuracion", "perfil", "tenant", "integraciones", "sla", "voix"],
    label: "Configuracion",
    title: "Configuracion CRM"
  }
];

export const routeById = Object.fromEntries(
  routeDefinitions.map((route) => [route.id, route])
) as Record<CrmRouteId, CrmRouteDefinition>;

const routeIdByHash = new Map<string, CrmRouteId>([
  ["inicio", "dashboard"],
  ["modulos", "dashboard"],
  ...routeDefinitions.map((route) => [route.hash, route.id] as const)
]);

export function resolveCrmRouteId(hash: string): CrmRouteId {
  const routeHash = hash.replace(/^#/, "").split(/[/?]/u, 1)[0] ?? "";
  return routeIdByHash.get(routeHash) ?? "dashboard";
}

export function createCrmSidebarItems({
  activeRoute,
  onSelect,
  statusByRoute
}: {
  activeRoute: CrmRouteId;
  onSelect: (routeId: CrmRouteId) => void;
  statusByRoute?: Partial<Record<CrmRouteId, React.ReactNode>>;
}): SidebarItem[] {
  return routeDefinitions.map((route) => ({
    active: activeRoute === route.id,
    groupId: route.groupId,
    groupLabel: route.groupLabel,
    groupOrder: route.groupOrder,
    href: `#${route.hash}`,
    icon: route.icon,
    id: route.id,
    itemOrder: route.itemOrder,
    keywords: route.keywords,
    label: route.label,
    onSelect: () => onSelect(route.id),
    status: statusByRoute?.[route.id]
  }));
}
