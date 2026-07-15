import React from "react";
import {
  Activity,
  Building2,
  CalendarDays,
  FileBarChart,
  Target,
  Tickets,
  UsersRound
} from "lucide-react";
import type { ResourceRouteId } from "./crmTypes";

export type ResourceField = {
  format?: "currency-minor" | "date-time" | "list" | "number" | "status" | "text";
  label: string;
  name: string;
};

export type EditorField = ResourceField & {
  input: "datetime-local" | "number" | "select" | "text" | "textarea";
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
};

export type ResourceConfig = {
  description: string;
  editorFields: EditorField[];
  endpoint: string;
  eyebrow: string;
  fields: ResourceField[];
  icon: React.ReactNode;
  id: ResourceRouteId;
  readOnly?: boolean;
  searchPlaceholder: string;
  singular: string;
  statusOptions?: Array<{ label: string; value: string }>;
  title: string;
};

const commonStatusOptions = [
  { label: "Activo", value: "active" },
  { label: "Pausado", value: "paused" },
  { label: "Archivado", value: "archived" }
];

const caseStatusOptions = [
  { label: "Nuevo", value: "new" },
  { label: "Clasificado", value: "triaged" },
  { label: "En progreso", value: "in_progress" },
  { label: "Esperando externo", value: "waiting_external" },
  { label: "Resuelto", value: "resolved" },
  { label: "Cerrado", value: "closed" },
  { label: "Reabierto", value: "reopened" },
  { label: "Cancelado", value: "cancelled" }
];

const activityStatusOptions = [
  { label: "Abierta", value: "open" },
  { label: "En progreso", value: "in_progress" },
  { label: "Completada", value: "completed" },
  { label: "Cancelada", value: "cancelled" }
];

const appointmentStatusOptions = [
  { label: "Solicitada", value: "requested" },
  { label: "Programada", value: "scheduled" },
  { label: "Confirmada", value: "confirmed" },
  { label: "Reprogramada", value: "rescheduled" },
  { label: "Cancelada", value: "cancelled" },
  { label: "Completada", value: "completed" },
  { label: "No asistio", value: "no_show" },
  { label: "Fallo de sincronizacion", value: "sync_failed" }
];

export const resourceConfigs: Record<ResourceRouteId, ResourceConfig> = {
  cuentas: {
    description: "Organizaciones y relaciones comerciales del tenant activo.",
    editorFields: [
      { input: "text", label: "Nombre", name: "name", required: true },
      { input: "select", label: "Tipo", name: "type", options: [
        { label: "Organizacion", value: "organization" },
        { label: "Persona", value: "person" },
        { label: "Hogar", value: "household" }
      ], required: true },
      { input: "select", label: "Estado", name: "status", options: commonStatusOptions, required: true },
      { input: "text", label: "Owner", name: "ownerId" },
      { format: "list", input: "text", label: "Etiquetas", name: "tags" },
      { input: "text", label: "Referencia externa", name: "externalRef" }
    ],
    endpoint: "/api/crm/v1/accounts",
    eyebrow: "Relacion",
    fields: [
      { label: "Nombre", name: "name" },
      { label: "Tipo", name: "type" },
      { format: "status", label: "Estado", name: "status" },
      { label: "Owner", name: "ownerId" },
      { format: "list", label: "Etiquetas", name: "tags" },
      { label: "Referencia externa", name: "externalRef" }
    ],
    icon: <Building2 aria-hidden="true" />,
    id: "cuentas",
    searchPlaceholder: "nombre, owner, etiqueta o referencia",
    singular: "cuenta",
    statusOptions: commonStatusOptions,
    title: "Cuentas"
  },
  contactos: {
    description: "Personas y roles de relacion; los atributos sensibles permanecen enmascarados por capability.",
    editorFields: [
      { input: "text", label: "Cuenta relacionada", name: "accountId" },
      { input: "text", label: "Nombre visible", name: "displayName", required: true },
      { input: "text", label: "Rol", name: "role", required: true },
      { input: "select", label: "Estado", name: "status", options: commonStatusOptions, required: true },
      { input: "select", label: "Canal preferido", name: "preferredChannel", options: [
        { label: "Telefono", value: "phone" },
        { label: "Correo", value: "email" },
        { label: "SMS", value: "sms" },
        { label: "Sin preferencia", value: "none" }
      ] },
      { input: "select", label: "Consentimiento", name: "consentStatus", options: [
        { label: "Desconocido", value: "unknown" },
        { label: "Registrado", value: "recorded" },
        { label: "Revocado", value: "revoked" }
      ] }
    ],
    endpoint: "/api/crm/v1/contacts",
    eyebrow: "Relacion",
    fields: [
      { label: "Nombre", name: "displayName" },
      { label: "Rol", name: "role" },
      { format: "status", label: "Estado", name: "status" },
      { label: "Cuenta", name: "accountId" },
      { label: "Canal", name: "preferredChannel" },
      { label: "Consentimiento", name: "consentStatus" }
    ],
    icon: <UsersRound aria-hidden="true" />,
    id: "contactos",
    searchPlaceholder: "nombre visible, rol o cuenta",
    singular: "contacto",
    statusOptions: commonStatusOptions,
    title: "Contactos"
  },
  casos: {
    description: "Solicitudes de servicio con cola, prioridad, owner, SLA y estado estructurado.",
    editorFields: [
      { input: "text", label: "Asunto", name: "subject", required: true },
      { input: "text", label: "Tipo de caso", name: "caseType", required: true },
      { input: "text", label: "Cuenta", name: "accountId" },
      { input: "text", label: "Contacto", name: "contactId" },
      { input: "select", label: "Prioridad", name: "priority", options: [
        { label: "Baja", value: "low" },
        { label: "Normal", value: "normal" },
        { label: "Alta", value: "high" },
        { label: "Urgente", value: "urgent" }
      ], required: true },
      { input: "text", label: "Cola", name: "queueId" },
      { input: "text", label: "Vencimiento SLA (ISO con offset)", name: "slaDueAt" }
    ],
    endpoint: "/api/crm/v1/cases",
    eyebrow: "Operacion",
    fields: [
      { label: "Asunto", name: "subject" },
      { label: "Tipo", name: "caseType" },
      { format: "status", label: "Estado", name: "status" },
      { label: "Prioridad", name: "priority" },
      { label: "Cola", name: "queueId" },
      { label: "Owner", name: "ownerId" },
      { format: "date-time", label: "SLA", name: "slaDueAt" }
    ],
    icon: <Tickets aria-hidden="true" />,
    id: "casos",
    searchPlaceholder: "asunto, cola, owner o codigo",
    singular: "caso",
    statusOptions: caseStatusOptions,
    title: "Casos"
  },
  actividades: {
    description: "Interacciones y proximas acciones enlazadas a recursos CRM.",
    editorFields: [
      { input: "text", label: "Asunto", name: "subject", required: true },
      { input: "select", label: "Tipo", name: "type", options: [
        { label: "Llamada", value: "call" },
        { label: "Tarea", value: "task" },
        { label: "Seguimiento", value: "follow_up" },
        { label: "Correo", value: "email" },
        { label: "Nota", value: "note" }
      ], required: true },
      { input: "text", label: "Caso", name: "caseId" },
      { input: "text", label: "Cuenta", name: "accountId" },
      { input: "text", label: "Contacto", name: "contactId" },
      { input: "text", label: "Owner", name: "ownerId" },
      { input: "text", label: "Vencimiento (ISO con offset)", name: "dueAt" }
    ],
    endpoint: "/api/crm/v1/activities",
    eyebrow: "Operacion",
    fields: [
      { label: "Asunto", name: "subject" },
      { label: "Tipo", name: "type" },
      { format: "status", label: "Estado", name: "status" },
      { label: "Caso", name: "caseId" },
      { label: "Owner", name: "ownerId" },
      { format: "date-time", label: "Vencimiento", name: "dueAt" },
      { label: "Resultado", name: "outcomeCode" }
    ],
    icon: <Activity aria-hidden="true" />,
    id: "actividades",
    searchPlaceholder: "asunto, tipo, owner o recurso relacionado",
    singular: "actividad",
    statusOptions: activityStatusOptions,
    title: "Actividades"
  },
  agenda: {
    description: "Citas operacionales con participantes, recursos, zona horaria y estado de sincronizacion.",
    editorFields: [
      { input: "text", label: "Caso", name: "caseId", required: true },
      { input: "text", label: "Cuenta", name: "accountId" },
      { input: "text", label: "Contacto", name: "contactId" },
      { input: "text", label: "Inicio (ISO con offset)", name: "startAt", required: true },
      { input: "text", label: "Fin (ISO con offset)", name: "endAt", required: true },
      { input: "text", label: "Zona horaria", name: "timezone", required: true },
      { input: "text", label: "Recurso", name: "resourceId" },
      { input: "text", label: "Referencia externa", name: "externalRef" }
    ],
    endpoint: "/api/crm/v1/appointments",
    eyebrow: "Agenda",
    fields: [
      { format: "date-time", label: "Inicio", name: "startAt" },
      { format: "date-time", label: "Fin", name: "endAt" },
      { format: "status", label: "Estado", name: "status" },
      { label: "Contacto", name: "contactId" },
      { label: "Recurso", name: "resourceId" },
      { label: "Zona", name: "timezone" },
      { label: "Referencia externa", name: "externalRef" }
    ],
    icon: <CalendarDays aria-hidden="true" />,
    id: "agenda",
    searchPlaceholder: "contacto, recurso, estado o referencia",
    singular: "cita",
    statusOptions: appointmentStatusOptions,
    title: "Agenda"
  },
  oportunidades: {
    description: "Negocios comerciales separados de los casos operacionales y de pacientes.",
    editorFields: [
      { input: "text", label: "Nombre", name: "name", required: true },
      { input: "text", label: "Cuenta", name: "accountId", required: true },
      { input: "text", label: "Contacto principal", name: "primaryContactId" },
      { input: "text", label: "Pipeline", name: "pipelineId", required: true },
      { input: "text", label: "Etapa", name: "stageId", required: true },
      { format: "currency-minor", input: "number", label: "Monto menor", name: "amountMinor" },
      { input: "text", label: "Moneda", name: "currency" },
      { format: "number", input: "number", label: "Probabilidad", name: "probability" },
      { input: "text", label: "Owner", name: "ownerId" }
    ],
    endpoint: "/api/crm/v1/opportunities",
    eyebrow: "Pipeline",
    fields: [
      { label: "Nombre", name: "name" },
      { format: "status", label: "Estado", name: "status" },
      { label: "Etapa", name: "stageId" },
      { format: "currency-minor", label: "Monto", name: "amountMinor" },
      { label: "Moneda", name: "currency" },
      { format: "number", label: "Probabilidad", name: "probability" },
      { label: "Owner", name: "ownerId" }
    ],
    icon: <Target aria-hidden="true" />,
    id: "oportunidades",
    searchPlaceholder: "nombre, cuenta, etapa u owner",
    singular: "oportunidad",
    statusOptions: [
      { label: "Abierta", value: "open" },
      { label: "Cerrada", value: "closed" }
    ],
    title: "Oportunidades"
  },
  reportes: {
    description: "Catalogo autorizado de reportes y read models con freshness explicita.",
    editorFields: [],
    endpoint: "/api/crm/v1/reports",
    eyebrow: "Analitica",
    fields: [
      { label: "Nombre", name: "label" },
      { format: "list", label: "Perfiles", name: "profileKeys" },
      { label: "Capability", name: "requiredCapability" },
      { format: "status", label: "Estado", name: "status" },
      { label: "Version", name: "version" },
      { label: "Freshness", name: "freshness" }
    ],
    icon: <FileBarChart aria-hidden="true" />,
    id: "reportes",
    readOnly: true,
    searchPlaceholder: "nombre, categoria o version",
    singular: "reporte",
    title: "Reportes"
  }
};
