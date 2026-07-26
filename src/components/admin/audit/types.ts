// ============================================================
// Compliance & Audit — shared types
// ============================================================

export type AuditStatus = "ok" | "warning" | "danger" | "info";

// ---------- Mock/legacy types (kept for backwards compatibility with existing UI) ----------
export interface AuditDocument {
  id: string;
  title: string;
  status: AuditStatus;
  nextReview: string;
  responsible: string;
}
export interface AuditCompetency {
  id: string;
  pilot: string;
  competency: string;
  validUntil: string;
  status: AuditStatus;
}
export interface AuditFleetRow {
  id: string;
  drone: string;
  firmware: AuditStatus;
  service: AuditStatus;
  remoteId: AuditStatus;
  batteryHealth: AuditStatus;
  calibration: AuditStatus;
}
export interface OpsImprovement {
  id: string;
  mission: string;
  issue: string;
}
export interface SafetyTrendPoint {
  month: string;
  incidents: number;
  nearMiss: number;
}

export interface ComplianceInputs {
  documents: AuditDocument[];
  competencies: AuditCompetency[];
  fleet: AuditFleetRow[];
  openFindings: number;
  openActions: number;
}

// ---------- Real domain shapes (Fase 2) ----------
export type CheckResult = "pass" | "warn" | "fail" | "na" | "unknown";
export type FindingSeverity = "critical" | "warning" | "info";
export type ComplianceCategoryKey =
  | "competence"
  | "documentation"
  | "fleet"
  | "operations"
  | "safety";

export interface DeepLink {
  path: string;
  label?: string;
}

export interface ScannerFinding {
  code: string;
  severity: FindingSeverity;
  categoryKey: ComplianceCategoryKey;
  titleKey: string;
  bodyKey?: string;
  titleParams?: Record<string, string | number | null | undefined>;
  bodyParams?: Record<string, string | number | null | undefined>;
  entityType: string;
  entityId: string;
  evidence?: Record<string, unknown>;
  deepLink?: DeepLink;
}

export interface CategoryScore {
  key: ComplianceCategoryKey;
  score: number | null; // null = no applicable checks
  totalChecks: number;
  passed: number;
  warned: number;
  failed: number;
  unknown: number;
  na: number;
  critical: number;
  warnings: number;
}

export interface ComplianceEvaluation {
  overall: number | null;
  categories: Record<ComplianceCategoryKey, CategoryScore>;
  dataQuality: { covered: number; unknown: number; na: number };
  computedAt: string;
}

// ---------- KPI ----------
export interface AuditKpis {
  activePilots: number;
  activeDrones: number;
  flights12mo: number;
  incidents12mo: number;
  openActions: number;
  internalAuditsDone: number;
  riskAssessments12mo: number;
  completedChecklists12mo: number;
}

// ---------- Real domain rows (from Supabase) ----------
export interface CompetencyRow {
  id: string;
  profileId: string;
  pilotName: string;
  competency: string;
  validUntil: string | null;
  daysUntilExpiry: number | null;
  status: CheckResult; // pass/warn/fail
}

export interface FleetRow {
  id: string;
  droneName: string;
  registration: string | null;
  service: CheckResult;
  nextInspection: string | null;
  remoteId: CheckResult; // usually unknown (schema mangler kolonne)
  firmware: CheckResult;
  calibration: CheckResult;
  batteryHealth: CheckResult;
}

export interface OperationsIssue {
  id: string;
  missionId: string;
  missionTitle: string;
  missionDate: string | null;
  code: "missingRiskAssessment" | "missingChecklist" | "missingApproval" | "flightNotClosed";
}

export interface SafetyAggregate {
  reported: number;
  nearMiss: number;
  openActions: number;
  closedActions: number;
  avgCloseDays: number | null;
  trend: SafetyTrendPoint[];
}

export interface DocumentRow {
  id: string;
  title: string;
  category: string;
  nextReview: string | null;
  responsible: string | null;
  daysUntilExpiry: number | null;
  status: CheckResult;
}

// ---------- Persisted audit types (Fase B) ----------
export type ReviewStatus = "planned" | "in_progress" | "closed";
export type FindingStatus = "open" | "in_progress" | "verified" | "closed";
export type ActionStatus = "open" | "in_progress" | "closed";

export type AuditSectionKey =
  | "organization"
  | "documentation"
  | "competency"
  | "operations"
  | "technical"
  | "safety";

export interface AuditReviewRow {
  id: string;
  company_id: string;
  title: string;
  review_type: string;
  scope: Record<string, unknown>;
  review_date: string;
  responsible_user_id: string | null;
  status: ReviewStatus;
  closed_at: string | null;
  override_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditFindingRow {
  id: string;
  company_id: string;
  review_id: string | null;
  source_scanner_code: string | null;
  category: string;
  description: string;
  reference: string | null;
  responsible_user_id: string | null;
  deadline: string | null;
  severity: FindingSeverity;
  status: FindingStatus;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditActionRow {
  id: string;
  finding_id: string;
  company_id: string;
  description: string;
  responsible_user_id: string | null;
  deadline: string | null;
  status: ActionStatus;
  comment: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Legacy in-memory audit (existing UI still uses this) ----------
export interface AuditFinding {
  id: string;
  category: string;
  description: string;
  responsible: string;
  deadline: string;
  status: "open" | "in_progress" | "closed";
  actions: AuditAction[];
}

export interface AuditAction {
  id: string;
  description: string;
  responsible: string;
  deadline: string;
  status: "open" | "in_progress" | "closed";
}

export interface InternalAudit {
  id: string;
  title: string;
  date: string;
  responsible: string;
  status: "planned" | "in_progress" | "closed";
  findings: AuditFinding[];
  sections: Record<
    AuditSectionKey,
    { checked: boolean[]; comment: string; status: AuditStatus }
  >;
}

// ---------- Async data shape ----------
export interface AuditQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  isPartial?: boolean;
  lastComputedAt?: string;
}
