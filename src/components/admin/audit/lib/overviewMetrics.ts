/** Pure calculations for the compliance overview's key metrics (presentation only). */

export type MetricTone = "danger" | "warning" | "neutral";
export const DAY_MS = 86_400_000;

export interface ReviewLike {
  id: string;
  title: string;
  template_key: string;
  review_type: string;
  audited_company_id: string;
  status: string;
  closed_at: string | null;
  review_date: string | null;
}

export interface Unit { id: string; name: string }

export interface ProgrammeReview {
  id: string; title: string; unitId: string; unitName: string; templateKey: string;
  date: Date | null; status: "planned" | "in_progress"; overdue: boolean;
}
export interface LastClosed { date: Date; unitName: string }
export interface CoverageWarning { tone: "danger" | "warning" }
export interface AuditProgramme { upcoming: ProgrammeReview[]; coverage: CoverageWarning | null; lastClosed: LastClosed | null }

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addMonths = (d: Date, m: number) => new Date(d.getFullYear(), d.getMonth() + m, d.getDate());

/**
 * Upcoming internal audits (planned/in progress) for the given units, sorted by date (in progress first on ties).
 * Coverage is organisation-wide: an audit of the parent OR any department counts for the whole organisation
 * (departments normally operate under the parent's operations manual). At most one coverage warning:
 * red = no closed internal audit in the organisation in 12 months and nothing upcoming;
 * yellow = last closed 11–12 months ago and nothing upcoming.
 * `filterUnitId` narrows the upcoming list to one department; coverage stays organisation-wide.
 */
export function auditProgramme(reviews: ReviewLike[], units: Unit[], now: Date = new Date(), filterUnitId?: string | null): AuditProgramme {
  const today = startOfDay(now);
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const internal = reviews.filter((r) => r.review_type === "internal" && unitName.has(r.audited_company_id));
  const upcoming: ProgrammeReview[] = internal
    .filter((r) => (r.status === "planned" || r.status === "in_progress") && (!filterUnitId || r.audited_company_id === filterUnitId))
    .map((r) => {
      const d = r.review_date ? startOfDay(new Date(r.review_date)) : null;
      const date = d && !isNaN(d.getTime()) ? d : null;
      return {
        id: r.id, title: r.title, unitId: r.audited_company_id, unitName: unitName.get(r.audited_company_id)!,
        templateKey: r.template_key, date, status: r.status as ProgrammeReview["status"],
        overdue: r.status === "planned" && !!date && date < today,
      };
    })
    .sort((a, b) => {
      const da = a.date?.getTime() ?? Infinity, db = b.date?.getTime() ?? Infinity;
      if (da !== db) return da - db;
      return (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1);
    });
  const hasUpcoming = internal.some((r) => r.status === "planned" || r.status === "in_progress");
  const yearAgo = addMonths(today, -12);
  const elevenAgo = addMonths(today, -11);
  const lastClosedReview = internal
    .filter((r) => r.closed_at)
    .map((r) => new Date(r.closed_at!))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const lastClosedReviewRow = lastClosedReview
    ? internal.filter((r) => r.closed_at && new Date(r.closed_at).getTime() === lastClosedReview.getTime())[0]
    : null;
  const lastClosed: LastClosed | null = lastClosedReviewRow
    ? { date: lastClosedReview, unitName: unitName.get(lastClosedReviewRow.audited_company_id) ?? "" }
    : null;
  let coverage: CoverageWarning | null = null;
  if (!hasUpcoming) {
    if (!lastClosedReview || lastClosedReview < yearAgo) coverage = { tone: "danger" };
    else if (lastClosedReview <= elevenAgo) coverage = { tone: "warning" };
  }
  return { upcoming, coverage, lastClosed };
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
