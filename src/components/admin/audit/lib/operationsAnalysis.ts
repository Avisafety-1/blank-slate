// Pure rules for the Operations part of the compliance module (no I/O).
import type { CheckResult, OperationsIssue } from "../types";

export const PLANNED_STATUS = "Planlagt";
export const IN_PROGRESS_STATUS = "Pågående";
export const COMPLETED_STATUS = "Fullført";

export const PLANNED_PAST_DUE_HOURS = 24;
export const IN_PROGRESS_STALE_HOURS = 72;
export const ACTIVE_FLIGHT_STALE_HOURS = 12;
export const UNPLANNED_THRESHOLD_PCT = 10;
export const UNPLANNED_WINDOW_DAYS = 90;

const HOUR = 3_600_000;

export interface MissionLike {
  id: string;
  tittel?: string | null;
  tidspunkt?: string | null;
  slutt_tidspunkt?: string | null;
  status?: string | null;
}

/** End time = slutt_tidspunkt ?? tidspunkt. */
export const missionEnd = (m: MissionLike): Date | null => {
  const raw = m.slutt_tidspunkt || m.tidspunkt;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

/** Hanging mission check: planned >24h past end (warning), in progress >72h past end (critical). */
export function staleMissionIssue(m: MissionLike, now: Date = new Date()): OperationsIssue | null {
  const end = missionEnd(m);
  if (!end) return null;
  const ageMs = now.getTime() - end.getTime();
  const base = {
    missionId: m.id,
    missionTitle: m.tittel ?? "—",
    missionDate: m.slutt_tidspunkt || m.tidspunkt || null,
    days: Math.floor(ageMs / (24 * HOUR)),
  };
  if (m.status === PLANNED_STATUS && ageMs > PLANNED_PAST_DUE_HOURS * HOUR) {
    return { ...base, id: `${m.id}-planned-due`, code: "missionPlannedPastDue", severity: "warning" };
  }
  if (m.status === IN_PROGRESS_STATUS && ageMs > IN_PROGRESS_STALE_HOURS * HOUR) {
    return { ...base, id: `${m.id}-inprogress-stale`, code: "missionInProgressStale", severity: "critical" };
  }
  return null;
}

export interface ActiveFlightLike {
  id: string;
  mission_id?: string | null;
  start_time: string;
  pilot_name?: string | null;
}

export function staleActiveFlightIssue(
  f: ActiveFlightLike,
  missionTitle: string | null,
  now: Date = new Date(),
): OperationsIssue | null {
  const start = new Date(f.start_time);
  if (isNaN(start.getTime())) return null;
  const ageMs = now.getTime() - start.getTime();
  if (ageMs <= ACTIVE_FLIGHT_STALE_HOURS * HOUR) return null;
  return {
    id: `${f.id}-active-stale`,
    missionId: f.mission_id ?? null,
    flightId: f.id,
    missionTitle: missionTitle ?? f.pilot_name ?? "—",
    missionDate: f.start_time,
    code: "activeFlightStale",
    severity: "critical",
    hours: Math.floor(ageMs / HOUR),
  };
}

/** Extract a roman SAIL (I–VI) from whatever shape the assessment stored. */
export function normalizeSail(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const m = v.toUpperCase().match(/\b(VI|IV|V|III|II|I)\b/);
    return m ? m[1] : null;
  }
  if (typeof v === "number" && v >= 1 && v <= 6) return ["I", "II", "III", "IV", "V", "VI"][v - 1];
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["sail", "level", "value", "finalSail", "label"]) {
      const r = normalizeSail(o[k]);
      if (r) return r;
    }
  }
  return null;
}

export interface SoraProfileOutcome {
  used: boolean;
  deviations: string[];
}

export function readSoraProfile(...candidates: unknown[]): SoraProfileOutcome | null {
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const p = c as { used?: unknown; deviations?: unknown };
    const devs = Array.isArray(p.deviations)
      ? p.deviations
          .map((d: any) => (typeof d === "string" ? d : d?.text ?? d?.code ?? ""))
          .filter((s: string) => !!s)
      : [];
    return { used: p.used === true, deviations: devs };
  }
  return null;
}

export function soraEnvelopeIssue(
  m: MissionLike,
  profile: SoraProfileOutcome | null,
  sail: string | null,
  flown: boolean,
): OperationsIssue | null {
  if (!profile?.used || profile.deviations.length === 0) return null;
  const critical = m.status === COMPLETED_STATUS || flown;
  return {
    id: `${m.id}-sora-envelope`,
    missionId: m.id,
    missionTitle: m.tittel ?? "—",
    missionDate: m.tidspunkt ?? null,
    code: "soraEnvelopeExceeded",
    severity: critical ? "critical" : "warning",
    details: profile.deviations,
    sail,
  };
}

/** Codes that make up the operations score. MissingRiskAssessment only when required. */
export function isScoredIssue(i: OperationsIssue, requireSora: boolean): boolean {
  switch (i.code) {
    case "missionInProgressStale":
    case "activeFlightStale":
    case "soraEnvelopeExceeded":
    case "flownWithNoGo":
      return true;
    case "missingRiskAssessment":
      return requireSora;
    default:
      return false;
  }
}

/** One result per evaluated mission; a mission with several scored issues fails once. */
export function operationsCheckResults(
  issues: OperationsIssue[],
  total: number,
  requireSora: boolean,
): CheckResult[] {
  const failingMissions = new Set<string>();
  let orphanFails = 0;
  for (const i of issues) {
    if (!isScoredIssue(i, requireSora)) continue;
    if (i.missionId) failingMissions.add(i.missionId);
    else orphanFails++;
  }
  const results: CheckResult[] = [];
  const fails = Math.min(failingMissions.size, total);
  for (let k = 0; k < total; k++) results.push(k < fails ? "fail" : "pass");
  for (let k = 0; k < orphanFails; k++) results.push("fail");
  return results;
}

/**
 * A flown NO-GO mission is OK when it was approved AFTER (or at) the NO-GO assessment.
 * Returns "approved" (no finding), "approvedBefore" (finding, show old approval) or "notApproved".
 */
export function noGoApprovalState(
  m: { approval_status?: string | null; approved_at?: string | null },
  assessmentCreatedAt: string,
): "approved" | "approvedBefore" | "notApproved" {
  if (m.approval_status !== "approved" || !m.approved_at) return "notApproved";
  const approved = new Date(m.approved_at).getTime();
  const assessed = new Date(assessmentCreatedAt).getTime();
  if (isNaN(approved) || isNaN(assessed)) return "notApproved";
  return approved >= assessed ? "approved" : "approvedBefore";
}

// ---------- Incidents ----------
export const INCIDENT_OPEN_DAYS = 30;
const CLOSED_INCIDENT = /^(lukket|ferdigbehandlet|closed)$/i;
const HIGH_SEVERITY = /(h[øo]y|kritisk|high|critical)/i;

export interface IncidentLike {
  id: string;
  tittel?: string | null;
  status?: string | null;
  alvorlighetsgrad?: string | null;
  hendelsestidspunkt?: string | null;
  opprettet_dato?: string | null;
  oppfolgingsansvarlig_id?: string | null;
}

export const isClosedIncident = (status: string | null | undefined) => CLOSED_INCIDENT.test((status ?? "").trim());

export function incidentIssues(r: IncidentLike, now: Date = new Date()) {
  if (isClosedIncident(r.status)) return [];
  const out: {
    id: string; incidentId: string; title: string; incidentDate: string | null;
    code: "incidentOpenTooLong" | "incidentNoResponsible"; severity: "critical" | "warning"; days: number;
  }[] = [];
  const raw = r.opprettet_dato || r.hendelsestidspunkt;
  const d = raw ? new Date(raw) : null;
  const days = d && !isNaN(d.getTime()) ? Math.floor((now.getTime() - d.getTime()) / 86_400_000) : 0;
  const base = { incidentId: r.id, title: r.tittel ?? "—", incidentDate: r.hendelsestidspunkt ?? null, days };
  if (days > INCIDENT_OPEN_DAYS) {
    out.push({ ...base, id: `${r.id}-open`, code: "incidentOpenTooLong", severity: HIGH_SEVERITY.test(r.alvorlighetsgrad ?? "") ? "critical" : "warning" });
  }
  if (!r.oppfolgingsansvarlig_id) {
    out.push({ ...base, id: `${r.id}-noresp`, code: "incidentNoResponsible", severity: "warning" });
  }
  return out;
}

/** Drone status (Grønn/Gul/Rød) → scoring bucket. */
export const droneStatusCheck = (status: string): CheckResult =>
  status === "Rød" ? "fail" : status === "Gul" ? "warn" : "pass";
