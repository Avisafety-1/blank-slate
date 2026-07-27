import { resolveCheckBucket } from "../utils/statusMapping";
import type {
  CategoryScore,
  CheckResult,
  ComplianceCategoryKey,
  ComplianceEvaluation,
  CompetencyRow,
  DocumentRow,
  FleetRow,
  OperationsIssue,
  SafetyAggregate,
  ScoreBucket,
} from "../types";

const WEIGHTS: Record<ComplianceCategoryKey, number> = {
  competence: 20,
  documentation: 20,
  fleet: 20,
  operations: 20,
  safety: 20,
};

/** Convert a list of CheckResult into a normalized 0..100 score. */
function scoreFromChecks(results: CheckResult[]): CategoryScore["score"] {
  const buckets = results.map(resolveCheckBucket);
  const relevant = buckets.filter((b) => b === "pass" || b === "warn" || b === "fail");
  if (relevant.length === 0) return null;
  const points = relevant.reduce(
    (sum, r) => sum + (r === "pass" ? 1 : r === "warn" ? 0.6 : 0),
    0,
  );
  return Math.round((points / relevant.length) * 100);
}

function tally(results: CheckResult[]): Omit<CategoryScore, "key" | "score" | "critical" | "warnings"> {
  const t = { totalChecks: results.length, passed: 0, warned: 0, failed: 0, unknown: 0, na: 0 };
  for (const r of results) {
    const b: ScoreBucket = resolveCheckBucket(r);
    if (b === "pass") t.passed++;
    else if (b === "warn") t.warned++;
    else if (b === "fail") t.failed++;
    else if (r === "unknown") t.unknown++;
    else t.na++;
  }
  return t;
}

export interface ComplianceInput {
  competencies: CompetencyRow[];
  documents: DocumentRow[];
  fleet: FleetRow[];
  operations: OperationsIssue[];
  operationsTotal: number; // how many missions were evaluated
  safety: SafetyAggregate | null;
  openAuditActions: number;
  overdueAuditActions: number;
}

export function evaluateCompliance(input: ComplianceInput): ComplianceEvaluation {
  // ---- Competence ----
  const compResults: CheckResult[] = input.competencies.map((c) => c.status);
  const competence: CategoryScore = {
    key: "competence",
    score: scoreFromChecks(compResults),
    ...tally(compResults),
    critical: compResults.map(resolveCheckBucket).filter((b) => b === "fail").length,
    warnings: compResults.map(resolveCheckBucket).filter((b) => b === "warn").length,
  };

  // ---- Documentation ----
  // Only "required" documents count towards the score. Recommended/optional
  // still appear in listings but are not compliance failures.
  const scoredDocs = input.documents.filter((d) => d.complianceRelevance === "required");
  const docResults: CheckResult[] = scoredDocs.map((d) => d.status);
  const documentation: CategoryScore = {
    key: "documentation",
    score: scoreFromChecks(docResults),
    ...tally(docResults),
    critical: docResults.map(resolveCheckBucket).filter((b) => b === "fail").length,
    warnings: docResults.map(resolveCheckBucket).filter((b) => b === "warn").length,
  };

  // ---- Fleet (compliance-critical only: service + open deviations) ----
  // We treat >0 open log deviations as "warn" and overdue service as "fail".
  const fleetResults: CheckResult[] = [];
  for (const f of input.fleet) {
    fleetResults.push(f.service);
    fleetResults.push(f.openDeviations > 0 ? "warn" : "pass");
  }

  const fleet: CategoryScore = {
    key: "fleet",
    score: scoreFromChecks(fleetResults),
    ...tally(fleetResults),
    critical: fleetResults.map(resolveCheckBucket).filter((b) => b === "fail").length,
    warnings: fleetResults.map(resolveCheckBucket).filter((b) => b === "warn").length,
  };

  // ---- Operations ----
  const opsResults: CheckResult[] = [];
  if (input.operationsTotal > 0) {
    const issueCountByMission = new Map<string, number>();
    for (const i of input.operations) {
      issueCountByMission.set(i.missionId, (issueCountByMission.get(i.missionId) ?? 0) + 1);
    }
    for (let i = 0; i < input.operationsTotal; i++) opsResults.push("pass");
    let idx = 0;
    for (const _ of issueCountByMission.keys()) {
      if (idx < opsResults.length) {
        opsResults[idx] = "fail";
        idx++;
      }
    }
  }
  const operations: CategoryScore = {
    key: "operations",
    score: scoreFromChecks(opsResults),
    ...tally(opsResults),
    critical: input.operations.length,
    warnings: 0,
  };

  // ---- Safety ----
  const safetyResults: CheckResult[] = [];
  if (input.safety) {
    for (let i = 0; i < input.safety.openActions; i++) safetyResults.push("warn");
    for (let i = 0; i < input.safety.closedActions; i++) safetyResults.push("pass");
    for (let i = 0; i < input.overdueAuditActions; i++) safetyResults.push("fail");
  }
  const safety: CategoryScore = {
    key: "safety",
    score: scoreFromChecks(safetyResults),
    ...tally(safetyResults),
    critical: input.overdueAuditActions,
    warnings: input.safety?.openActions ?? 0,
  };

  const categories: ComplianceEvaluation["categories"] = {
    competence,
    documentation,
    fleet,
    operations,
    safety,
  };

  let totalWeight = 0;
  let acc = 0;
  for (const key of Object.keys(categories) as ComplianceCategoryKey[]) {
    const c = categories[key];
    if (c.score === null) continue;
    totalWeight += WEIGHTS[key];
    acc += WEIGHTS[key] * c.score;
  }
  const overall = totalWeight === 0 ? null : Math.round(acc / totalWeight);

  const covered = Object.values(categories).reduce(
    (s, c) => s + c.passed + c.warned + c.failed,
    0,
  );
  const unknown = Object.values(categories).reduce((s, c) => s + c.unknown, 0);
  const na = Object.values(categories).reduce((s, c) => s + c.na, 0);

  return {
    overall,
    categories,
    dataQuality: { covered, unknown, na },
    computedAt: new Date().toISOString(),
  };
}

// Backwards-compatible shim used by existing OverviewTab (0-100 rough score)
export function calculateComplianceScore(input: {
  documents: { status: unknown }[];
  competencies: { status: unknown }[];
  fleet: unknown[];
  openFindings: number;
  openActions: number;
}): number {
  const w = (s: unknown) => (s === "ok" ? 1 : s === "warning" ? 0.6 : s === "info" ? 0.8 : 0.2);
  const items: number[] = [];
  input.documents.forEach((d) => items.push(w(d.status)));
  input.competencies.forEach((c) => items.push(w(c.status)));
  input.fleet.forEach(() => items.push(1));
  const base = items.length ? items.reduce((a, b) => a + b, 0) / items.length : 1;
  const penalty = Math.min(0.2, input.openFindings * 0.02 + input.openActions * 0.01);
  return Math.round(Math.max(0, Math.min(1, base - penalty)) * 100);
}
