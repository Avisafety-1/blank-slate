import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { getPilotFlightLogIds } from "@/lib/pilotFlightLogs";



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
  companyName?: string | null;
}

export interface FlightLogFilters {
  onlyMine: boolean;
  search: string;
  droneId: string; // "alle" | uuid
  pilotId: string; // "alle" | uuid
  source: string; // "alle" | "dronelog" | "ardupilot" | "manual"
  companyId: string; // "alle" | uuid
  dateFrom: string; // yyyy-mm-dd | ""
  dateTo: string;
}

export const DEFAULT_FLIGHT_LOG_FILTERS: FlightLogFilters = {
  onlyMine: true,
  search: "",
  droneId: "alle",
  pilotId: "alle",
  source: "alle",
  companyId: "alle",
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
  const { isAdmin } = useRoleCheck();
  const [filters, setFilters] = useState<FlightLogFilters>(DEFAULT_FLIGHT_LOG_FILTERS);
  const [logs, setLogs] = useState<FlightLogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [droneOptions, setDroneOptions] = useState<FilterOption[]>([]);
  const [pilotOptions, setPilotOptions] = useState<FilterOption[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [companyOptions, setCompanyOptions] = useState<FilterOption[]>([]);
  const [mineLogIds, setMineLogIds] = useState<string[] | null>(null);
  // Companies the user may browse logs from: admins see their own department plus
  // sub-departments (same rule the RLS policy uses), regular users only their own.
  const [visibleCompanyIds, setVisibleCompanyIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!active || !companyId || !user?.id) return;
    let cancelled = false;
    (async () => {
      if (!isAdmin) {
        if (!cancelled) setVisibleCompanyIds([companyId]);
        return;
      }
      const { data } = await (supabase.rpc as any)("get_user_visible_company_ids", { _user_id: user.id });
      if (cancelled) return;
      const ids = ((data || []) as any[])
        .map(v => (typeof v === "string" ? v : v?.company_id ?? v?.id))
        .filter(Boolean) as string[];
      setVisibleCompanyIds(ids.length ? [...new Set([companyId, ...ids])] : [companyId]);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, companyId, user?.id, isAdmin]);

  const allowedCompanyIds = useMemo(
    () => visibleCompanyIds ?? (companyId ? [companyId] : []),
    [visibleCompanyIds, companyId]
  );
  const allowedKey = allowedCompanyIds.join(",");


  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Related records (people, drones, missions) matching the free-text search.
  // Resolved separately since flight_logs only stores their ids.
  const [searchMatches, setSearchMatches] = useState<{
    term: string;
    droneIds: string[];
    userIds: string[];
    missionIds: string[];
    logIds: string[];
  }>({ term: "", droneIds: [], userIds: [], missionIds: [], logIds: [] });

  useEffect(() => {
    if (!active || !companyId) return;
    const term = debouncedSearch;
    if (!term) {
      setSearchMatches({ term: "", droneIds: [], userIds: [], missionIds: [], logIds: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      const like = `%${term.replace(/[,%()]/g, " ")}%`;
      const [drones, profiles, missions] = await Promise.all([
        (supabase as any)
          .from("drones")
          .select("id")
          .or(`modell.ilike.${like},serienummer.ilike.${like},dji_aircraft_name.ilike.${like}`)
          .limit(500),
        (supabase as any).from("profiles").select("id").ilike("full_name", like).limit(500),
        (supabase as any)
          .from("missions")
          .select("id")
          .in("company_id", allowedCompanyIds.length ? allowedCompanyIds : [companyId])
          .ilike("title", like)
          .limit(500),

      ]);
      if (cancelled) return;

      const userIds = ((profiles.data || []) as any[]).map(p => p.id);
      let logIds: string[] = [];
      if (userIds.length) {
        const { data } = await (supabase as any)
          .from("flight_log_personnel")
          .select("flight_log_id")
          .in("profile_id", userIds)
          .limit(3000);
        if (cancelled) return;
        logIds = [...new Set(((data || []) as any[]).map(r => r.flight_log_id))];
      }

      setSearchMatches({
        term,
        droneIds: ((drones.data || []) as any[]).map(d => d.id),
        userIds,
        missionIds: ((missions.data || []) as any[]).map(m => m.id),
        logIds,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [active, companyId, debouncedSearch]);

  // Flight logs where the current user is the pilot (personnel link, or owner
  // of a log that has no personnel link at all) — same rule as the logbook/KPI.
  useEffect(() => {
    if (!active || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = await getPilotFlightLogIds(user.id);
        if (!cancelled) setMineLogIds(ids);
      } catch {
        if (!cancelled) setMineLogIds([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user?.id]);

  // Log ids for the pilot selected in the filter (same rule as above)
  const [pilotLogIds, setPilotLogIds] = useState<{ pilotId: string; ids: string[] } | null>(null);
  useEffect(() => {
    if (!active) return;
    if (filters.pilotId === "alle") {
      setPilotLogIds(null);
      return;
    }
    let cancelled = false;
    const pilotId = filters.pilotId;
    (async () => {
      try {
        const ids = await getPilotFlightLogIds(pilotId);
        if (!cancelled) setPilotLogIds({ pilotId, ids });
      } catch {
        if (!cancelled) setPilotLogIds({ pilotId, ids: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, filters.pilotId]);


  /**
   * Applies the active filters to a flight_logs query.
   * `skip` leaves one dimension out so the option list for that dimension
   * reflects everything still reachable with the other selections.
   */
  const applyFilters = useCallback(
    (query: any, skip?: "drone" | "pilot" | "source" | "company") => {
      let q = query;
      if (skip !== "company" && filters.companyId !== "alle") {
        q = q.eq("company_id", filters.companyId);
      } else if (allowedCompanyIds.length) {
        q = q.in("company_id", allowedCompanyIds);
      }

      if (filters.onlyMine && user?.id) {
        q = mineLogIds && mineLogIds.length
          ? q.in("id", mineLogIds)
          : q.eq("id", "00000000-0000-0000-0000-000000000000");
      }

      if (skip !== "drone" && filters.droneId !== "alle") q = q.eq("drone_id", filters.droneId);
      if (skip !== "pilot" && filters.pilotId !== "alle") {
        const ids = pilotLogIds?.pilotId === filters.pilotId ? pilotLogIds.ids : [];
        q = ids.length ? q.in("id", ids) : q.eq("id", "00000000-0000-0000-0000-000000000000");
      }


      if (skip !== "source" && filters.source !== "alle") {
        // Stored values vary ("dronelogapi", "dji", ...), so the DJI bucket is
        // "everything that is not manual/ardupilot" — mirroring normalizeSource().
        if (filters.source === "manual") {
          q = q.or("source.is.null,source.eq.manual");
        } else if (filters.source === "ardupilot") {
          q = q.eq("source", "ardupilot");
        } else {
          q = q.not("source", "is", null).not("source", "in", '("manual","ardupilot")');
        }
      }

      if (filters.dateFrom) q = q.gte("flight_date", filters.dateFrom);
      if (filters.dateTo) q = q.lte("flight_date", `${filters.dateTo}T23:59:59`);

      if (debouncedSearch) {
        const s = debouncedSearch.replace(/[,%()]/g, " ");
        const m = searchMatches.term === debouncedSearch ? searchMatches : null;
        const clauses = [
          `departure_location.ilike.%${s}%`,
          `landing_location.ilike.%${s}%`,
          `drone_model.ilike.%${s}%`,
          `aircraft_serial.ilike.%${s}%`,
          `notes.ilike.%${s}%`,
        ];
        if (m?.droneIds.length) clauses.push(`drone_id.in.(${m.droneIds.join(",")})`);
        if (m?.userIds.length) clauses.push(`user_id.in.(${m.userIds.join(",")})`);
        if (m?.missionIds.length) clauses.push(`mission_id.in.(${m.missionIds.join(",")})`);
        if (m?.logIds.length) clauses.push(`id.in.(${m.logIds.join(",")})`);
        q = q.or(clauses.join(","));
      }

      return q;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyId, allowedKey, user?.id, mineLogIds, pilotLogIds, filters, debouncedSearch, searchMatches]

  );


  // Cross-dependent filter options — only values that actually exist in the logs
  useEffect(() => {
    if (!active || !companyId) return;
    if (filters.onlyMine && user?.id && mineLogIds === null) return; // wait for pilot links
    let cancelled = false;

    (async () => {
      const scan = (skip: "drone" | "pilot" | "source" | "company", column: string) =>
        applyFilters((supabase as any).from("flight_logs").select(column), skip).limit(OPTIONS_SCAN_LIMIT);

      const [droneRows, pilotScan, sourceRows, companyRows] = await Promise.all([
        scan("drone", "drone_id"),
        scan("pilot", "id, user_id"),
        scan("source", "source"),
        allowedCompanyIds.length > 1 ? scan("company", "company_id") : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;

      const droneIds = [...new Set((droneRows.data || []).map((r: any) => r.drone_id).filter(Boolean))] as string[];

      // Pilot = the person linked in flight_log_personnel; the owner (user_id)
      // only counts when the log has no personnel link at all.
      const scanRows = (pilotScan.data || []) as any[];
      const logIds = scanRows.map(r => r.id);
      const pilotIdSet = new Set<string>();
      const logsWithPilot = new Set<string>();
      for (let i = 0; i < logIds.length; i += 500) {
        const { data: links } = await (supabase as any)
          .from("flight_log_personnel")
          .select("flight_log_id, profile_id")
          .in("flight_log_id", logIds.slice(i, i + 500));
        if (cancelled) return;
        for (const l of links || []) {
          logsWithPilot.add(l.flight_log_id);
          if (l.profile_id) pilotIdSet.add(l.profile_id);
        }
      }
      for (const r of scanRows) {
        if (r.user_id && !logsWithPilot.has(r.id)) pilotIdSet.add(r.user_id);
      }
      const pilotIds = [...pilotIdSet];
      const sources = [...new Set((sourceRows.data || []).map((r: any) => normalizeSource(r.source)))];
      const companyIds = [...new Set((companyRows.data || []).map((r: any) => r.company_id).filter(Boolean))] as string[];


      const [drones, profiles, companies] = await Promise.all([
        droneIds.length
          ? (supabase as any).from("drones").select("id, modell, serienummer, dji_aircraft_name").in("id", droneIds)
          : Promise.resolve({ data: [] }),
        pilotIds.length
          ? (supabase as any).from("profiles").select("id, full_name").in("id", pilotIds)
          : Promise.resolve({ data: [] }),
        companyIds.length
          ? (supabase as any).from("companies").select("id, navn").in("id", companyIds)
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
      setCompanyOptions(
        (companies.data || [])
          .map((c: any) => ({ id: c.id, label: c.navn as string }))
          .sort((a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label))
      );
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, companyId, allowedKey, applyFilters, filters.onlyMine, mineLogIds, user?.id]);

  // Drop selections that are no longer reachable with the current combination
  useEffect(() => {
    setFilters(prev => {
      const next = { ...prev };
      if (next.droneId !== "alle" && droneOptions.length && !droneOptions.some(o => o.id === next.droneId)) next.droneId = "alle";
      if (next.pilotId !== "alle" && pilotOptions.length && !pilotOptions.some(o => o.id === next.pilotId)) next.pilotId = "alle";
      if (next.source !== "alle" && sourceOptions.length && !sourceOptions.includes(next.source)) next.source = "alle";
      if (next.companyId !== "alle" && companyOptions.length && !companyOptions.some(o => o.id === next.companyId)) next.companyId = "alle";
      return next.droneId === prev.droneId && next.pilotId === prev.pilotId && next.source === prev.source && next.companyId === prev.companyId
        ? prev
        : next;
    });
  }, [droneOptions, pilotOptions, sourceOptions, companyOptions]);


  const enrich = useCallback(async (rows: FlightLogListItem[]) => {
    const droneIds = [...new Set(rows.map(r => r.drone_id).filter(Boolean))] as string[];
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[];
    const missionIds = [...new Set(rows.map(r => r.mission_id).filter(Boolean))] as string[];
    const rowCompanyIds = [...new Set(rows.map(r => r.company_id).filter(Boolean))] as string[];

    const [drones, profiles, missions, companies] = await Promise.all([
      droneIds.length
        ? (supabase as any).from("drones").select("id, modell, serienummer, dji_aircraft_name").in("id", droneIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? (supabase as any).from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
      missionIds.length
        ? (supabase as any).from("missions").select("id, title").in("id", missionIds)
        : Promise.resolve({ data: [] }),
      rowCompanyIds.length > 1
        ? (supabase as any).from("companies").select("id, navn").in("id", rowCompanyIds)
        : Promise.resolve({ data: [] }),
    ]);

    const droneMap = new Map<string, string>();
    (drones.data || []).forEach((d: any) => {
      const base = d.modell || d.serienummer || "Drone";
      droneMap.set(d.id, d.dji_aircraft_name ? `${d.dji_aircraft_name} · ${base}` : base);
    });
    const pilotMap = new Map<string, string>((profiles.data || []).map((p: any) => [p.id, p.full_name]));
    const missionMap = new Map<string, string>((missions.data || []).map((m: any) => [m.id, m.title]));
    const companyMap = new Map<string, string>((companies.data || []).map((c: any) => [c.id, c.navn]));

    return rows.map((r): FlightLogListItem => ({
      ...r,
      droneLabel: r.drone_id ? droneMap.get(r.drone_id) || r.drone_model : r.drone_model,
      pilotName: r.user_id ? pilotMap.get(r.user_id) || null : null,
      missionName: r.mission_id ? missionMap.get(r.mission_id) || null : null,
      companyName: companyMap.get(r.company_id) || null,
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
  }, [active, companyId, allowedKey, mineLogIds, filters.onlyMine, filters.droneId, filters.pilotId, filters.source, filters.companyId, filters.dateFrom, filters.dateTo, debouncedSearch, searchMatches]);

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
    companyOptions,
    multiCompany: allowedCompanyIds.length > 1,
    loadMore: () => fetchLogs(logs.length, false),
    refresh: () => fetchLogs(0, true),
  };
}

