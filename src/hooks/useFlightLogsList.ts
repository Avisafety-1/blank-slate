import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const FLIGHT_LOG_LIST_COLUMNS =
  "id, flight_date, flight_duration_minutes, departure_location, landing_location, " +
  "drone_id, drone_model, aircraft_serial, mission_id, user_id, source, entry_source, " +
  "total_distance_m, max_height_m, company_id";

export interface FlightLogListItem {
  id: string;
  flight_date: string;
  flight_duration_minutes: number | null;
  departure_location: string | null;
  landing_location: string | null;
  drone_id: string | null;
  drone_model: string | null;
  aircraft_serial: string | null;
  mission_id: string | null;
  user_id: string | null;
  source: string | null;
  entry_source: string | null;
  total_distance_m: number | null;
  max_height_m: number | null;
  company_id: string;
  droneLabel?: string | null;
  pilotName?: string | null;
  missionName?: string | null;
}

export interface FlightLogFilters {
  onlyMine: boolean;
  search: string;
  droneId: string; // "alle" | uuid
  pilotId: string; // "alle" | uuid
  source: string; // "alle" | "dji" | "ardupilot" | "manual"
  dateFrom: string; // yyyy-mm-dd | ""
  dateTo: string;
}

export const DEFAULT_FLIGHT_LOG_FILTERS: FlightLogFilters = {
  onlyMine: true,
  search: "",
  droneId: "alle",
  pilotId: "alle",
  source: "alle",
  dateFrom: "",
  dateTo: "",
};

const PAGE_SIZE = 30;

export interface FilterOption {
  id: string;
  label: string;
}

export function useFlightLogsList(active: boolean) {
  const { companyId, user } = useAuth();
  const [filters, setFilters] = useState<FlightLogFilters>(DEFAULT_FLIGHT_LOG_FILTERS);
  const [logs, setLogs] = useState<FlightLogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [droneOptions, setDroneOptions] = useState<FilterOption[]>([]);
  const [pilotOptions, setPilotOptions] = useState<FilterOption[]>([]);

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Filter options (drones + pilots in the company)
  useEffect(() => {
    if (!active || !companyId) return;
    let cancelled = false;
    (async () => {
      const [{ data: drones }, { data: profiles }] = await Promise.all([
        (supabase as any)
          .from("drones")
          .select("id, modell, serienummer, dji_aircraft_name")
          .eq("company_id", companyId)
          .order("modell"),
        (supabase as any)
          .from("profiles")
          .select("id, full_name")
          .eq("company_id", companyId)
          .order("full_name"),
      ]);
      if (cancelled) return;
      setDroneOptions(
        (drones || []).map((d: any) => ({
          id: d.id,
          label: d.dji_aircraft_name
            ? `${d.dji_aircraft_name} (${d.modell || d.serienummer || ""})`
            : `${d.modell || "Drone"}${d.serienummer ? ` (${d.serienummer})` : ""}`,
        }))
      );
      setPilotOptions(
        (profiles || [])
          .filter((p: any) => p.full_name)
          .map((p: any) => ({ id: p.id, label: p.full_name }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [active, companyId]);

  const enrich = useCallback(async (rows: FlightLogListItem[]) => {
    const droneIds = [...new Set(rows.map(r => r.drone_id).filter(Boolean))] as string[];
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[];
    const missionIds = [...new Set(rows.map(r => r.mission_id).filter(Boolean))] as string[];

    const [drones, profiles, missions] = await Promise.all([
      droneIds.length
        ? (supabase as any).from("drones").select("id, modell, serienummer, dji_aircraft_name").in("id", droneIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? (supabase as any).from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
      missionIds.length
        ? (supabase as any).from("missions").select("id, title").in("id", missionIds)
        : Promise.resolve({ data: [] }),
    ]);

    const droneMap = new Map<string, string>();
    (drones.data || []).forEach((d: any) => {
      const base = d.modell || d.serienummer || "Drone";
      droneMap.set(d.id, d.dji_aircraft_name ? `${d.dji_aircraft_name} · ${base}` : base);
    });
    const pilotMap = new Map((profiles.data || []).map((p: any) => [p.id, p.full_name]));
    const missionMap = new Map((missions.data || []).map((m: any) => [m.id, m.title]));

    return rows.map(r => ({
      ...r,
      droneLabel: r.drone_id ? droneMap.get(r.drone_id) || r.drone_model : r.drone_model,
      pilotName: r.user_id ? pilotMap.get(r.user_id) || null : null,
      missionName: r.mission_id ? missionMap.get(r.mission_id) || null : null,
    }));
  }, []);

  const fetchLogs = useCallback(
    async (offset: number, replace: boolean) => {
      if (!companyId) return;
      if (replace) setLoading(true);
      else setLoadingMore(true);

      let query = (supabase as any)
        .from("flight_logs")
        .select(FLIGHT_LOG_LIST_COLUMNS)
        .eq("company_id", companyId);

      if (filters.onlyMine && user?.id) {
        const { data: personnelRows } = await (supabase as any)
          .from("flight_log_personnel")
          .select("flight_log_id")
          .eq("profile_id", user.id)
          .limit(2000);
        const ids = [...new Set((personnelRows || []).map((r: any) => r.flight_log_id))] as string[];
        query = ids.length
          ? query.or(`user_id.eq.${user.id},id.in.(${ids.join(",")})`)
          : query.eq("user_id", user.id);
      }

      if (filters.droneId !== "alle") query = query.eq("drone_id", filters.droneId);
      if (filters.pilotId !== "alle") query = query.eq("user_id", filters.pilotId);
      if (filters.source === "manual") {
        query = query.or("source.is.null,source.eq.manual");
      } else if (filters.source !== "alle") {
        query = query.eq("source", filters.source);
      }
      if (filters.dateFrom) query = query.gte("flight_date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("flight_date", `${filters.dateTo}T23:59:59`);

      if (debouncedSearch) {
        const s = debouncedSearch.replace(/[,%()]/g, " ");
        query = query.or(
          [
            `departure_location.ilike.%${s}%`,
            `landing_location.ilike.%${s}%`,
            `drone_model.ilike.%${s}%`,
            `aircraft_serial.ilike.%${s}%`,
            `notes.ilike.%${s}%`,
          ].join(",")
        );
      }

      const { data, error } = await query
        .order("flight_date", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error("Error fetching flight logs:", error);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const rows = (data || []) as FlightLogListItem[];
      setHasMore(rows.length === PAGE_SIZE);
      const enriched = await enrich(rows);
      setLogs(prev => (replace ? enriched : [...prev, ...enriched]));
      setLoading(false);
      setLoadingMore(false);
    },
    [companyId, user?.id, filters, debouncedSearch, enrich]
  );

  useEffect(() => {
    if (!active) return;
    fetchLogs(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, companyId, filters.onlyMine, filters.droneId, filters.pilotId, filters.source, filters.dateFrom, filters.dateTo, debouncedSearch]);

  return {
    logs,
    loading,
    loadingMore,
    hasMore,
    filters,
    setFilters,
    droneOptions,
    pilotOptions,
    loadMore: () => fetchLogs(logs.length, false),
    refresh: () => fetchLogs(0, true),
  };
}
