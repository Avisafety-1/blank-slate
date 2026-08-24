import { useCallback, useEffect, useRef, useState } from "react";
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
  source: string; // "alle" | "dronelog" | "ardupilot" | "manual"
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
/** Upper bound when scanning logs to derive which filter values actually exist. */
const OPTIONS_SCAN_LIMIT = 3000;

export interface FilterOption {
  id: string;
  label: string;
}

/** Normalises the stored source value into the three buckets shown in the filter. */
const normalizeSource = (source: string | null): string => {
  if (!source || source === "manual") return "manual";
  if (source === "ardupilot") return "ardupilot";
  return "dronelog";
};

export function useFlightLogsList(active: boolean) {
  const { companyId, user } = useAuth();
  const [filters, setFilters] = useState<FlightLogFilters>(DEFAULT_FLIGHT_LOG_FILTERS);
  const [logs, setLogs] = useState<FlightLogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [droneOptions, setDroneOptions] = useState<FilterOption[]>([]);
  const [pilotOptions, setPilotOptions] = useState<FilterOption[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [mineLogIds, setMineLogIds] = useState<string[] | null>(null);

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Flight logs where the current user is listed as personnel (pilot)
  useEffect(() => {
    if (!active || !user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("flight_log_personnel")
        .select("flight_log_id")
        .eq("profile_id", user.id)
        .limit(5000);
      if (cancelled) return;
      setMineLogIds([...new Set((data || []).map((r: any) => r.flight_log_id))] as string[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user?.id]);

  /**
   * Applies the active filters to a flight_logs query.
   * `skip` leaves one dimension out so the option list for that dimension
   * reflects everything still reachable with the other selections.
   */
  const applyFilters = useCallback(
    (query: any, skip?: "drone" | "pilot" | "source") => {
      let q = query.eq("company_id", companyId);

      if (filters.onlyMine && user?.id) {
        q = mineLogIds && mineLogIds.length
          ? q.or(`user_id.eq.${user.id},id.in.(${mineLogIds.join(",")})`)
          : q.eq("user_id", user.id);
      }

      if (skip !== "drone" && filters.droneId !== "alle") q = q.eq("drone_id", filters.droneId);
      if (skip !== "pilot" && filters.pilotId !== "alle") q = q.eq("user_id", filters.pilotId);
      if (skip !== "source" && filters.source !== "alle") {
        q = filters.source === "manual"
          ? q.or("source.is.null,source.eq.manual")
          : q.eq("source", filters.source);
      }

      if (filters.dateFrom) q = q.gte("flight_date", filters.dateFrom);
      if (filters.dateTo) q = q.lte("flight_date", `${filters.dateTo}T23:59:59`);

      if (debouncedSearch) {
        const s = debouncedSearch.replace(/[,%()]/g, " ");
        q = q.or(
          [
            `departure_location.ilike.%${s}%`,
            `landing_location.ilike.%${s}%`,
            `drone_model.ilike.%${s}%`,
            `aircraft_serial.ilike.%${s}%`,
            `notes.ilike.%${s}%`,
          ].join(",")
        );
      }

      return q;
    },
    [companyId, user?.id, mineLogIds, filters, debouncedSearch]
  );

  // Cross-dependent filter options — only values that actually exist in the logs
  useEffect(() => {
    if (!active || !companyId) return;
    if (filters.onlyMine && user?.id && mineLogIds === null) return; // wait for pilot links
    let cancelled = false;

    (async () => {
      const scan = (skip: "drone" | "pilot" | "source", column: string) =>
        applyFilters((supabase as any).from("flight_logs").select(column), skip).limit(OPTIONS_SCAN_LIMIT);

      const [droneRows, pilotRows, sourceRows] = await Promise.all([
        scan("drone", "drone_id"),
        scan("pilot", "user_id"),
        scan("source", "source"),
      ]);
      if (cancelled) return;

      const droneIds = [...new Set((droneRows.data || []).map((r: any) => r.drone_id).filter(Boolean))] as string[];
      const pilotIds = [...new Set((pilotRows.data || []).map((r: any) => r.user_id).filter(Boolean))] as string[];
      const sources = [...new Set((sourceRows.data || []).map((r: any) => normalizeSource(r.source)))];

      const [drones, profiles] = await Promise.all([
        droneIds.length
          ? (supabase as any).from("drones").select("id, modell, serienummer, dji_aircraft_name").in("id", droneIds)
          : Promise.resolve({ data: [] }),
        pilotIds.length
          ? (supabase as any).from("profiles").select("id, full_name").in("id", pilotIds)
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;

      setDroneOptions(
        (drones.data || [])
          .map((d: any) => ({
            id: d.id,
            label: d.dji_aircraft_name
              ? `${d.dji_aircraft_name} (${d.modell || d.serienummer || ""})`
              : `${d.modell || "Drone"}${d.serienummer ? ` (${d.serienummer})` : ""}`,
          }))
          .sort((a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label))
      );
      setPilotOptions(
        (profiles.data || [])
          .filter((p: any) => p.full_name)
          .map((p: any) => ({ id: p.id, label: p.full_name as string }))
          .sort((a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label))
      );
      setSourceOptions(sources as string[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [active, companyId, applyFilters, filters.onlyMine, mineLogIds, user?.id]);

  // Drop selections that are no longer reachable with the current combination
  useEffect(() => {
    setFilters(prev => {
      const next = { ...prev };
      if (next.droneId !== "alle" && droneOptions.length && !droneOptions.some(o => o.id === next.droneId)) next.droneId = "alle";
      if (next.pilotId !== "alle" && pilotOptions.length && !pilotOptions.some(o => o.id === next.pilotId)) next.pilotId = "alle";
      if (next.source !== "alle" && sourceOptions.length && !sourceOptions.includes(next.source)) next.source = "alle";
      return next.droneId === prev.droneId && next.pilotId === prev.pilotId && next.source === prev.source ? prev : next;
    });
  }, [droneOptions, pilotOptions, sourceOptions]);

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
    const pilotMap = new Map<string, string>((profiles.data || []).map((p: any) => [p.id, p.full_name]));
    const missionMap = new Map<string, string>((missions.data || []).map((m: any) => [m.id, m.title]));

    return rows.map((r): FlightLogListItem => ({
      ...r,
      droneLabel: r.drone_id ? droneMap.get(r.drone_id) || r.drone_model : r.drone_model,
      pilotName: r.user_id ? pilotMap.get(r.user_id) || null : null,
      missionName: r.mission_id ? missionMap.get(r.mission_id) || null : null,
    }));
  }, []);

  const requestIdRef = useRef(0);

  const fetchLogs = useCallback(
    async (offset: number, replace: boolean) => {
      if (!companyId) return;
      if (filters.onlyMine && user?.id && mineLogIds === null) return;
      if (replace) setLoading(true);
      else setLoadingMore(true);

      const reqId = ++requestIdRef.current;
      const { data, error } = await applyFilters(
        (supabase as any).from("flight_logs").select(FLIGHT_LOG_LIST_COLUMNS)
      )
        .order("flight_date", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (reqId !== requestIdRef.current) return;

      if (error) {
        console.error("Error fetching flight logs:", error);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const rows = (data || []) as FlightLogListItem[];
      setHasMore(rows.length === PAGE_SIZE);
      const enriched = await enrich(rows);
      if (reqId !== requestIdRef.current) return;
      setLogs(prev => (replace ? enriched : [...prev, ...enriched]));
      setLoading(false);
      setLoadingMore(false);
    },
    [companyId, user?.id, filters.onlyMine, mineLogIds, applyFilters, enrich]
  );

  useEffect(() => {
    if (!active) return;
    fetchLogs(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, companyId, mineLogIds, filters.onlyMine, filters.droneId, filters.pilotId, filters.source, filters.dateFrom, filters.dateTo, debouncedSearch]);

  return {
    logs,
    loading,
    loadingMore,
    hasMore,
    filters,
    setFilters,
    droneOptions,
    pilotOptions,
    sourceOptions,
    loadMore: () => fetchLogs(logs.length, false),
    refresh: () => fetchLogs(0, true),
  };
}
