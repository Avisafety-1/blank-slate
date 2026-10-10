import { auditDeepLink } from "../utils/auditDeepLink";
import type {
  CompetencyRow,
  DocumentRow,
  FleetRow,
  OperationsIssue,
  SafetyAggregate,
  ScannerFinding,
} from "../types";

export interface ValidatorContext {
  companyId: string;
  competencies: CompetencyRow[];
  documents: DocumentRow[];
  fleet: FleetRow[];
  operations: OperationsIssue[];
  safety: SafetyAggregate | null;
  overdueAuditActions: {
    id: string;
    description: string;
    deadline: string | null;
  }[];
  findingsAwaitingVerification: { id: string; description: string }[];
  requireSoraOnMissions: boolean;
}

export type Validator = (ctx: ValidatorContext) => ScannerFinding[];

// ---------- Competence ----------
const competenceValidator: Validator = ({ competencies }) =>
  competencies
    .filter((c) => c.status === "fail" || c.status === "expired" || c.status === "warn" || c.status === "expiring")
    .map((c) => {
      const isFail = c.status === "fail" || c.status === "expired";
      return {
        code: isFail ? "ExpiredCompetence" : "CompetenceExpiringSoon",
        severity: (isFail ? "critical" : "warning") as ScannerFinding["severity"],
        categoryKey: "competence" as const,
        titleKey: isFail
          ? "audit.scanner.expiredCompetence.title"
          : "audit.scanner.expiringCompetence.title",
        bodyKey: isFail
          ? "audit.scanner.expiredCompetence.body"
          : "audit.scanner.expiringCompetence.body",
        titleParams: { pilot: c.pilotName, competency: c.competency },
        bodyParams: {
          pilot: c.pilotName,
          competency: c.competency,
          days: c.daysUntilExpiry ?? 0,
        },
        entityType: "competency",
        // Own competency id, so dismissing one finding does not hide others for the same person.
        entityId: c.id,
        evidence: { validUntil: c.validUntil, daysUntilExpiry: c.daysUntilExpiry, profileId: c.profileId },
        deepLink: auditDeepLink("profile", c.profileId),
      };
    });

// ---------- Documentation ----------
const documentationValidator: Validator = ({ documents }) => {
  const findings: ScannerFinding[] = [];
  // Only surface findings for documents that actually matter for compliance.
  const scoped = documents.filter((d) => d.complianceRelevance === "required");
  for (const d of scoped) {
    const isFail = d.status === "fail" || d.status === "expired";
    const isWarn = d.status === "warn" || d.status === "expiring";
    if (!isFail && !isWarn) continue;
    findings.push({
      code: isFail ? "ExpiredDocument" : "DocumentReviewOverdue",
      severity: isFail ? "critical" : "warning",
      categoryKey: "documentation",
      titleKey: isFail
        ? "audit.scanner.expiredDocument.title"
        : "audit.scanner.documentReviewOverdue.title",
      bodyKey: isFail
        ? "audit.scanner.expiredDocument.body"
        : "audit.scanner.documentReviewOverdue.body",
      titleParams: { title: d.title },
      bodyParams: { title: d.title, days: d.daysUntilExpiry ?? 0 },
      entityType: "document",
      entityId: d.id,
      evidence: { nextReview: d.nextReview },
      deepLink: auditDeepLink("document", d.id),
    });
  }
  // Emergency plan missing → look at categories (scoped so we don't flag test files)
  const hasEmergency = documents.some((d) =>
    /beredskap|emergency|kriseplan/i.test(`${d.title} ${d.category}`),
  );
  if (scoped.length > 0 && !hasEmergency) {
    findings.push({
      code: "MissingEmergencyPlan",
      severity: "warning",
      categoryKey: "documentation",
      titleKey: "audit.scanner.missingEmergencyPlan.title",
      bodyKey: "audit.scanner.missingEmergencyPlan.body",
      entityType: "document",
      entityId: "emergency-plan",
      deepLink: auditDeepLink("document", ""),
    });
  }
  return findings;
};

// ---------- Fleet ----------
const fleetValidator: Validator = ({ fleet }) =>
  fleet
    .filter((d) => d.status === "Rød" || d.status === "Gul")
    .map((d) => {
      const red = d.status === "Rød";
      const reasons = d.reasons.map((r) => r.text).join("; ");
      const params = { drone: d.droneName, reasons: reasons || "—", department: d.departmentName ?? "" };
      return {
        code: red ? "DroneStatusRed" : "DroneStatusYellow",
        severity: (red ? "critical" : "warning") as ScannerFinding["severity"],
        categoryKey: "fleet" as const,
        titleKey: red ? "audit.scanner.droneStatusRed.title" : "audit.scanner.droneStatusYellow.title",
        bodyKey: red ? "audit.scanner.droneStatusRed.body" : "audit.scanner.droneStatusYellow.body",
        titleParams: params,
        bodyParams: params,
        entityType: "drone",
        entityId: d.id,
        evidence: { reasons: d.reasons, technicalResponsibleId: d.technicalResponsibleId, companyId: d.companyId },
        deepLink: auditDeepLink("drone", d.id),
      };
    });

// ---------- Operations ----------
const OPS_FINDING_CODE: Record<OperationsIssue["code"], string> = {
  missionPlannedPastDue: "MissionPlannedPastDue",
  missionInProgressStale: "MissionInProgressStale",
  activeFlightStale: "ActiveFlightStale",
  soraEnvelopeExceeded: "SoraEnvelopeExceeded",
  flownWithNoGo: "FlownWithNoGo",
  missingRiskAssessment: "MissingRiskAssessment",
};

const operationsValidator: Validator = ({ operations, requireSoraOnMissions }) => {
  const findings: ScannerFinding[] = [];
  for (const issue of operations) {
    if (issue.code === "missingRiskAssessment" && !requireSoraOnMissions) continue;
    const params = {
      mission: issue.missionTitle,
      date: issue.missionDate ? issue.missionDate.slice(0, 10) : "",
      days: issue.days ?? 0,
      hours: issue.hours ?? 0,
      sail: issue.sail ?? "—",
      deviations: (issue.details ?? []).join("; "),
      approvedBy: issue.approvedBefore?.by ?? "—",
      approvedAt: issue.approvedBefore?.at ? issue.approvedBefore.at.slice(0, 10) : "",
    };
    const bodyKey = issue.code === "flownWithNoGo" && issue.approvedBefore
      ? "audit.scanner.flownWithNoGo.bodyApprovedBefore"
      : `audit.scanner.${issue.code}.body`;
    const entityIsMission = !!issue.missionId;
    findings.push({
      code: OPS_FINDING_CODE[issue.code],
      severity: issue.severity ?? "warning",
      categoryKey: "operations",
      titleKey: `audit.scanner.${issue.code}.title`,
      bodyKey,
      titleParams: params,
      bodyParams: params,
      entityType: entityIsMission ? "mission" : "active_flight",
      entityId: issue.missionId ?? issue.flightId ?? issue.id,
      evidence: issue.details ? { deviations: issue.details, sail: issue.sail ?? null } : undefined,
      deepLink: entityIsMission ? auditDeepLink("mission", issue.missionId!) : auditDeepLink("audit", ""),
    });
  }
  return findings;
};

// ---------- Safety ----------
const safetyValidator: Validator = ({ overdueAuditActions, findingsAwaitingVerification, safety }) => {
  const findings: ScannerFinding[] = [];
  for (const i of safety?.incidentIssues ?? []) {
    const params = { title: i.title, days: i.days };
    findings.push({
      code: i.code === "incidentOpenTooLong" ? "IncidentOpenTooLong" : "IncidentNoResponsible",
      severity: i.severity,
      categoryKey: "safety",
      titleKey: `audit.scanner.${i.code}.title`,
      bodyKey: `audit.scanner.${i.code}.body`,
      titleParams: params,
      bodyParams: params,
      entityType: "incident",
      entityId: i.incidentId,
      deepLink: auditDeepLink("incident", i.incidentId),
    });
  }
  for (const a of overdueAuditActions) {
    findings.push({
      code: "OpenActionsTooLong",
      severity: "critical",
      categoryKey: "safety",
      titleKey: "audit.scanner.overdueAction.title",
      bodyKey: "audit.scanner.overdueAction.body",
      titleParams: { desc: a.description },
      bodyParams: { desc: a.description, deadline: a.deadline ?? "" },
      entityType: "audit_action",
      entityId: a.id,
      deepLink: auditDeepLink("audit_action", a.id),
    });
  }
  for (const f of findingsAwaitingVerification) {
    findings.push({
      code: "FindingAwaitingVerification",
      severity: "info",
      categoryKey: "safety",
      titleKey: "audit.scanner.awaitingVerification.title",
      bodyKey: "audit.scanner.awaitingVerification.body",
      titleParams: { desc: f.description },
      bodyParams: { desc: f.description },
      entityType: "audit_finding",
      entityId: f.id,
      deepLink: auditDeepLink("audit_finding", f.id),
    });
  }
  return findings;
};

export const validators: Validator[] = [
  competenceValidator,
  documentationValidator,
  fleetValidator,
  operationsValidator,
  safetyValidator,
];
