export const crmResources = [
  "accounts",
  "contacts",
  "cases",
  "activities",
  "appointments",
  "opportunities"
] as const;

export type CrmResource = (typeof crmResources)[number];

export type CrmIdentity = {
  kind: "browser" | "oauth-api";
  issuer: string;
  subject: string;
  roles: string[];
  scopes: string[];
};

export type CrmAccessContext = {
  tenantId: string;
  tenantKey: string;
  displayName: string;
  schemaName: string;
  dictionaryVersion: string;
  profileKey: string;
  profileVersion: string;
  timezone: string;
  locale: string;
  capabilities: string[];
  authorizationDecisionId: string;
};

export type CrmRecord = {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  [key: string]: unknown;
};

export type CrmListQuery = {
  limit: number;
  cursor: string | null;
  q: string | null;
  sort: string;
  direction: "asc" | "desc";
  filters: Record<string, string>;
};

export type CrmPage = {
  data: CrmRecord[];
  nextCursor: string | null;
  total: number;
};

export type CrmMutationContext = {
  correlationId: string;
  requestId: string;
  actor: CrmIdentity;
  access: CrmAccessContext;
  idempotencyKey: string;
  requestChecksum: string;
};

export type CrmAuditEvent = {
  id: string;
  tenantId: string;
  requestId: string;
  actorSubject: string;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: "accepted" | "rejected";
  reasonCode: string | null;
  occurredAt: string;
};

export type CrmOutboxEvent = {
  eventId: string;
  eventType: string;
  contractVersion: "1";
  tenantId: string;
  occurredAt: string;
  correlationId: string;
  causationId: string;
  actor: { type: "human" | "service"; subject: string };
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed" | "quarantined";
};

export type IndustryProfile = {
  key: string;
  version: string;
  label: string;
  vocabulary: Record<string, string>;
  caseStates: string[];
  appointmentStates: string[];
  fields: Array<{ key: string; type: string; sensitive: boolean; required: boolean }>;
  metricSetVersion: string;
  reports: string[];
};

export type TenantConfiguration = {
  version: number;
  profileKey: string;
  profileVersion: string;
  timezone: string;
  locale: string;
  slaPolicy: {
    version: string;
    firstActionMinutes: number;
    followUpMinutes: number;
    calendarKey: string;
  };
  featureFlags: Record<string, boolean>;
  labels: Record<string, string>;
  updatedAt: string;
};

export type DashboardSummary = {
  contractVersion: "crm-dashboard-summary-v1";
  metricSetVersion: string;
  profileVersion: string;
  period: { from: string; to: string };
  timezone: string;
  asOf: string;
  freshness: { state: "live" | "empty" | "stale" | "unavailable"; generatedAt: string; ageSeconds: number };
  score: {
    value: number;
    formulaVersion: string;
    dimensions: Array<{ key: string; label: string; value: number; weight: number }>;
  };
  metrics: Array<{ key: string; label: string; value: number; unit: string; tone: string; target?: number }>;
  signals: Array<{ key: string; label: string; value: string; tone: string }>;
  progress: Array<{ key: string; label: string; value: number; target: number; unit: string }>;
  risks: Array<{ key: string; label: string; count: number; route: string; severity: string }>;
  domains: Array<{ key: string; label: string; value: number; route: string; status: string }>;
  insights: Array<{ key: string; title: string; detail: string; route: string; tone: string }>;
};

export type ReportDefinition = {
  id: string;
  key: string;
  label: string;
  description: string;
  profileKeys: string[];
  requiredCapability: string;
  status: "active";
  version: "1";
  freshness: "catalog";
};

export type CrmJob = CrmRecord & {
  kind: "report-run" | "export";
  status: "accepted" | "running" | "completed" | "failed" | "expired";
  expiresAt: string | null;
};

export type ImportBatch = CrmRecord & {
  status: "staged" | "validated" | "committed" | "rejected" | "rolled_back";
  sourceFingerprint: string;
  sourceRecordCount: number;
  acceptedCount: number;
  duplicateCount: number;
  quarantineCount: number;
  quarantine: Array<{ sourceRow: number; code: string; fields: string[] }>;
};
