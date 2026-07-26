import type { ComplianceInputs, AuditStatus } from "../types";

const weight = (s: AuditStatus) => (s === "ok" ? 1 : s === "warning" ? 0.6 : s === "info" ? 0.8 : 0.2);

/**
 * Pure compliance score calculator (0-100).
 * Designed so the same signature can be fed with real data later.
 */
export function calculateComplianceScore(input: ComplianceInputs): number {
  const items: number[] = [];
  input.documents.forEach((d) => items.push(weight(d.status)));
  input.competencies.forEach((c) => items.push(weight(c.status)));
  input.fleet.forEach((f) => {
    items.push(weight(f.firmware));
    items.push(weight(f.service));
    items.push(weight(f.remoteId));
    items.push(weight(f.batteryHealth));
    items.push(weight(f.calibration));
  });
  const base = items.length ? items.reduce((a, b) => a + b, 0) / items.length : 1;
  const penalty = Math.min(0.2, input.openFindings * 0.02 + input.openActions * 0.01);
  return Math.round(Math.max(0, Math.min(1, base - penalty)) * 100);
}
