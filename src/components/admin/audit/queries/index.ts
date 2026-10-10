import { supabase } from "@/integrations/supabase/client";
import { expiryStatus, daysUntil, monthsAgo } from "../utils/dates";
import { resolveCheckBucket } from "../utils/statusMapping";
import { summarizeUnplanned, type UnplannedFlightLog } from "@/lib/unplannedFlights";
import { buildFlownMissionRiskDistribution } from "@/lib/statusRiskDistribution";
import {
  ACTIVE_FLIGHT_STALE_HOURS,
  COMPLETED_STATUS,
  IN_PROGRESS_STATUS,
  PLANNED_STATUS,
  noGoApprovalState,
  incidentIssues as buildIncidentIssues,
  type IncidentLike,
  normalizeSail,
  readSoraProfile,
  soraEnvelopeIssue,
  staleActiveFlightIssue,
  staleMissionIssue,
  type ActiveFlightLike,
  type MissionLike,
} from "../lib/operationsAnalysis";
import type {
  AuditKpis,
  CompetencyRow,
  DocumentRow,
  DocumentComplianceClass,
  DocumentComplianceRelevance,
  FleetRow,
  OperationsData,
  OperationsIssue,
  SafetyAggregate,
} from "../types";

const iso12moAgo = () => monthsAgo(12).toISOString();
const iso12moAgoDate = () => monthsAgo(12).toISOString().slice(0, 10);

async function visibleCompanyIds(userId: string, fallback: string): Promise<string[]> {
  const { data } = await supabase.rpc("get_user_visible_company_ids", { _user_id: userId });
  const arr = (data as string[] | null) ?? [];
  return arr.length ? arr : [fallback];
}

// ============================================================
// Document classification helpers (frontend-derived)
// ============================================================
const COMPLIANCE_PATTERNS = /(operasjon|manual|ops\s*manual|beredskap|emergency|sop|policy|prosedyre|prosedure|risik|risk|forsikring|insurance|sertifik|certificate|authoris|godkjenn|approval|complian|regel|regulation|luftfartstilsyn|caa|easa)/i;
const OPERATIONAL_PATTERNS = /(vedlikehold|maintenance|logg|log|training|opplæring|opplaering|kontrakt|contract|kunde|customer|internal|intern|kvalitet|quality)/i;
const MISSION_PATTERNS = /(mission|oppdrag|flightplan|flyplan|briefing)/i;

const REQUIRED_PATTERNS = /(operasjon|manual|ops\s*manual|beredskap|emergency|sop|risik|risk|forsikring|insurance|sertifik|certificate|luftfartstilsyn|caa|easa|godkjenn|approval)/i;
const RECOMMENDED_PATTERNS = /(policy|prosedyre|prosedure|complian|regel|regulation|kvalitet|quality)/i;

function classifyDocument(title: string, category: string): {
  complianceClass: DocumentComplianceClass;
  complianceRelevance: DocumentComplianceRelevance;
} {
  const haystack = `${title} ${category}`;
  let complianceClass: DocumentComplianceClass = "other";
  if (COMPLIANCE_PATTERNS.test(haystack)) complianceClass = "compliance";
  else if (OPERATIONAL_PATTERNS.test(haystack)) complianceClass = "operational";
  else if (MISSION_PATTERNS.test(haystack)) complianceClass = "mission";

  let complianceRelevance: DocumentComplianceRelevance = "optional";
  if (complianceClass === "compliance") {
    complianceRelevance = REQUIRED_PATTERNS.test(haystack)
      ? "required"
      : RECOMMENDED_PATTERNS.test(haystack)
        ? "recommended"
        : "recommended";
  } else if (complianceClass === "operational") {
    complianceRelevance = "recommended";
  }
  return { complianceClass, complianceRelevance };
}

// ============================================================
// KPIs
// ============================================================
export async function fetchAuditKpis(userId: string, companyId: string): Promise<AuditKpis> {
  const ids = await visibleCompanyIds(userId, companyId);
  const since = iso12moAgo();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);

  const [
    pilotsRes,
    dronesRes,
    flightsRes,
    incidentsRes,
    openActionsRes,
    reviewsRes,
    raRes,
    missionsChkRes,
    docsExpRes,
    compExpRes,
    dronesOverdueRes,
    dronesUpcomingRes,
    openFindingsRes,
    criticalFindingsRes,
    plannedReviewsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("company_id", ids).eq("approved", true),
    supabase.from("drones").select("id", { count: "exact", head: true }).in("company_id", ids).eq("aktiv", true),
    supabase.from("flight_logs").select("id", { count: "exact", head: true }).in("company_id", ids).gte("flight_date", iso12moAgoDate()),
    supabase.from("incidents").select("id", { count: "exact", head: true }).in("company_id", ids).gte("hendelsestidspunkt", since),
    supabase.from("audit_actions").select("id", { count: "exact", head: true }).in("company_id", ids).neq("status", "closed"),
    supabase.from("audit_reviews").select("id", { count: "exact", head: true }).in("company_id", ids).eq("status", "closed"),
    supabase.from("mission_risk_assessments").select("id", { count: "exact", head: true }).in("company_id", ids).gte("created_at", since),
    supabase.from("missions").select("checklist_completed_ids").in("company_id", ids).gte("tidspunkt", since),
    supabase.from("documents").select("id", { count: "exact", head: true }).in("company_id", ids).lte("gyldig_til", in30),
    supabase.from("personnel_competencies").select("id, profile_id").in("profile_id", []).lte("utloper_dato", in60), // replaced below via count
    supabase.from("drones").select("id", { count: "exact", head: true }).in("company_id", ids).eq("aktiv", true).lt("neste_inspeksjon", today),
    supabase.from("drones").select("id", { count: "exact", head: true }).in("company_id", ids).eq("aktiv", true).lte("neste_inspeksjon", in30),
    supabase.from("audit_findings").select("id", { count: "exact", head: true }).in("company_id", ids).neq("status", "closed"),
    supabase.from("audit_findings").select("id", { count: "exact", head: true }).in("company_id", ids).neq("status", "closed").eq("severity", "critical"),
    supabase.from("audit_reviews").select("id", { count: "exact", head: true }).in("company_id", ids).eq("status", "planned"),
  ]);

  const completedChecklists12mo = (missionsChkRes.data ?? []).reduce(
    (sum: number, row: any) => sum + (Array.isArray(row.checklist_completed_ids) ? row.checklist_completed_ids.length : 0),
    0,
  );

  // Competencies expiring within 60d — need to scope by company_id via profiles join.
  const { data: compExpiring } = await supabase
    .from("personnel_competencies")
    .select("id, profiles!inner(company_id)")
    .in("profiles.company_id", ids)
    .lte("utloper_dato", in60)
    .gte("utloper_dato", today);
  const competenciesExpiring60d = (compExpiring ?? []).length;

  // Distinct pilots with at least one expiring competency
  const pilotsWithExpiringSoonSet = new Set<string>();
  const { data: pilotExpiring } = await supabase
    .from("personnel_competencies")
    .select("profile_id, profiles!inner(company_id)")
    .in("profiles.company_id", ids)
    .lte("utloper_dato", in60)
    .gte("utloper_dato", today);
  for (const r of (pilotExpiring ?? []) as any[]) {
    if (r.profile_id) pilotsWithExpiringSoonSet.add(r.profile_id);
  }

  return {
    activePilots: pilotsRes.count ?? 0,
    activeDrones: dronesRes.count ?? 0,
    flights12mo: flightsRes.count ?? 0,
    incidents12mo: incidentsRes.count ?? 0,
    openActions: openActionsRes.count ?? 0,
    internalAuditsDone: reviewsRes.count ?? 0,
    riskAssessments12mo: raRes.count ?? 0,
    completedChecklists12mo,
    documentsExpiring30d: docsExpRes.count ?? 0,
    competenciesExpiring60d,
    dronesOverdue: dronesOverdueRes.count ?? 0,
    dronesRequiringMaintenance: dronesUpcomingRes.count ?? 0,
    openFindings: openFindingsRes.count ?? 0,
    criticalFindings: criticalFindingsRes.count ?? 0,
    plannedReviews: plannedReviewsRes.count ?? 0,
    pilotsWithExpiringSoon: pilotsWithExpiringSoonSet.size,
  };
}

// ============================================================
// Competencies
// ============================================================
export async function fetchCompetencies(userId: string, companyId: string): Promise<CompetencyRow[]> {
  const ids = await visibleCompanyIds(userId, companyId);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, personnel_competencies(id, type, navn, utloper_dato, varsel_dager)")
    .in("company_id", ids)
    .eq("approved", true);
  if (error) throw error;
  const rows: CompetencyRow[] = [];
  for (const p of (data ?? []) as any[]) {
    for (const c of p.personnel_competencies ?? []) {
      const status = expiryStatus(c.utloper_dato, c.varsel_dager ?? 60);
      rows.push({
        id: c.id,
        profileId: p.id,
        pilotName: p.full_name ?? "—",
        competency: c.navn ?? c.type ?? "—",
        validUntil: c.utloper_dato ?? null,
        daysUntilExpiry: daysUntil(c.utloper_dato),
        status,
      });
    }
  }
  return rows;
}

// ============================================================
// Fleet
// ============================================================
export async function fetchFleet(userId: string, companyId: string): Promise<FleetRow[]> {
  const ids = await visibleCompanyIds(userId, companyId);
  const { data, error } = await supabase
    .from("drones")
    .select("id, modell, registration_number, neste_inspeksjon, varsel_dager")
    .in("company_id", ids)
    .eq("aktiv", true);
  if (error) throw error;
  const drones = (data ?? []) as any[];

  // Fetch open log deviations (merknad/hendelse/reparasjon) per drone in one round-trip.
  const droneIds = drones.map((d) => d.id);
  const twelveMoAgo = iso12moAgo();
  let deviationsByDrone = new Map<string, any[]>();
  let lastInspByDrone = new Map<string, string>();
  if (droneIds.length) {
    const [logsRes, inspRes] = await Promise.all([
      supabase
        .from("drone_log_entries")
        .select("id, drone_id, entry_type, title, description, entry_date")
        .in("drone_id", droneIds)
        .in("entry_type", ["merknad", "hendelse", "reparasjon", "Merknad", "Hendelse", "Reparasjon"])
        .gte("entry_date", twelveMoAgo)
        .order("entry_date", { ascending: false })
        .limit(500),
      supabase
        .from("drone_inspections")
        .select("drone_id, inspection_date")
        .in("drone_id", droneIds)
        .order("inspection_date", { ascending: false })
        .limit(500),
    ]);
    for (const r of (logsRes.data ?? []) as any[]) {
      const arr = deviationsByDrone.get(r.drone_id) ?? [];
      arr.push(r);
      deviationsByDrone.set(r.drone_id, arr);
    }
    for (const r of (inspRes.data ?? []) as any[]) {
      if (!lastInspByDrone.has(r.drone_id)) lastInspByDrone.set(r.drone_id, r.inspection_date);
    }
  }

  return drones.map((d: any) => {
    const devs = deviationsByDrone.get(d.id) ?? [];
    return {
      id: d.id,
      droneName: d.modell ?? "—",
      registration: d.registration_number ?? null,
      service: expiryStatus(d.neste_inspeksjon, d.varsel_dager ?? 30),
      nextInspection: d.neste_inspeksjon ?? null,
      openDeviations: devs.length,
      deviations: devs.slice(0, 10).map((r) => ({
        id: r.id,
        entryType: r.entry_type ?? null,
        title: r.title ?? null,
        description: r.description ?? null,
        entryDate: r.entry_date ?? null,
      })),
      lastInspectionAt: lastInspByDrone.get(d.id) ?? null,
    } satisfies FleetRow;
  });
}


// ============================================================
// Operations
// ============================================================
const PAGE = 1000;

/** Paginate with .range() — Supabase stops at 1000 rows per request. */
async function fetchAllPages<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < arr.length; i += size) r.push(arr.slice(i, i + size));
  return r;
};

const monthKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function fetchOperations(userId: string, companyId: string): Promise<OperationsData> {
  const ids = await visibleCompanyIds(userId, companyId);
  const since = iso12moAgo();
  const now = new Date();
  const activeCutoff = new Date(now.getTime() - ACTIVE_FLIGHT_STALE_HOURS * 3_600_000).toISOString();
  const missionCols = "id, tittel, tidspunkt, slutt_tidspunkt, status, approval_status, approved_at, approved_by, approval_comment";

  const [windowMissions, openMissions, activeFlights, logs, soraRows] = await Promise.all([
    fetchAllPages<MissionLike>((a, b) =>
      supabase.from("missions").select(missionCols).in("company_id", ids).gte("tidspunkt", since).order("id").range(a, b),
    ),
    // All open missions regardless of age
    fetchAllPages<MissionLike>((a, b) =>
      supabase.from("missions").select(missionCols).in("company_id", ids)
        .in("status", [PLANNED_STATUS, IN_PROGRESS_STATUS]).order("id").range(a, b),
    ),
    fetchAllPages<ActiveFlightLike>((a, b) =>
      supabase.from("active_flights").select("id, mission_id, start_time, pilot_name")
        .in("company_id", ids).lt("start_time", activeCutoff).order("id").range(a, b),
    ),
    fetchAllPages<UnplannedFlightLog>((a, b) =>
      (supabase as any).from("flight_logs")
        .select("id, flight_date, start_time_utc, source, mission_id, missions(opprettet_dato)")
        .in("company_id", ids).gte("flight_date", since).order("id").range(a, b),
    ),
    fetchAllPages<{ mission_id: string }>((a, b) =>
      supabase.from("mission_sora").select("mission_id").in("company_id", ids).order("mission_id").range(a, b),
    ),
  ]);

  type MissionRow = MissionLike & { approval_status?: string | null; approved_at?: string | null; approved_by?: string | null; approval_comment?: string | null };
  const windowIds = new Set(windowMissions.map((m) => m.id));
  const missionById = new Map<string, MissionRow>();
  for (const m of [...windowMissions, ...openMissions]) missionById.set(m.id, m);
  const missions = [...missionById.values()];

  // Flown missions (have a flight log) + month of first flight
  const flownMonth = new Map<string, string>();
  for (const l of logs) {
    if (!l.mission_id) continue;
    const raw = l.start_time_utc || l.flight_date;
    const d = raw ? new Date(raw) : null;
    if (!d || isNaN(d.getTime())) continue;
    const k = monthKeyOf(d);
    const prev = flownMonth.get(l.mission_id);
    if (!prev || k < prev) flownMonth.set(l.mission_id, k);
  }
  for (const m of windowMissions) {
    if (m.status === COMPLETED_STATUS && !flownMonth.has(m.id) && m.tidspunkt) {
      flownMonth.set(m.id, monthKeyOf(new Date(m.tidspunkt)));
    }
  }

  // Latest risk assessment per mission (missions in scope + flown)
  const assessIds = [...new Set([...missionById.keys(), ...flownMonth.keys()])];
  type AssessRow = {
    mission_id: string; overall_score: number | null; recommendation: string | null; created_at: string;
    soSail: unknown; soProfile: unknown; aiProfile: unknown; aiSystem: unknown;
  };
  const assessments: AssessRow[] = [];
  for (const part of chunk(assessIds, 200)) {
    const rows = await fetchAllPages<AssessRow>((a, b) =>
      (supabase as any).from("mission_risk_assessments")
        .select("mission_id, overall_score, recommendation, created_at, soSail:sora_output->sail, soProfile:sora_output->soraProfile, aiProfile:ai_analysis->soraProfile, aiSystem:ai_analysis->systemDecisions")
        .in("mission_id", part).order("created_at", { ascending: false }).range(a, b),
    );
    assessments.push(...rows);
  }
  const latest = new Map<string, AssessRow>();
  for (const a of assessments) if (!latest.has(a.mission_id)) latest.set(a.mission_id, a);

  const soraSet = new Set(soraRows.map((r) => r.mission_id));
  const issues: OperationsIssue[] = [];

  for (const m of missions) {
    const stale = staleMissionIssue(m, now);
    if (stale) issues.push(stale);
  }
  for (const f of activeFlights) {
    const title = f.mission_id ? missionById.get(f.mission_id)?.tittel ?? null : null;
    const i = staleActiveFlightIssue(f, title, now);
    if (i) issues.push(i);
  }

  const noGo: { m: MissionRow; state: ReturnType<typeof noGoApprovalState> }[] = [];
  const sora = { assessed: 0, within: 0, deviating: 0, bySail: { I: 0, II: 0, III: 0, IV: 0, V: 0, VI: 0 } as Record<string, number> };
  for (const m of missions) {
    const a = latest.get(m.id);
    if (!a) {
      if (windowIds.has(m.id) && !soraSet.has(m.id)) {
        issues.push({ id: `${m.id}-ra`, missionId: m.id, missionTitle: m.tittel ?? "—", missionDate: m.tidspunkt ?? null, code: "missingRiskAssessment", severity: "warning" });
      }
      continue;
    }
    const profile = readSoraProfile(a.soProfile, a.aiProfile);
    const sail = normalizeSail(a.soSail) ?? normalizeSail(a.aiSystem);
    if (profile?.used) {
      sora.assessed++;
      if (profile.deviations.length > 0) sora.deviating++;
      else sora.within++;
      if (sail) sora.bySail[sail] = (sora.bySail[sail] ?? 0) + 1;
    }
    const env = soraEnvelopeIssue(m, profile, sail, flownMonth.has(m.id));
    if (env) issues.push(env);
    if ((m.status === COMPLETED_STATUS || flownMonth.has(m.id)) && a.recommendation?.toLowerCase() === "no-go") {
      noGo.push({ m, state: noGoApprovalState(m, a.created_at) });
    }
  }

  // Approver names for NO-GO missions
  const approverIds = [...new Set(noGo.map((n) => n.m.approved_by).filter((x): x is string => !!x))];
  const approverName = new Map<string, string>();
  if (approverIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", approverIds);
    for (const p of (profs ?? []) as any[]) approverName.set(p.id, p.full_name ?? "—");
  }
  const approvedNoGo: OperationsData["approvedNoGo"] = [];
  for (const { m, state } of noGo) {
    const by = m.approved_by ? approverName.get(m.approved_by) ?? null : null;
    if (state === "approved") {
      approvedNoGo.push({
        missionId: m.id, missionTitle: m.tittel ?? "—", missionDate: m.tidspunkt ?? null,
        approvedBy: by, approvedAt: m.approved_at ?? null, approvalComment: m.approval_comment ?? null,
      });
    } else {
      issues.push({
        id: `${m.id}-nogo`, missionId: m.id, missionTitle: m.tittel ?? "—", missionDate: m.tidspunkt ?? null,
        code: "flownWithNoGo", severity: "critical",
        approvedBefore: state === "approvedBefore" ? { by, at: m.approved_at ?? null } : null,
      });
    }
  }

  // Unplanned imported flights (shared definition with Status page)
  const monthOrder: string[] = [];
  for (let i = 11; i >= 0; i--) {
    monthOrder.push(monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  const unplanned = summarizeUnplanned(logs, monthKeyOf, monthOrder);
  // Risk distribution on flown missions (shared helper with Status page)
  const assessList = [...latest.values()];
  const labels = { go: { name: "go", scoreRange: "" }, caution: { name: "caution", scoreRange: "" }, "no-go": { name: "no-go", scoreRange: "" }, "not-assessed": { name: "not-assessed", scoreRange: "" } };
  const flownIds = [...flownMonth.keys()];
  const distribution = buildFlownMissionRiskDistribution(flownIds, assessList, labels).map((d) => ({ key: d.key, value: d.value }));
  const byMonth = monthOrder.map((month) => {
    const idsInMonth = flownIds.filter((id) => flownMonth.get(id) === month);
    const d = buildFlownMissionRiskDistribution(idsInMonth, assessList, labels);
    const v = (k: string) => d.find((x) => x.key === k)?.value ?? 0;
    return { month, go: v("go"), caution: v("caution"), noGo: v("no-go"), notAssessed: v("not-assessed") };
  });

  return {
    issues,
    total: missions.length,
    unplanned,
    approvedNoGo,
    sora,
    risk: { distribution, byMonth },
  };
}

// ============================================================
// Safety
// ============================================================
export async function fetchSafety(userId: string, companyId: string): Promise<SafetyAggregate> {
  const ids = await visibleCompanyIds(userId, companyId);
  const since = iso12moAgo();
  const { data, error } = await supabase
    .from("incidents")
    .select("id, kategori, alvorlighetsgrad, hendelsestidspunkt, status, opprettet_dato, oppdatert_dato")
    .in("company_id", ids)
    .gte("hendelsestidspunkt", since);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const reported = rows.length;
  const closedRows = rows.filter((r) => /lukket|closed/i.test(r.status ?? ""));
  const openIncidents = reported - closedRows.length;
  const closedIncidents = closedRows.length;

  // Action stats come from audit_actions.
  const [openActRes, closedActRes] = await Promise.all([
    supabase.from("audit_actions").select("id", { count: "exact", head: true }).in("company_id", ids).neq("status", "closed"),
    supabase.from("audit_actions").select("id, deadline, closed_at", { count: "exact" }).in("company_id", ids).eq("status", "closed"),
  ]);
  const openActions = openActRes.count ?? 0;
  const closedActionsRows = (closedActRes.data ?? []) as any[];
  const closedActions = closedActRes.count ?? closedActionsRows.length;
  const onTime = closedActionsRows.filter(
    (a) => a.deadline && a.closed_at && new Date(a.closed_at) <= new Date(a.deadline),
  ).length;
  const closedOnTimePct = closedActions > 0 ? Math.round((onTime / closedActions) * 100) : null;

  // Avg close days for incidents.
  const days: number[] = [];
  for (const r of closedRows) {
    const opened = new Date(r.opprettet_dato).getTime();
    const closed = new Date(r.oppdatert_dato).getTime();
    if (!Number.isNaN(opened) && !Number.isNaN(closed) && closed >= opened) {
      days.push((closed - opened) / 86400_000);
    }
  }
  const avgCloseDays = days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null;

  // Severity breakdown.
  const sevBucket = new Map<string, number>();
  const catBucket = new Map<string, number>();
  let critical = 0;
  for (const r of rows) {
    const sev = (r.alvorlighetsgrad ?? "ukjent").toString().toLowerCase();
    sevBucket.set(sev, (sevBucket.get(sev) ?? 0) + 1);
    if (sev === "kritisk" || sev === "critical") critical++;
    const cat = (r.kategori ?? "").toString().trim();
    if (cat) catBucket.set(cat, (catBucket.get(cat) ?? 0) + 1);
  }
  const bySeverity = [...sevBucket.entries()]
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => b.count - a.count);
  const byCategory = [...catBucket.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Monthly trend.
  const bucket: Record<string, { incidents: number; critical: number }> = {};
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push(key);
    bucket[key] = { incidents: 0, critical: 0 };
  }
  for (const r of rows) {
    const t = new Date(r.hendelsestidspunkt);
    if (Number.isNaN(t.getTime())) continue;
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
    if (!bucket[key]) continue;
    bucket[key].incidents++;
    const sev = (r.alvorlighetsgrad ?? "").toString().toLowerCase();
    if (sev === "kritisk" || sev === "critical") bucket[key].critical++;
  }
  const trend = months.map((m) => ({
    month: new Date(`${m}-01T00:00:00Z`).toLocaleString(undefined, { month: "short" }),
    incidents: bucket[m].incidents,
    nearMiss: bucket[m].critical, // reuse field so chart renders "critical"
  }));

  return {
    reported,
    critical,
    openIncidents,
    closedIncidents,
    openActions,
    closedActions,
    avgCloseDays,
    closedOnTimePct,
    bySeverity,
    byCategory,
    trend,
    nearMiss: 0,
  };
}


// ============================================================
// Documents
// ============================================================
export async function fetchAuditDocuments(userId: string, companyId: string): Promise<DocumentRow[]> {
  const ids = await visibleCompanyIds(userId, companyId);
  const { data, error } = await supabase
    .from("documents")
    .select("id, tittel, kategori, gyldig_til, varsel_dager_for_utløp, opprettet_av")
    .in("company_id", ids);
  if (error) throw error;
  return (data ?? []).map((d: any) => {
    const status = expiryStatus(d.gyldig_til, d.varsel_dager_for_utløp ?? 30);
    const { complianceClass, complianceRelevance } = classifyDocument(d.tittel ?? "", d.kategori ?? "");
    return {
      id: d.id,
      title: d.tittel ?? "—",
      category: d.kategori ?? "—",
      nextReview: d.gyldig_til ?? null,
      responsible: d.opprettet_av ?? null,
      daysUntilExpiry: daysUntil(d.gyldig_til),
      status,
      complianceClass,
      complianceRelevance,
    } satisfies DocumentRow;
  });
}

// ============================================================
// Persisted audit rows (reviews, findings, actions, dispositions)
// ============================================================
export async function fetchAuditReviews(userId: string, companyId: string) {
  const ids = await visibleCompanyIds(userId, companyId);
  const { data, error } = await supabase
    .from("audit_reviews")
    .select("*, audit_findings(*, audit_actions(*))")
    .in("company_id", ids)
    .order("review_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchDispositions(userId: string, companyId: string) {
  const ids = await visibleCompanyIds(userId, companyId);
  const { data, error } = await supabase
    .from("compliance_finding_dispositions")
    .select("*")
    .in("company_id", ids);
  if (error) throw error;
  return data ?? [];
}

export async function fetchOverdueAuditActions(userId: string, companyId: string) {
  const ids = await visibleCompanyIds(userId, companyId);
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("audit_actions")
    .select("id, description, deadline, status")
    .in("company_id", ids)
    .neq("status", "closed")
    .lt("deadline", today);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, description: r.description, deadline: r.deadline }));
}

export async function fetchFindingsAwaitingVerification(userId: string, companyId: string) {
  const ids = await visibleCompanyIds(userId, companyId);
  const { data, error } = await supabase
    .from("audit_findings")
    .select("id, description, status")
    .in("company_id", ids)
    .eq("status", "in_progress");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, description: r.description }));
}
