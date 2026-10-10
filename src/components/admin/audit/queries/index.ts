import { supabase } from "@/integrations/supabase/client";
import { expiryStatus, daysUntil, monthsAgo } from "../utils/dates";
import { resolveCheckBucket } from "../utils/statusMapping";
import { summarizeUnplanned, type UnplannedFlightLog } from "@/lib/unplannedFlights";
import { buildFlownMissionRiskDistribution } from "@/lib/statusRiskDistribution";
import { calculateDroneAggregatedStatus, getDroneStatusReasons, worstStatus } from "@/lib/maintenanceStatus";
import { countUniqueMissionsSinceInspection } from "@/lib/droneInspection";
import { pickLatestRelevantWarning } from "@/lib/resourceWarnings";
import type { Status } from "@/types";
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
  missionWithoutFlightLogIssue,
  requiresRiskAssessment,
  reminderRowsFromMessages,
} from "../lib/operationsAnalysis";
import { matchPossibleLogs, type UnlinkedLog } from "../lib/missingFlightLogs";
import { isAwaitingVerification } from "../lib/auditTemplates";
import type {
  AuditKpis,
  CompetencyRow,
  DocumentRow,
  DocumentComplianceClass,
  DocumentComplianceRelevance,
  FleetRow,
  OperationsData,
  OperationsIssue,
  PossibleFlightLog,
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
    .select("id, full_name, company_id, personnel_competencies(id, type, navn, utloper_dato, varsel_dager)")
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
        companyId: p.company_id ?? null,
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
  // Same inputs as the drone dialog / status page: accessories, linked equipment, drones.status.
  const { data, error } = await supabase
    .from("drones")
    .select(`
      id, modell, registration_number, company_id, status, technical_responsible_id,
      neste_inspeksjon, varsel_dager, sist_inspeksjon, flyvetimer, hours_at_last_inspection,
      inspection_interval_hours, varsel_timer, inspection_interval_missions, varsel_oppdrag,
      companies(navn),
      drone_accessories(navn, neste_vedlikehold, varsel_dager),
      drone_equipment(equipment:equipment_id(id, navn, status, neste_vedlikehold, varsel_dager))
    `)
    .in("company_id", ids)
    .eq("aktiv", true);
  if (error) throw error;
  const drones = (data ?? []) as any[];
  const droneIds = drones.map((d) => d.id);
  const twelveMoAgo = iso12moAgo();

  const deviationsByDrone = new Map<string, any[]>();
  const lastInspByDrone = new Map<string, string>();
  const techName = new Map<string, string>();
  if (droneIds.length) {
    const techIds = [...new Set(drones.map((d) => d.technical_responsible_id).filter(Boolean))] as string[];
    const [logsRes, inspRes, techRes] = await Promise.all([
      supabase
        .from("drone_log_entries")
        .select("id, drone_id, entry_type, title, description, entry_date, created_at")
        .in("drone_id", droneIds)
        .gte("entry_date", twelveMoAgo)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("drone_inspections")
        .select("drone_id, inspection_date")
        .in("drone_id", droneIds)
        .order("inspection_date", { ascending: false })
        .limit(1000),
      techIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", techIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    for (const r of (logsRes.data ?? []) as any[]) {
      const arr = deviationsByDrone.get(r.drone_id) ?? [];
      arr.push(r);
      deviationsByDrone.set(r.drone_id, arr);
    }
    for (const r of (inspRes.data ?? []) as any[]) {
      if (!lastInspByDrone.has(r.drone_id)) lastInspByDrone.set(r.drone_id, r.inspection_date);
    }
    for (const p of (techRes.data ?? []) as any[]) techName.set(p.id, p.full_name ?? "—");
  }

  return Promise.all(drones.map(async (d: any) => {
    const accessories = d.drone_accessories ?? [];
    const linkedEquipment = (d.drone_equipment ?? []).map((l: any) => l.equipment).filter(Boolean);
    const missionsSince = d.inspection_interval_missions
      ? await countUniqueMissionsSinceInspection(d.id, d.sist_inspeksjon)
      : 0;
    const droneInput = {
      neste_inspeksjon: d.neste_inspeksjon,
      varsel_dager: d.varsel_dager,
      flyvetimer: d.flyvetimer,
      hours_at_last_inspection: d.hours_at_last_inspection ?? 0,
      inspection_interval_hours: d.inspection_interval_hours,
      varsel_timer: d.varsel_timer,
      missions_since_inspection: missionsSince,
      inspection_interval_missions: d.inspection_interval_missions,
      varsel_oppdrag: d.varsel_oppdrag,
    };
    const logs = deviationsByDrone.get(d.id) ?? [];
    const dbStatus = ((d.status as Status) || "Grønn") as Status;
    const { status: maint } = calculateDroneAggregatedStatus(droneInput, accessories, linkedEquipment);
    const { reasons } = getDroneStatusReasons({
      drone: droneInput,
      accessories,
      linkedEquipment,
      dbStatus,
      latestWarningTitle: pickLatestRelevantWarning(logs as any)?.title ?? null,
    });
    const status = worstStatus(maint, dbStatus);
    const devs = logs.filter((r) => /^(merknad|hendelse|reparasjon)$/i.test(r.entry_type ?? ""));
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
      companyId: d.company_id ?? null,
      departmentName: d.companies?.navn ?? null,
      status: (status === "Rød" || status === "Gul" ? status : "Grønn") as FleetRow["status"],
      reasons: reasons.map((r) => ({ status: r.status, text: r.text })),
      technicalResponsibleId: d.technical_responsible_id ?? null,
      technicalResponsibleName: d.technical_responsible_id ? techName.get(d.technical_responsible_id) ?? null : null,
    } satisfies FleetRow;
  }));
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

type MissingLogMission = MissionLike & { user_id?: string | null; companies?: { navn?: string | null } | null };

/** Fullført missions (12 mo, ended >48h) with no linked flight log, plus a possible unlinked log. */
async function missingFlightLogIssues(missions: MissingLogMission[], ids: string[], now: Date): Promise<OperationsIssue[]> {
  const candidates = missions.filter((m) => missionWithoutFlightLogIssue(m, false, now));
  if (!candidates.length) return [];
  const candIds = candidates.map((m) => m.id);

  const withLog = new Set<string>();
  const personnel: { mission_id: string; profile_id: string | null }[] = [];
  const missionDrones: { mission_id: string; drone_id: string | null }[] = [];
  for (const part of chunk(candIds, 200)) {
    const [logRows, pRows, dRows] = await Promise.all([
      fetchAllPages<{ mission_id: string }>((a, b) =>
        supabase.from("flight_logs").select("mission_id").in("mission_id", part).order("id").range(a, b)),
      fetchAllPages<{ mission_id: string; profile_id: string | null }>((a, b) =>
        supabase.from("mission_personnel").select("mission_id, profile_id").in("mission_id", part).order("id").range(a, b)),
      fetchAllPages<{ mission_id: string; drone_id: string | null }>((a, b) =>
        supabase.from("mission_drones").select("mission_id, drone_id").in("mission_id", part).order("id").range(a, b)),
    ]);
    for (const r of logRows) withLog.add(r.mission_id);
    personnel.push(...pRows);
    missionDrones.push(...dRows);
  }
  const missing = candidates.filter((m) => !withLog.has(m.id));
  if (!missing.length) return [];

  const pilotsOf = new Map<string, string[]>();
  for (const p of personnel) if (p.profile_id) pilotsOf.set(p.mission_id, [...(pilotsOf.get(p.mission_id) ?? []), p.profile_id]);
  const dronesOf = new Map<string, string[]>();
  for (const d of missionDrones) if (d.drone_id) dronesOf.set(d.mission_id, [...(dronesOf.get(d.mission_id) ?? []), d.drone_id]);

  // Unlinked logs on the same days (any company visible to the user)
  const days = [...new Set(missing.map((m) => (m.tidspunkt ? new Date(m.tidspunkt) : null))
    .filter((d): d is Date => !!d && !isNaN(d.getTime())).map((d) => d.toISOString().slice(0, 10)))];
  let possible = new Map<string, PossibleFlightLog>();
  if (days.length) {
    const minDay = new Date(new Date(days.sort()[0]).getTime() - 86_400_000).toISOString().slice(0, 10);
    const maxDay = new Date(new Date(days[days.length - 1]).getTime() + 86_400_000).toISOString().slice(0, 10);
    const logs = await fetchAllPages<any>((a, b) =>
      (supabase as any).from("flight_logs")
        .select("id, flight_date, start_time_utc, drone_id, user_id, flight_duration_minutes, drones(modell), flight_log_personnel(profile_id)")
        .in("company_id", ids).is("mission_id", null).gte("flight_date", minDay).lte("flight_date", `${maxDay}T23:59:59`)
        .order("id").range(a, b));
    const unlinked: UnlinkedLog[] = logs.map((l) => ({
      id: l.id, flight_date: l.flight_date, start_time_utc: l.start_time_utc, drone_id: l.drone_id, user_id: l.user_id,
      flight_duration_minutes: l.flight_duration_minutes, droneName: l.drones?.modell ?? null,
      pilotIds: (l.flight_log_personnel ?? []).map((p: any) => p.profile_id).filter(Boolean),
    }));
    possible = matchPossibleLogs(
      missing.filter((m) => m.tidspunkt).map((m) => ({ id: m.id, tidspunkt: m.tidspunkt!, droneIds: dronesOf.get(m.id) ?? [], pilotIds: pilotsOf.get(m.id) ?? [] })),
      unlinked,
    );
  }

  const profileIds = [...new Set(missing.flatMap((m) => [...(pilotsOf.get(m.id) ?? []), ...(m.user_id ? [m.user_id] : [])]))];
  const names = new Map<string, string>();
  for (const part of chunk(profileIds, 200)) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", part);
    for (const p of (data ?? []) as any[]) names.set(p.id, p.full_name ?? "—");
  }

  return missing.map((m) => {
    const issue = missionWithoutFlightLogIssue(m, false, now)!;
    const pilotIds = [...new Set(pilotsOf.get(m.id) ?? [])];
    const recipientIds = pilotIds.length ? pilotIds : m.user_id ? [m.user_id] : [];
    return {
      ...issue,
      departmentName: m.companies?.navn ?? null,
      pilots: pilotIds.map((id) => ({ id, name: names.get(id) ?? "—" })),
      recipientIds,
      possibleLog: possible.get(m.id) ?? null,
    };
  });
}

export async function fetchOperations(userId: string, companyId: string): Promise<OperationsData> {
  const ids = await visibleCompanyIds(userId, companyId);
  const since = iso12moAgo();
  const now = new Date();
  const activeCutoff = new Date(now.getTime() - ACTIVE_FLIGHT_STALE_HOURS * 3_600_000).toISOString();
  const missionCols = "id, tittel, tidspunkt, slutt_tidspunkt, status, approval_status, approved_at, approved_by, approval_comment, user_id, company_id, companies(navn)";

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
      supabase.from("active_flights").select("id, mission_id, start_time, pilot_name, company_id")
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
  issues.push(...(await missingFlightLogIssues(windowMissions as MissingLogMission[], ids, now)));

  const noGo: { m: MissionRow; state: ReturnType<typeof noGoApprovalState> }[] = [];
  const sora = { assessed: 0, within: 0, deviating: 0, bySail: { I: 0, II: 0, III: 0, IV: 0, V: 0, VI: 0 } as Record<string, number> };
  for (const m of missions) {
    const a = latest.get(m.id);
    if (!a) {
      if (windowIds.has(m.id) && !soraSet.has(m.id) && requiresRiskAssessment(m.status)) {
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

  // Department of each issue (presentation filter only).
  const flightCompany = new Map(activeFlights.map((f: any) => [f.id, f.company_id ?? null]));
  for (const i of issues) {
    i.companyId = (i.missionId ? (missionById.get(i.missionId) as any)?.company_id : null)
      ?? (i.flightId ? flightCompany.get(i.flightId) : null) ?? null;
  }
  const missionsByCompany: Record<string, number> = {};
  for (const m of missions as any[]) {
    const k = m.company_id ?? "";
    missionsByCompany[k] = (missionsByCompany[k] ?? 0) + 1;
  }

  return {
    issues,
    missionsByCompany,
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
    .select("id, kategori, alvorlighetsgrad, hendelsestidspunkt, status, opprettet_dato, oppdatert_dato, company_id")
    .in("company_id", ids)
    .gte("hendelsestidspunkt", since);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const reported = rows.length;
  const closedRows = rows.filter((r) => /lukket|closed/i.test(r.status ?? ""));
  const openIncidents = reported - closedRows.length;
  const closedIncidents = closedRows.length;

  // Open incidents regardless of age → follow-up issues.
  const openAny = await fetchAllPages<IncidentLike>((a, b) =>
    supabase.from("incidents")
      .select("id, tittel, status, alvorlighetsgrad, hendelsestidspunkt, opprettet_dato, oppfolgingsansvarlig_id, company_id")
      .in("company_id", ids).not("status", "in", "(Lukket,Ferdigbehandlet)").order("id").range(a, b),
  );
  const now = new Date();
  const incidentIssueList = openAny.flatMap((r) =>
    buildIncidentIssues(r, now).map((i) => ({ ...i, companyId: (r as any).company_id ?? null })));
  const byCompany: Record<string, { open: number; closed: number }> = {};
  for (const r of rows) {
    const k = r.company_id ?? "";
    byCompany[k] ??= { open: 0, closed: 0 };
    if (/lukket|closed/i.test(r.status ?? "")) byCompany[k].closed++;
    else byCompany[k].open++;
  }

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
    incidentIssues: incidentIssueList,
    byCompany,
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
    .select("id, tittel, kategori, gyldig_til, varsel_dager_for_utløp, opprettet_av, company_id")
    .in("company_id", ids);
  if (error) throw error;
  return (data ?? []).map((d: any) => {
    const status = expiryStatus(d.gyldig_til, d.varsel_dager_for_utløp ?? 30);
    const { complianceClass, complianceRelevance } = classifyDocument(d.tittel ?? "", d.kategori ?? "");
    return {
      id: d.id,
      title: d.tittel ?? "—",
      companyId: d.company_id ?? null,
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
  const list = ids.join(",");
  const { data, error } = await supabase
    .from("audit_reviews")
    .select("*, audit_sections(*, audit_checklist_items(*)), audit_findings(*, audit_actions(*))")
    .or(`company_id.in.(${list}),audited_company_id.in.(${list})`)
    .order("review_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAuditPersons(userId: string, companyId: string): Promise<{ id: string; full_name: string | null; company_id: string | null }[]> {
  const ids = await visibleCompanyIds(userId, companyId);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, company_id")
    .in("company_id", ids)
    .eq("approved", true)
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as any[];
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
    .select("id, description, deadline, status, company_id")
    .in("company_id", ids)
    .neq("status", "closed")
    .lt("deadline", today);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, description: r.description, deadline: r.deadline, companyId: r.company_id ?? null }));
}

export async function fetchFindingsAwaitingVerification(userId: string, companyId: string) {
  const ids = await visibleCompanyIds(userId, companyId);
  const { data, error } = await supabase
    .from("audit_findings")
    .select("id, description, status, audit_actions(status)")
    .in("company_id", ids)
    .in("status", ["open", "in_progress"]);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => ({
      id: r.id,
      description: r.description,
      status: r.status as string,
      actionStatuses: ((r.audit_actions ?? []) as { status: string }[]).map((a) => a.status),
    }))
    .filter((r) => isAwaitingVerification(r.status, r.actionStatuses));
}

// ============================================================
// Follow-up signals (presentation: "Oppfølgingsgrad")
// ============================================================
export interface FollowUpSignals {
  reminders: { finding_key: string | null; status: string; created_at: string }[];
  dispositions: { finding_code: string; entity_type: string; entity_id: string; disposition: string; reason: string | null; snooze_until: string | null; company_id: string }[];
  registered: { source_scanner_code: string | null; responsible_user_id: string | null; deadline: string | null; status: string }[];
}

/**
 * One row per reminder recipient. Done-status comes from internal_message_recipients
 * (what the inbox shows); undelivered messages without one are ignored.
 */
export async function fetchReminderRows(ids: string[], since?: string): Promise<{ finding_key: string | null; status: string; created_at: string }[]> {
  const rows = await fetchAllPages<any>((a, b) => {
    let q = supabase.from("internal_messages")
      .select("finding_key, status, created_at, internal_message_recipients(status)")
      .in("company_id", ids).not("finding_key", "is", null);
    if (since) q = q.gte("created_at", since);
    return q.order("id").range(a, b);
  });
  return reminderRowsFromMessages(rows);
}

export async function fetchReminderRowsForUser(userId: string, companyId: string) {
  return fetchReminderRows(await visibleCompanyIds(userId, companyId));
}

export async function fetchFollowUpSignals(userId: string, companyId: string): Promise<FollowUpSignals> {
  const ids = await visibleCompanyIds(userId, companyId);
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [rem, disp, reg] = await Promise.all([
    fetchReminderRows(ids, since),
    fetchAllPages<any>((a, b) => supabase.from("compliance_finding_dispositions")
      .select("finding_code, entity_type, entity_id, disposition, reason, snooze_until, company_id").in("company_id", ids).order("id").range(a, b)),
    fetchAllPages<any>((a, b) => supabase.from("audit_findings").select("source_scanner_code, responsible_user_id, deadline, status")
      .in("company_id", ids).not("source_scanner_code", "is", null).neq("status", "closed").order("id").range(a, b)),
  ]);
  return { reminders: rem, dispositions: disp, registered: reg };
}

export async function fetchDepartments(userId: string, companyId: string): Promise<{ id: string; name: string }[]> {
  const ids = await visibleCompanyIds(userId, companyId);
  const { data } = await supabase.from("companies").select("id, navn").in("id", ids);
  return ((data ?? []) as any[]).map((c) => ({ id: c.id, name: c.navn ?? "—" }))
    .sort((a, b) => (a.id === companyId ? -1 : b.id === companyId ? 1 : a.name.localeCompare(b.name)));
}
