import { CrmV1Error } from "./crmV1Domain.js";
import type { CrmAccessContext, CrmRecord, CrmResource } from "./crmV1Types.js";

export type CrmEnvironmentClass = "development" | "production";
export type CrmDeletionResourceClass = "master" | "transaction";
export type CrmDeletionReasonCode =
  | "allowed_development"
  | "master_unreferenced"
  | "master_has_transactions"
  | "transaction_delete_forbidden"
  | "capability_missing"
  | "environment_unknown"
  | "policy_unavailable"
  | "deletion_policy_changed";

export type CrmDeletionDecision = {
  dependencyCount?: number;
  disabledReason?: string;
  environmentClass: CrmEnvironmentClass;
  expectedVersion?: number;
  reasonCode: CrmDeletionReasonCode;
  resourceClass: CrmDeletionResourceClass;
  state: "allowed" | "blocked" | "hidden";
  strategy: "trash";
};

export type CrmDeletionPolicy = {
  capability: string;
  command: "trash";
  lifecycle: "enabled" | "blocked-domain";
  resourceClass: CrmDeletionResourceClass;
};

export const crmDeletionPolicies: Record<CrmResource, CrmDeletionPolicy> = {
  accounts: { capability: "crm.accounts.recycle", command: "trash", lifecycle: "enabled", resourceClass: "master" },
  contacts: { capability: "crm.contacts.recycle", command: "trash", lifecycle: "enabled", resourceClass: "master" },
  cases: { capability: "crm.cases.recycle", command: "trash", lifecycle: "enabled", resourceClass: "transaction" },
  activities: { capability: "crm.activities.recycle", command: "trash", lifecycle: "enabled", resourceClass: "transaction" },
  appointments: { capability: "crm.appointments.recycle", command: "trash", lifecycle: "enabled", resourceClass: "transaction" },
  opportunities: { capability: "crm.opportunities.recycle", command: "trash", lifecycle: "enabled", resourceClass: "transaction" }
};

export function normalizeEnvironmentClass(value: unknown): CrmEnvironmentClass | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "development" || normalized === "production" ? normalized : null;
}

export function deletionDecision(input: {
  access: CrmAccessContext;
  dependencyCount: number;
  environmentClass: CrmEnvironmentClass | null;
  record: Pick<CrmRecord, "version">;
  resource: CrmResource;
}): CrmDeletionDecision {
  const policy = crmDeletionPolicies[input.resource];
  const safeEnvironment = input.environmentClass ?? "production";
  const base = {
    environmentClass: safeEnvironment,
    expectedVersion: input.record.version,
    resourceClass: policy.resourceClass,
    strategy: "trash" as const
  };
  if (!input.environmentClass) {
    return { ...base, reasonCode: "environment_unknown", state: "hidden" };
  }
  if (!input.access.capabilities.includes(policy.capability)) {
    return { ...base, reasonCode: "capability_missing", state: "hidden" };
  }
  if (policy.lifecycle === "blocked-domain") {
    return {
      ...base,
      disabledReason: "Este dominio aún no acredita impacto y restauración seguros.",
      reasonCode: "policy_unavailable",
      state: "hidden"
    };
  }
  if (input.environmentClass === "production" && policy.resourceClass === "transaction") {
    return { ...base, reasonCode: "transaction_delete_forbidden", state: "hidden" };
  }
  if (input.environmentClass === "production" && input.dependencyCount > 0) {
    return {
      ...base,
      dependencyCount: input.dependencyCount,
      reasonCode: "master_has_transactions",
      state: "blocked"
    };
  }
  return {
    ...base,
    ...(input.dependencyCount > 0 ? { dependencyCount: input.dependencyCount } : {}),
    reasonCode: input.environmentClass === "development" ? "allowed_development" : "master_unreferenced",
    state: "allowed"
  };
}

export function assertDeletionAllowed(input: {
  access: CrmAccessContext;
  dependencyCount: number;
  environmentClass: CrmEnvironmentClass | null;
  record: Pick<CrmRecord, "version">;
  resource: CrmResource;
}): CrmDeletionDecision {
  const decision = deletionDecision(input);
  if (decision.state === "allowed") return decision;
  const status = decision.reasonCode === "transaction_delete_forbidden" || decision.reasonCode === "capability_missing"
    ? 403
    : decision.reasonCode === "environment_unknown" || decision.reasonCode === "policy_unavailable"
      ? 503
      : 409;
  throw new CrmV1Error(status, `crm.deletion.${decision.reasonCode}`, deletionErrorMessage(decision.reasonCode));
}

function deletionErrorMessage(reason: CrmDeletionReasonCode): string {
  switch (reason) {
    case "master_has_transactions": return "El registro tiene transacciones relacionadas y no puede retirarse en producción.";
    case "transaction_delete_forbidden": return "Las transacciones no pueden retirarse en producción.";
    case "capability_missing": return "La identidad no tiene la capability de papelera requerida.";
    case "environment_unknown": return "El ambiente funcional no pudo validarse.";
    case "policy_unavailable": return "El dominio no tiene un lifecycle de papelera acreditado.";
    default: return "La elegibilidad del registro cambió; actualiza el inventario.";
  }
}
