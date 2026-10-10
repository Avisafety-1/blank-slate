/** Pure calculations for the compliance overview's key metrics (presentation only). */

export type MetricTone = "danger" | "warning" | "neutral";
export const DAY_MS = 86_400_000;

export interface ReviewLike {
  review_type: string;
  audited_company_id: string;
  status: string;
  closed_at: string | null;
  review_date: string | null;
}

export interface NextAuditResult {
  /** null = no closed internal audit yet. */
  due: Date | null;
  daysLeft: number | null;
  planned: Date | null;
  tone: MetricTone;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Next internal audit = 12 months after the latest closed one for the unit. Red when overdue or none, yellow within 30 days. */
export function nextInternalAudit(reviews: ReviewLike[], unitId: string | null, now: Date = new Date()): NextAuditResult {
  const own = reviews.filter((r) => r.review_type === "internal" && (!unitId || r.audited_company_id === unitId));
  const today = startOfDay(now);
  const planned = own
    .filter((r) => !r.closed_at && r.status !== "closed" && r.review_date)
    .map((r) => startOfDay(new Date(r.review_date!)))
    .filter((d) => !isNaN(d.getTime()) && d >= today)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const lastClosed = own
    .map((r) => (r.closed_at ? new Date(r.closed_at) : null))
    .filter((d): d is Date => !!d && !isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (!lastClosed) return { due: null, daysLeft: null, planned, tone: "danger" };
  const due = startOfDay(new Date(lastClosed.getFullYear(), lastClosed.getMonth() + 12, lastClosed.getDate()));
  const daysLeft = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  return { due, daysLeft, planned, tone: daysLeft < 0 ? "danger" : daysLeft <= 30 ? "warning" : "neutral" };
}

export interface ShareResult { ok: number; total: number; pct: number | null; tone: MetricTone }

const share = (ok: number, total: number, red: number, yellow: number): ShareResult => {
  if (total <= 0) return { ok: 0, total: 0, pct: null, tone: "neutral" };
  const pct = Math.round((ok / total) * 100);
  return { ok, total, pct, tone: pct < red ? "danger" : pct < yellow ? "warning" : "neutral" };
};

/** Active drones with green status (same aggregated status as the Fleet tab). Red <80 %, yellow <100 %. */
export function airworthyFleet(drones: { status: string }[]): ShareResult {
  return share(drones.filter((d) => d.status === "Grønn").length, drones.length, 80, 100);
}

/** Completed missions (MissionWithoutFlightLog basis) that have a flight log. Red <80 %, yellow <95 %. */
export function flightLogCoverage(eligible: number, missingLog: number): ShareResult {
  return share(Math.max(0, eligible - missingLog), eligible, 80, 95);
}

/** Display value: "–" when there is no basis (never 0 % or NaN). */
export const formatShare = (r: ShareResult, ofWord: string) => (r.pct == null ? "–" : `${r.ok} ${ofWord} ${r.total} (${r.pct} %)`);
