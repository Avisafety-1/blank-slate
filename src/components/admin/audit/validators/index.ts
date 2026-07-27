import { auditDeepLink } from "../utils/auditDeepLink";
import { daysUntil } from "../utils/dates";
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
        entityId: c.profileId,
        evidence: { validUntil: c.validUntil, daysUntilExpiry: c.daysUntilExpiry },
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
const fleetValidator: Validator = ({ fleet }) => {
  const findings: ScannerFinding[] = [];
  for (const d of fleet) {
    const isFail = d.service === "fail" || d.service === "expired";
    const isWarn = d.service === "warn" || d.service === "expiring";
    if (!isFail && !isWarn) continue;
    findings.push({
      code: isFail ? "ServiceExpired" : "ServiceDueSoon",
      severity: isFail ? "critical" : "warning",
      categoryKey: "fleet",
      titleKey: isFail
        ? "audit.scanner.serviceExpired.title"
        : "audit.scanner.serviceDueSoon.title",
      bodyKey: isFail
        ? "audit.scanner.serviceExpired.body"
        : "audit.scanner.serviceDueSoon.body",
      titleParams: { drone: d.droneName },
      bodyParams: { drone: d.droneName, days: daysUntil(d.nextInspection) ?? 0 },
      entityType: "drone",
      entityId: d.id,
      evidence: { nextInspection: d.nextInspection },
      deepLink: auditDeepLink("drone", d.id),
    });
  }
  return findings;
};

// ---------- Operations ----------
const operationsValidator: Validator = ({ operations, requireSoraOnMissions }) => {
  const findings: ScannerFinding[] = [];
  for (const issue of operations) {
    if (issue.code === "missingRiskAssessment" && !requireSoraOnMissions) continue;
    findings.push({
      code:
        issue.code === "missingRiskAssessment"
          ? "MissingRiskAssessment"
          : issue.code === "missingChecklist"
            ? "NoChecklist"
            : issue.code === "flightNotClosed"
              ? "FlightNotClosed"
              : "MissingApproval",
      severity: issue.code === "flightNotClosed" ? "critical" : "warning",
      categoryKey: "operations",
      titleKey: `audit.scanner.${issue.code}.title`,
      bodyKey: `audit.scanner.${issue.code}.body`,
      titleParams: { mission: issue.missionTitle },
      bodyParams: { mission: issue.missionTitle, date: issue.missionDate ?? "" },
      entityType: "mission",
      entityId: issue.missionId,
      deepLink: auditDeepLink("mission", issue.missionId),
    });
  }
  return findings;
};

// ---------- Safety ----------
const safetyValidator: Validator = ({ overdueAuditActions, findingsAwaitingVerification }) => {
  const findings: ScannerFinding[] = [];
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
