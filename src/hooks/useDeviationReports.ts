import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DeviationStatus = "new" | "in_progress" | "closed";

export interface DeviationMissionInfo {
  id: string;
  tittel: string | null;
  lokasjon: string | null;
  tidspunkt: string | null;
  oppdragstype: string | null;
  risk_nivå: string | null;
  status: string | null;
  overall_score: number | null;
  recommendation: string | null;
  sail: string | null;
  drones: string[];
  equipment: string[];
  personnel: string[];
}

export interface DeviationFlightInfo {
  id: string;
  flight_date: string | null;
  flight_duration_minutes: number | null;
  pilot_name: string | null;
}

export interface DeviationReport {
  id: string;
  mission_id: string;
  flight_log_id: string | null;
  company_id: string;
  category_path: string[];
  category_ids: string[];
  comment: string | null;
  flight_phase: string | null;
  created_at: string;
  reported_by: string | null;
  reporter_name: string | null;
  status: DeviationStatus;
  incident_id: string | null;
  incident_requested_at: string | null;
  mission: DeviationMissionInfo | null;
  flight: DeviationFlightInfo | null;
  comment_count: number;
}

const uniq = (arr: (string | null | undefined)[]) =>
  Array.from(new Set(arr.filter(Boolean) as string[]));

export function useDeviationReports(enabled: boolean) {
  const [reports, setReports] = useState<DeviationReport[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("mission_deviation_reports")
        .select(
          "id, mission_id, flight_log_id, company_id, category_path, category_ids, comment, flight_phase, created_at, reported_by, status, incident_id, incident_requested_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      const rows: any[] = data || [];
      if (rows.length === 0) {
        setReports([]);
        return;
      }

      const missionIds = uniq(rows.map((r) => r.mission_id));
      const flightIds = uniq(rows.map((r) => r.flight_log_id));
      const deviationIds = rows.map((r) => r.id);

      const [
        missionsRes,
        riskRes,
        soraRes,
        mdRes,
        meRes,
        mpRes,
        flightsRes,
        commentsRes,
      ] = await Promise.all([
        supabase
          .from("missions")
          .select("id, tittel, lokasjon, tidspunkt, oppdragstype, risk_nivå, status")
          .in("id", missionIds),
        supabase
          .from("mission_risk_assessments")
          .select("mission_id, overall_score, recommendation, created_at")
          .in("mission_id", missionIds),
        (supabase as any)
          .from("mission_sora")
          .select("mission_id, sail, created_at")
          .in("mission_id", missionIds),
        supabase.from("mission_drones").select("mission_id, drone_id").in("mission_id", missionIds),
        supabase.from("mission_equipment").select("mission_id, equipment_id").in("mission_id", missionIds),
        supabase.from("mission_personnel").select("mission_id, profile_id").in("mission_id", missionIds),
        flightIds.length
          ? supabase
              .from("flight_logs")
              .select("id, flight_date, flight_duration_minutes, user_id")
              .in("id", flightIds)
          : Promise.resolve({ data: [] as any[] } as any),
        (supabase as any)
          .from("deviation_report_comments")
          .select("deviation_id")
          .in("deviation_id", deviationIds),
      ]);

      const droneIds = uniq((mdRes.data || []).map((r: any) => r.drone_id));
      const equipmentIds = uniq((meRes.data || []).map((r: any) => r.equipment_id));
      const profileIds = uniq([
        ...rows.map((r) => r.reported_by),
        ...(mpRes.data || []).map((r: any) => r.profile_id),
        ...((flightsRes as any).data || []).map((r: any) => r.user_id),
      ]);

      const [dronesRes, equipRes, profilesRes] = await Promise.all([
        droneIds.length
          ? supabase.from("drones").select("id, modell, serienummer").in("id", droneIds)
          : Promise.resolve({ data: [] as any[] } as any),
        equipmentIds.length
          ? supabase.from("equipment").select("id, navn").in("id", equipmentIds)
          : Promise.resolve({ data: [] as any[] } as any),
        profileIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      const nameById: Record<string, string> = Object.fromEntries(
        ((profilesRes as any).data || []).map((p: any) => [p.id, p.full_name]),
      );
      const droneById: Record<string, string> = Object.fromEntries(
        ((dronesRes as any).data || []).map((d: any) => [
          d.id,
          d.serienummer ? `${d.modell} (${d.serienummer})` : d.modell,
        ]),
      );
      const equipById: Record<string, string> = Object.fromEntries(
        ((equipRes as any).data || []).map((e: any) => [e.id, e.navn]),
      );

      const riskByMission: Record<string, any> = {};
      for (const r of (riskRes as any).data || []) {
        const prev = riskByMission[r.mission_id];
        if (!prev || new Date(r.created_at) > new Date(prev.created_at)) riskByMission[r.mission_id] = r;
      }
      const soraByMission: Record<string, any> = {};
      for (const s of (soraRes as any).data || []) {
        const prev = soraByMission[s.mission_id];
        if (!prev || new Date(s.created_at) > new Date(prev.created_at)) soraByMission[s.mission_id] = s;
      }

      const groupBy = (arr: any[], key: string, valueKey: string, lookup: Record<string, string>) => {
        const out: Record<string, string[]> = {};
        for (const row of arr || []) {
          const label = lookup[row[valueKey]];
          if (!label) continue;
          (out[row[key]] ??= []).push(label);
        }
        return out;
      };

      const dronesByMission = groupBy((mdRes as any).data || [], "mission_id", "drone_id", droneById);
      const equipByMission = groupBy((meRes as any).data || [], "mission_id", "equipment_id", equipById);
      const personnelByMission = groupBy((mpRes as any).data || [], "mission_id", "profile_id", nameById);

      const missionById: Record<string, DeviationMissionInfo> = {};
      for (const m of (missionsRes as any).data || []) {
        missionById[m.id] = {
          id: m.id,
          tittel: m.tittel,
          lokasjon: m.lokasjon,
          tidspunkt: m.tidspunkt,
          oppdragstype: m.oppdragstype,
          risk_nivå: (m as any)["risk_nivå"] ?? null,
          status: m.status,
          overall_score: riskByMission[m.id]?.overall_score ?? null,
          recommendation: riskByMission[m.id]?.recommendation ?? null,
          sail: soraByMission[m.id]?.sail ?? null,
          drones: dronesByMission[m.id] || [],
          equipment: equipByMission[m.id] || [],
          personnel: personnelByMission[m.id] || [],
        };
      }

      const flightById: Record<string, DeviationFlightInfo> = Object.fromEntries(
        (((flightsRes as any).data || []) as any[]).map((f) => [
          f.id,
          {
            id: f.id,
            flight_date: f.flight_date,
            flight_duration_minutes: f.flight_duration_minutes,
            pilot_name: f.user_id ? nameById[f.user_id] ?? null : null,
          },
        ]),
      );

      const commentCounts: Record<string, number> = {};
      for (const c of ((commentsRes as any).data || []) as any[]) {
        commentCounts[c.deviation_id] = (commentCounts[c.deviation_id] || 0) + 1;
      }

      setReports(
        rows.map((r) => ({
          ...r,
          category_path: r.category_path || [],
          category_ids: r.category_ids || [],
          status: (r.status as DeviationStatus) || "new",
          reporter_name: r.reported_by ? nameById[r.reported_by] ?? null : null,
          mission: missionById[r.mission_id] ?? null,
          flight: r.flight_log_id ? flightById[r.flight_log_id] ?? null : null,
          comment_count: commentCounts[r.id] || 0,
        })),
      );
    } catch (err) {
      console.error("[useDeviationReports] fetch error", err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchReports();
  }, [enabled, fetchReports]);

  return { reports, loading, refetch: fetchReports, setReports };
}
