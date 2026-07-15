import React from "react";
import {
  Activity,
  Bell,
  Building2,
  Database,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  Settings,
  Target,
  UsersRound
} from "lucide-react";
import type { SidebarItem } from "@pyrosa/ui";

export type CrmRouteId =
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

export type CrmRouteDefinition = {
  badge: string;
  description: string;
  groupId: "gestion" | "relacion" | "operacion" | "gobierno" | "runtime";
  groupLabel: "Gestion" | "Relacion" | "Operacion" | "Gobierno" | "Runtime";
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
    badge: "Overview",
    description: "Lectura ejecutiva de relacion, pipeline, actividad, reportes y gobierno CRM.",
    groupId: "gestion",
    groupLabel: "Gestion",
    groupOrder: 1,
    hash: "dashboard",
    icon: <LayoutDashboard aria-hidden="true" />,
    id: "dashboard",
    itemOrder: 1,
    keywords: ["inicio", "overview", "resumen", "indicadores"],
    label: "Dashboard",
    title: "Overview CRM"
  },
  {
    badge: "RO",
    description: "Cuentas y organizaciones comerciales disponibles en lectura contract-first.",
    groupId: "relacion",
    groupLabel: "Relacion",
    groupOrder: 2,
    hash: "cuentas",
    icon: <Building2 aria-hidden="true" />,
    id: "cuentas",
    itemOrder: 1,
    keywords: ["cuentas", "organizaciones", "clientes", "empresas"],
    label: "Cuentas",
    title: "Cuentas"
  },
  {
    badge: "RO",
    description: "Contactos, roles y preferencias comerciales en modo de consulta.",
    groupId: "relacion",
    groupLabel: "Relacion",
    groupOrder: 2,
    hash: "contactos",
    icon: <UsersRound aria-hidden="true" />,
    id: "contactos",
    itemOrder: 2,
    keywords: ["contactos", "personas", "roles", "preferencias"],
    label: "Contactos",
    title: "Contactos"
  },
  {
    badge: "RO",
    description: "Pipeline, etapas, propuestas y probabilidad comercial en lectura.",
    groupId: "relacion",
    groupLabel: "Relacion",
    groupOrder: 2,
    hash: "oportunidades",
    icon: <Target aria-hidden="true" />,
    id: "oportunidades",
    itemOrder: 3,
    keywords: ["oportunidades", "pipeline", "forecast", "etapas"],
    label: "Oportunidades",
    title: "Oportunidades"
  },
  {
    badge: "RO",
    description: "Seguimientos, tareas y proximas acciones de la operacion comercial.",
    groupId: "operacion",
    groupLabel: "Operacion",
    groupOrder: 3,
    hash: "actividades",
    icon: <Bell aria-hidden="true" />,
    id: "actividades",
    itemOrder: 1,
    keywords: ["actividades", "agenda", "tareas", "seguimientos"],
    label: "Actividades",
    title: "Actividades"
  },
  {
    badge: "RO",
    description: "Lecturas comerciales y tableros conectables a contratos CRM.",
    groupId: "operacion",
    groupLabel: "Operacion",
    groupOrder: 3,
    hash: "reportes",
    icon: <FileText aria-hidden="true" />,
    id: "reportes",
    itemOrder: 2,
    keywords: ["reportes", "analitica", "forecast", "tableros"],
    label: "Reportes",
    title: "Reportes"
  },
  {
    badge: "Demo",
    description: "Parametros, integraciones y preferencias del tenant sin autoridad IAM local.",
    groupId: "gobierno",
    groupLabel: "Gobierno",
    groupOrder: 4,
    hash: "configuracion",
    icon: <Settings aria-hidden="true" />,
    id: "configuracion",
    itemOrder: 1,
    keywords: ["configuracion", "preferencias", "tenant", "integraciones"],
    label: "Configuracion",
    title: "Configuracion"
  },
  {
    badge: "Externo",
    description: "Servicios Pyrosa consumidos por DemoCRM y sus fronteras de ownership.",
    groupId: "gobierno",
    groupLabel: "Gobierno",
    groupOrder: 4,
    hash: "plataforma",
    icon: <Link2 aria-hidden="true" />,
    id: "plataforma",
    itemOrder: 2,
    keywords: ["platform", "iam", "accounts", "servicios", "ownership"],
    label: "Plataforma",
    title: "Servicios plataforma"
  },
  {
    badge: "Demo",
    description: "Identidad visual y assets propios de DemoCRM.",
    groupId: "gobierno",
    groupLabel: "Gobierno",
    groupOrder: 4,
    hash: "marca",
    icon: <ImageIcon aria-hidden="true" />,
    id: "marca",
    itemOrder: 3,
    keywords: ["marca", "logo", "identidad", "assets"],
    label: "Marca",
    title: "Marca CRM"
  },
  {
    badge: "Live",
    description: "Sesion delegada, runtime y limites tecnicos de la aplicacion.",
    groupId: "runtime",
    groupLabel: "Runtime",
    groupOrder: 5,
    hash: "runtime",
    icon: <Activity aria-hidden="true" />,
    id: "runtime",
    itemOrder: 1,
    keywords: ["runtime", "health", "sesion", "version", "base de datos"],
    label: "Runtime",
    title: "Runtime"
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
  return routeIdByHash.get(hash.replace(/^#/, "")) ?? "dashboard";
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
    badge: route.badge,
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
