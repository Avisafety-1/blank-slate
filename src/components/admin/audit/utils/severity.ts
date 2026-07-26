import type { FindingSeverity, ScannerFinding } from "../types";

const RANK: Record<FindingSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function sortBySeverity<T extends { severity: FindingSeverity }>(items: T[]): T[] {
  return [...items].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export function severityIcon(sev: FindingSeverity): string {
  return sev === "critical" ? "🔴" : sev === "warning" ? "🟠" : "🟡";
}

export function topFindings(findings: ScannerFinding[], limit = 10): ScannerFinding[] {
  return sortBySeverity(findings).slice(0, limit);
}
