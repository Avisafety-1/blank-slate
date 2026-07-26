import { supabase } from "@/integrations/supabase/client";
import { expiryStatus, daysUntil, monthsAgo } from "../utils/dates";
import type {
  AuditKpis,
  CompetencyRow,
  DocumentRow,
  FleetRow,
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
// KPIs
// ============================================================
export async function fetchAuditKpis(userId: string, companyId: string): Promise<AuditKpis> {
  const ids = await visibleCompanyIds(userId, companyId);
  const since = iso12moAgo();

  const [
    pilotsRes,
    dronesRes,
    flightsRes,
    incidentsRes,
    openActionsRes,
    reviewsRes,
    raRes,
    missionsChkRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("company_id", ids).eq("approved", true),
    supabase.from("drones").select("id", { count: "exact", head: true }).in("company_id", ids).eq("aktiv", true),
    supabase.from("flight_logs").select("id", { count: "exact", head: true }).in("company_id", ids).gte("flight_date", iso12moAgoDate()),
    supabase.from("incidents").select("id", { count: "exact", head: true }).in("company_id", ids).gte("hendelsestidspunkt", since),
    supabase.from("audit_actions").select("id", { count: "exact", head: true }).in("company_id", ids).neq("status", "closed"),
    supabase.from("audit_reviews").select("id", { count: "exact", head: true }).in("company_id", ids).eq("status", "closed"),
    supabase.from("mission_risk_assessments").select("id", { count: "exact", head: true }).in("company_id", ids).gte("created_at", since),
    supabase.from("missions").select("checklist_completed_ids").in("company_id", ids).gte("tidspunkt", since),
  ]);

  const completedChecklists12mo = (missionsChkRes.data ?? []).reduce(
    (sum: number, row: any) => sum + (Array.isArray(row.checklist_completed_ids) ? row.checklist_completed_ids.length : 0),
    0,
  );

  return {
    activePilots: pilotsRes.count ?? 0,
    activeDrones: dronesRes.count ?? 0,
    flights12mo: flightsRes.count ?? 0,
    incidents12mo: incidentsRes.count ?? 0,
    openActions: openActionsRes.count ?? 0,
    internalAuditsDone: reviewsRes.count ?? 0,
    riskAssessments12mo: raRes.count ?? 0,
    completedChecklists12mo,
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
  return (data ?? []).map((d: any) => ({
    id: d.id,
    droneName: d.modell ?? "—",
    registration: d.registration_number ?? null,
    service: expiryStatus(d.neste_inspeksjon, d.varsel_dager ?? 30),
    nextInspection: d.neste_inspeksjon ?? null,
    remoteId: "unknown", // schema has no field yet
    firmware: "unknown",
    calibration: "unknown",
    batteryHealth: "unknown",
  }));
}

// ============================================================
// Operations
// ============================================================
export async function fetchOperations(
  userId: string,
  companyId: string,
): Promise<{ issues: OperationsIssue[]; total: number }> {
  const ids = await visibleCompanyIds(userId, companyId);
  const since = iso12moAgo();
  const [missionsRes, soraRes, flightsRes] = await Promise.all([
    supabase
      .from("missions")
      .select("id, tittel, tidspunkt, checklist_ids, checklist_completed_ids, approval_status, company_id")
      .in("company_id", ids)
      .gte("tidspunkt", since),
    supabase.from("mission_sora").select("mission_id").in("company_id", ids),
    supabase
      .from("flight_logs")
      .select("id, mission_id, end_time_utc, flight_date")
      .in("company_id", ids)
      .gte("flight_date", iso12moAgoDate()),
  ]);
  const soraSet = new Set((soraRes.data ?? []).map((r: any) => r.mission_id));
  const flightsByMission = new Map<string, any[]>();
  for (const f of (flightsRes.data ?? []) as any[]) {
    if (!f.mission_id) continue;
    (flightsByMission.get(f.mission_id) ?? flightsByMission.set(f.mission_id, []).get(f.mission_id))!.push(f);
  }

  const missions = (missionsRes.data ?? []) as any[];
  const issues: OperationsIssue[] = [];
  for (const m of missions) {
    const title = m.tittel ?? "—";
    const date = m.tidspunkt ?? null;
    if (!soraSet.has(m.id)) {
      issues.push({ id: `${m.id}-ra`, missionId: m.id, missionTitle: title, missionDate: date, code: "missingRiskAssessment" });
    }
    const req = Array.isArray(m.checklist_ids) ? m.checklist_ids : [];
    const done = Array.isArray(m.checklist_completed_ids) ? m.checklist_completed_ids : [];
    if (req.length > 0 && done.length < req.length) {
      issues.push({ id: `${m.id}-chk`, missionId: m.id, missionTitle: title, missionDate: date, code: "missingChecklist" });
    }
    const flights = flightsByMission.get(m.id) ?? [];
    const openFlight = flights.some((f) => !f.end_time_utc);
    if (openFlight) {
      issues.push({ id: `${m.id}-open`, missionId: m.id, missionTitle: title, missionDate: date, code: "flightNotClosed" });
    }
  }
  return { issues, total: missions.length };
}

// ============================================================
// Safety
// ============================================================
export async function fetchSafety(userId: string, companyId: string): Promise<SafetyAggregate> {
  const ids = await visibleCompanyIds(userId, companyId);
  const since = iso12moAgo();
  const { data, error } = await supabase
    .from("incidents")
    .select("id, kategori, hendelsestidspunkt, status, opprettet_dato, oppdatert_dato")
    .in("company_id", ids)
    .gte("hendelsestidspunkt", since);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const reported = rows.length;
  const nearMiss = rows.filter((r) => /neste/i.test(r.kategori ?? "")).length;
  const closedRows = rows.filter((r) => /lukket|closed/i.test(r.status ?? ""));
  const openActions = rows.length - closedRows.length;
  const closedActions = closedRows.length;
  const days: number[] = [];
  for (const r of closedRows) {
    const opened = new Date(r.opprettet_dato).getTime();
    const closed = new Date(r.oppdatert_dato).getTime();
    if (!Number.isNaN(opened) && !Number.isNaN(closed) && closed >= opened) {
      days.push((closed - opened) / (24 * 60 * 60 * 1000));
    }
  }
  const avgCloseDays = days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null;

  // Monthly trend
  const bucket: Record<string, { incidents: number; nearMiss: number }> = {};
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push(key);
    bucket[key] = { incidents: 0, nearMiss: 0 };
  }
  for (const r of rows) {
    const t = new Date(r.hendelsestidspunkt);
    if (Number.isNaN(t.getTime())) continue;
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
    if (!bucket[key]) continue;
    bucket[key].incidents++;
    if (/neste/i.test(r.kategori ?? "")) bucket[key].nearMiss++;
  }
  const trend = months.map((m) => ({
    month: new Date(`${m}-01T00:00:00Z`).toLocaleString(undefined, { month: "short" }),
    incidents: bucket[m].incidents,
    nearMiss: bucket[m].nearMiss,
  }));

  return { reported, nearMiss, openActions, closedActions, avgCloseDays, trend };
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
    return {
      id: d.id,
      title: d.tittel ?? "—",
      category: d.kategori ?? "—",
      nextReview: d.gyldig_til ?? null,
      responsible: d.opprettet_av ?? null,
      daysUntilExpiry: daysUntil(d.gyldig_til),
      status,
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
