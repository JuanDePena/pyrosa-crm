import type { CrmRouteId } from "./routeRegistry";

export type ClientSession = {
  csrfToken?: string;
  expiresAt?: string;
  tenant?: {
    id?: string;
    label?: string;
  };
  user?: {
    displayName?: string;
    email?: string;
    locale?: string;
    primaryEmail?: {
      email?: string;
      isVerified?: boolean;
    };
    role?: string;
    security?: {
      activeMfaMethods?: number;
      mfaRequired?: boolean;
    };
    status?: string;
    timezone?: string;
  };
};

export type SessionResponse = {
  ok?: boolean;
  session?: ClientSession;
};

export type BootstrapResponse = {
  app?: {
    branch?: string;
    commit?: string;
    name?: string;
    releaseId?: string;
    version?: string;
  };
  context?: {
    activeTenantId?: string;
    displayName?: string;
    profileKey?: string;
    profileVersion?: string;
    tenantKey?: string;
    timezone?: string;
    contextVersion?: string;
  };
  tenantContext?: {
    schemaVersion?: string;
    contextVersion?: string;
    state?: "active" | "unselected" | "safe_state";
    expiresAt?: string | null;
    renewAfter?: string | null;
    selected?: {
      tenantId?: string;
      tenantKey?: string;
      label?: string;
    } | null;
    options?: Array<{
      tenantId?: string;
      tenantKey?: string;
      label?: string;
      status?: "ready" | "blocked";
      reason?: string | null;
    }>;
  };
  platform?: Record<string, unknown>;
};

export type TenantContextRenewResponse = {
  schemaVersion?: string;
  tenantContext?: BootstrapResponse["tenantContext"];
  context?: BootstrapResponse["context"];
};

export type TenantOptionsResponse = {
  schemaVersion?: string;
  options?: NonNullable<BootstrapResponse["tenantContext"]>["options"];
  page?: {
    hasMore?: boolean;
    nextCursor?: string | null;
    ownerExpiresAt?: string;
    cache?: "miss" | "fresh" | "stale";
  };
};

export type ApiMeta = {
  asOf?: string;
  requestId?: string;
  tenantId?: string;
};

export type ApiPage = {
  limit: number;
  nextCursor?: string | null;
  total?: number;
};

export type ApiListResponse<T> = {
  data: T[];
  meta: ApiMeta;
  page: ApiPage;
};

export type ApiDetailResponse<T> = {
  data: T;
  meta: ApiMeta;
};

export type CrmEntity = {
  archivedAt?: string | null;
  createdAt?: string;
  id: string;
  status?: string;
  updatedAt?: string;
  version?: number;
  deletionDecision?: InventoryDeletionDecision;
  [key: string]: unknown;
};

export type InventoryDeletionDecision = {
  dependencyCount?: number;
  disabledReason?: string;
  environmentClass: "development" | "production";
  expectedVersion?: number;
  reasonCode:
    | "allowed_development"
    | "master_unreferenced"
    | "master_has_transactions"
    | "transaction_delete_forbidden"
    | "capability_missing"
    | "environment_unknown"
    | "policy_unavailable"
    | "deletion_policy_changed";
  resourceClass: "master" | "definition" | "transaction";
  state: "allowed" | "blocked" | "hidden";
  strategy: "trash";
};

export type RecycleBinEntry = {
  id: string;
  resourceType: "accounts" | "contacts" | "cases" | "activities" | "appointments" | "opportunities";
  resourceId: string;
  resourceLabel: string;
  resourceClass: "master" | "transaction";
  previousStatus: string;
  previousVersion: number;
  dependencyCount: number;
  policyReasonCode: string;
  status: "active" | "restored";
  version: number;
  createdAt: string;
  updatedAt: string;
  restoredAt: string | null;
};

export type DashboardFreshness = {
  ageSeconds?: number;
  generatedAt?: string;
  state: "live" | "empty" | "stale" | "unavailable";
};

export type DashboardTone = "neutral" | "success" | "warning" | "danger" | "info";

export type DashboardMetric = {
  detail?: string;
  key: string;
  label: string;
  percent?: number;
  target?: number;
  tone?: DashboardTone;
  unit?: string;
  value: number | string;
};

export type DashboardSignal = {
  key: string;
  label: string;
  value: number | string;
};

export type DashboardProgress = DashboardMetric;

export type DashboardRisk = {
  count: number;
  key: string;
  label: string;
  route?: string;
  severity: string;
};

export type DashboardDomain = {
  key: string;
  label: string;
  route?: string;
  status?: string;
  value: number;
};

export type DashboardInsight = {
  detail: string;
  key: string;
  route?: string;
  title: string;
  tone?: DashboardTone;
};

export type DashboardScore = {
  dimensions?: Array<{
    key: string;
    label: string;
    target?: number;
    value: number;
    weight?: number;
  }>;
  formulaVersion: string;
  label?: string;
  status?: string;
  tone?: DashboardTone;
  value: number | string;
};

export type DashboardSummary = {
  asOf: string;
  contractVersion: string;
  domains: DashboardDomain[];
  freshness: DashboardFreshness;
  insights: DashboardInsight[];
  metricSetVersion: string;
  metrics: DashboardMetric[];
  period: { from: string; to: string };
  profileVersion: string;
  progress: DashboardProgress[];
  risks: DashboardRisk[];
  score: DashboardScore;
  signals: DashboardSignal[];
  timezone: string;
};

export type DashboardSummaryResponse = ApiDetailResponse<DashboardSummary>;

export type ProfileDefinition = {
  appointmentStates?: string[];
  caseStates?: string[];
  fields?: unknown[];
  key: string;
  label: string;
  metricSetVersion?: string;
  reports?: unknown[];
  version: string;
  vocabulary?: Record<string, string>;
};

export type TenantConfiguration = {
  featureFlags?: Record<string, boolean>;
  labels?: Record<string, string>;
  locale?: string;
  metricSetVersion?: string;
  profileKey?: string;
  profileVersion?: string;
  slaPolicy?: unknown;
  timezone?: string;
  version: number;
  vocabulary?: Record<string, string>;
};

export type ResourceRouteId = Exclude<CrmRouteId, "dashboard" | "configuracion" | "papelera">;

export type ResourceViewMode = "list" | "new" | "detail" | "edit";

export type CrmLocation = {
  attentionFilter?: "exception" | "overdue" | "pending";
  direction?: "asc" | "desc";
  mode: ResourceViewMode;
  recordId?: string;
  routeId: CrmRouteId;
  sort?: string;
  statusFilter?: string;
};

export type TechnicalIssue = {
  code: string;
  occurredAt?: string;
  requestId?: string;
  retryable: boolean;
  status?: number;
};
