import type { AuditKpis, ScannerFinding } from "../types";

export interface AuditInsight {
  id: string;
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
  severity: "info" | "warning" | "critical";
}

/**
 * Placeholder implementation — rule-based summaries derived from scanner + KPI.
 * The public shape is stable so we can swap in an LLM-backed impl later.
 */
export function getAuditInsights(
  findings: ScannerFinding[],
  kpis: AuditKpis | undefined,
): AuditInsight[] {
  const insights: AuditInsight[] = [];

  const byCode = new Map<string, number>();
  for (const f of findings) byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);

  const critical = findings.filter((f) => f.severity === "critical").length;
  if (critical > 0) {
    insights.push({
      id: "critical-count",
      titleKey: "audit.insight.criticalFindings.title",
      bodyKey: "audit.insight.criticalFindings.body",
      params: { count: critical },
      severity: "critical",
    });
  }

  const overdue = byCode.get("OpenActionsTooLong") ?? 0;
  if (overdue >= 3) {
    insights.push({
      id: "overdue-actions",
      titleKey: "audit.insight.overdueActions.title",
      bodyKey: "audit.insight.overdueActions.body",
      params: { count: overdue },
      severity: "warning",
    });
  }

  if (kpis && kpis.flights12mo > 0 && kpis.riskAssessments12mo / kpis.flights12mo < 0.5) {
    insights.push({
      id: "low-ra-ratio",
      titleKey: "audit.insight.lowRiskAssessmentRatio.title",
      bodyKey: "audit.insight.lowRiskAssessmentRatio.body",
      severity: "warning",
    });
  }

  if (kpis && kpis.incidents12mo === 0 && kpis.flights12mo > 20) {
    insights.push({
      id: "no-reports",
      titleKey: "audit.insight.noIncidentReports.title",
      bodyKey: "audit.insight.noIncidentReports.body",
      severity: "info",
    });
  }

  return insights;
}
