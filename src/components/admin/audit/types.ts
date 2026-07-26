export type AuditStatus = "ok" | "warning" | "danger" | "info";

export interface AuditDocument {
  id: string;
  title: string;
  status: AuditStatus;
  nextReview: string; // ISO date
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

export type AuditSectionKey =
  | "organization"
  | "documentation"
  | "competency"
  | "operations"
  | "technical"
  | "safety";

export interface InternalAudit {
  id: string;
  title: string;
  date: string;
  responsible: string;
  status: "planned" | "in_progress" | "closed";
  findings: AuditFinding[];
  sections: Record<AuditSectionKey, { checked: boolean[]; comment: string; status: AuditStatus }>;
}

export interface ComplianceInputs {
  documents: AuditDocument[];
  competencies: AuditCompetency[];
  fleet: AuditFleetRow[];
  openFindings: number;
  openActions: number;
}
