import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtimeChannel";
import { useAuth } from "@/contexts/AuthContext";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { parseKmlOrKmz } from "@/lib/kmlImport";
import { toast } from "sonner";
import { invokeEmailFunction } from "@/lib/emailInvoke";

type Mission = any;

export interface MissionFilters {
  customerId: string;
  pilotId: string;
  droneId: string;
}

export interface MissionFilterOptions {
  customers: { id: string; navn: string }[];
  pilots: { id: string; full_name: string }[];
  drones: { id: string; modell: string; serienummer: string | null }[];
}

const PAGE_SIZE = 10;


export const useOppdragData = () => {
  const { user, loading, companyId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeMissions, setActiveMissions] = useState<Mission[]>([]);
  const [completedMissions, setCompletedMissions] = useState<Mission[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(true);
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [filterTab, setFilterTab] = useState<"active" | "completed">("active");

  // Server-side search state
  const [searchResults, setSearchResults] = useState<Mission[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchActive, setSearchActive] = useState(false);

  // Pagination
  const [hasMoreActive, setHasMoreActive] = useState(true);
  const [hasMoreCompleted, setHasMoreCompleted] = useState(true);

  // Server-side filters (all missions, not just loaded page)
  const [filters, setFilters] = useState<MissionFilters>({ customerId: 'alle', pilotId: 'alle', droneId: 'alle' });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [filterOptions, setFilterOptions] = useState<MissionFilterOptions>({ customers: [], pilots: [], drones: [] });
  const lastSearchQueryRef = useRef<string>("");


  // KML import state
  const [kmlImportMissionId, setKmlImportMissionId] = useState<string | null>(null);
  const [importingKml, setImportingKml] = useState(false);
  const [replaceRouteConfirmOpen, setReplaceRouteConfirmOpen] = useState(false);
  const [pendingKmlFile, setPendingKmlFile] = useState<File | null>(null);
  const kmlInputRef = useRef<HTMLInputElement>(null);

  // Computed
  const missions = searchActive ? searchResults : (filterTab === 'active' ? activeMissions : completedMissions);
  const isLoading = searchActive ? isSearching : (filterTab === 'active' ? isLoadingActive : isLoadingCompleted);
  const hasMoreData = searchActive ? false : (filterTab === 'active' ? hasMoreActive : hasMoreCompleted);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user && navigator.onLine) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // Initial load — kun aktiv-tab. Fullført lastes lazy ved tab-bytte.
  const completedLoadedRef = useRef(false);
  useEffect(() => {
    if (companyId) {
      fetchMissionsForTab('active', 0, PAGE_SIZE, false);
    }
  }, [companyId]);

  // Lazy-load completed first time user opens that tab
  useEffect(() => {
    if (filterTab === 'completed' && companyId && !completedLoadedRef.current) {
      completedLoadedRef.current = true;
      fetchMissionsForTab('completed', 0, PAGE_SIZE, false);
    }
  }, [filterTab, companyId]);

  // Load filter options for the active tab (only customers/pilots/drones with missions in that tab)
  useEffect(() => {
    if (!companyId) return;
    const cacheKey = `offline_mission_filter_options_${companyId}_${filterTab}`;
    const cached = getCachedData<MissionFilterOptions>(cacheKey);
    if (cached) setFilterOptions(cached);
    if (!navigator.onLine) return;
    (async () => {
      const { data, error } = await supabase.rpc('get_mission_filter_options', { p_tab: filterTab });
      if (error) {
        console.error('Error loading mission filter options:', error);
        return;
      }
      const opts = (data || { customers: [], pilots: [], drones: [] }) as unknown as MissionFilterOptions;
      const normalized: MissionFilterOptions = {
        customers: opts.customers || [],
        pilots: opts.pilots || [],
        drones: opts.drones || [],
      };
      setFilterOptions(normalized);
      setCachedData(cacheKey, normalized);
    })();
  }, [companyId, filterTab]);


  // Refetch from page 0 whenever filters change
  const filtersInitRef = useRef(true);
  useEffect(() => {
    if (!companyId) return;
    if (filtersInitRef.current) {
      filtersInitRef.current = false;
      return;
    }
    setHasMoreActive(true);
    setHasMoreCompleted(true);
    if (filterTab === 'completed') completedLoadedRef.current = true;
    fetchMissionsForTab(filterTab, 0, PAGE_SIZE, false);
    if (searchActive && lastSearchQueryRef.current) {
      searchMissions(lastSearchQueryRef.current, filterTab);
    }
  }, [filters, companyId]);


  // Real-time subscription — refresh KUN den synlige taben (debounce 5s)
  useEffect(() => {
    let debounceTimer: number | null = null;
    const handler = () => {
      if (!navigator.onLine) return;
      if (document.hidden) return; // ikke refresh om bruker ikke ser siden
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        if (filterTab === 'active') {
          const activeCount = Math.max(activeMissions.length, PAGE_SIZE);
          fetchMissionsForTab('active', 0, activeCount, false);
        } else if (completedLoadedRef.current) {
          const completedCount = Math.max(completedMissions.length, PAGE_SIZE);
          fetchMissionsForTab('completed', 0, completedCount, false);
        }
      }, 5000);
    };

    const channel = createUniqueChannel('oppdrag-page-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_personnel' }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_drones' }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flight_logs' }, handler)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [companyId, filterTab, activeMissions.length, completedMissions.length]);

  const hasActiveFilters = (f: MissionFilters) =>
    f.customerId !== 'alle' || f.pilotId !== 'alle' || f.droneId !== 'alle';

  // Resolve mission ids matching pilot/drone filters. Returns null when no such filter is active.
  const getFilteredMissionIds = async (f: MissionFilters): Promise<string[] | null> => {
    let ids: string[] | null = null;

    if (f.pilotId !== 'alle') {
      const { data } = await supabase
        .from('mission_personnel')
        .select('mission_id')
        .eq('profile_id', f.pilotId);
      ids = [...new Set((data || []).map((r: any) => r.mission_id))];
    }

    if (f.droneId !== 'alle') {
      const { data } = await supabase
        .from('mission_drones')
        .select('mission_id')
        .eq('drone_id', f.droneId);
      const droneIds = new Set((data || []).map((r: any) => r.mission_id));
      ids = ids === null ? [...droneIds] : ids.filter((id) => droneIds.has(id));
    }

    return ids;
  };

  const fetchMissionsForTab = async (tab: 'active' | 'completed', offset: number, limit: number, append: boolean) => {
    const setData = tab === 'active' ? setActiveMissions : setCompletedMissions;
    const setLoadingFn = append ? setIsLoadingMore : (tab === 'active' ? setIsLoadingActive : setIsLoadingCompleted);
    const setHasMore = tab === 'active' ? setHasMoreActive : setHasMoreCompleted;
    const activeFilters = filtersRef.current;
    const filtersOn = hasActiveFilters(activeFilters);

    // Show cache on initial load only (never when filtering — cache is unfiltered)
    if (!append && offset === 0 && companyId && !filtersOn) {
      const cached = getCachedData<Mission[]>(`offline_missions_${companyId}_${tab}`);
      if (cached) {
        setData(cached);
        setLoadingFn(false);
      }
    }

    if (!navigator.onLine) {
      setLoadingFn(false);
      return;
    }

    setLoadingFn(true);
    try {
      const relationIds = await getFilteredMissionIds(activeFilters);
      if (relationIds !== null && relationIds.length === 0) {
        setHasMore(false);
        if (!append) setData([]);
        setLoadingFn(false);
        return;
      }

      let query = supabase
        .from("missions")
        .select(`*, customers (id, navn, kontaktperson, telefon, epost), companies:company_id(id, navn)`)
        .order("tidspunkt", { ascending: tab === "active" })
        .range(offset, offset + limit - 1);

      if (tab === "active") {
        query = query.in("status", ["Planlagt", "Pågående"]);
      } else {
        query = query.in("status", ["Fullført", "Avbrutt"]);
      }

      if (activeFilters.customerId !== 'alle') {
        query = query.eq('customer_id', activeFilters.customerId);
      }
      if (relationIds !== null) {
        query = query.in('id', relationIds);
      }

      const { data, error } = await query;
      if (error) throw error;



      const missionsList = data || [];
      setHasMore(missionsList.length >= limit);

      const missionIds = missionsList.map(m => m.id);

      if (missionIds.length === 0) {
        if (append) {
          // No more to append
        } else {
          setData([]);
          if (companyId && !hasActiveFilters(activeFilters)) setCachedData(`offline_missions_${companyId}_${tab}`, []);

        }
        setLoadingFn(false);
        return;
      }

      const [
        personnelRes, dronesRes, equipmentRes, soraRes,
        incidentsRes, risksRes, docsRes, logsRes
      ] = await Promise.all([
        supabase.from("mission_personnel").select("mission_id, profile_id, profiles(id, full_name), role_id, company_mission_roles(id, name)").in("mission_id", missionIds),
        supabase.from("mission_drones").select("mission_id, drone_id, drones(id, modell, serienummer)").in("mission_id", missionIds),
        supabase.from("mission_equipment").select("mission_id, equipment_id, equipment(id, navn, type)").in("mission_id", missionIds),
        supabase.from("mission_sora").select("*").in("mission_id", missionIds),
        supabase.from("incidents").select("*").in("mission_id", missionIds),
        supabase.from("mission_risk_assessments").select("*").in("mission_id", missionIds).order("created_at", { ascending: false }),
        supabase.from("mission_documents").select("mission_id, document_id, documents(id, tittel, beskrivelse, kategori, nettside_url, fil_url, gyldig_til, varsel_dager_for_utløp, versjon, oppdatert_dato)").in("mission_id", missionIds),
        supabase.from("flight_logs").select("id, mission_id, flight_date, flight_duration_minutes, departure_location, landing_location, safesky_mode, completed_checklists, flight_track, user_id, drone_id, source, drone_model, aircraft_serial, total_distance_m, max_distance_m, max_height_m, max_horiz_speed_ms, max_vert_speed_ms, rth_triggered, dronelog_warnings, battery_sn, battery_cycles, battery_health_pct, battery_full_capacity_mah, battery_voltage_min_v, battery_cell_deviation_max_v, battery_temp_min_c, battery_temp_max_c, gps_sat_min, gps_sat_max, drones(id, modell)").in("mission_id", missionIds).order("flight_date", { ascending: false }),
      ]);

      const allFlightLogIds = (logsRes.data || []).map((l: any) => l.id);
      const flightLogPersonnelRes = allFlightLogIds.length > 0
        ? await supabase.from("flight_log_personnel").select("flight_log_id, profile_id, profiles(id, full_name)").in("flight_log_id", allFlightLogIds)
        : { data: [] };

      const uniqueUserIds = [...new Set([
        ...missionsList.map(m => m.user_id).filter(Boolean),
        ...(logsRes.data || []).map((l: any) => l.user_id).filter(Boolean),
      ])] as string[];
      const profilesRes = uniqueUserIds.length > 0
        ? await supabase.from("profiles").select("id, full_name").in("id", uniqueUserIds)
        : { data: [] };


      const groupBy = <T extends Record<string, any>>(arr: T[], key: string): Map<string, T[]> => {
        const map = new Map<string, T[]>();
        for (const item of arr) {
          const k = item[key];
          if (!map.has(k)) map.set(k, []);
          map.get(k)!.push(item);
        }
        return map;
      };

      const personnelMap = groupBy(personnelRes.data || [], "mission_id");
      const dronesMap = groupBy(dronesRes.data || [], "mission_id");
      const equipmentMap = groupBy(equipmentRes.data || [], "mission_id");
      const soraMap = groupBy(soraRes.data || [], "mission_id");
      const incidentsMap = groupBy(incidentsRes.data || [], "mission_id");
      const risksMap = groupBy(risksRes.data || [], "mission_id");
      const docsMap = groupBy(docsRes.data || [], "mission_id");
      const logsMap = groupBy(logsRes.data || [], "mission_id");
      const flpMap = groupBy((flightLogPersonnelRes.data || []) as any[], "flight_log_id");
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.full_name]));

      const missionsWithDetails = missionsList.map((mission) => {
        const missionLogs = (logsMap.get(mission.id) || []).map((log: any) => {
          const pilotEntry = (flpMap.get(log.id) || [])[0];
          const fallbackName = log.user_id ? profileMap.get(log.user_id) : null;
          const pilot = pilotEntry?.profiles || (fallbackName ? { id: log.user_id, full_name: fallbackName } : null);
          return { ...log, pilot };
        });


        const riskEntries = risksMap.get(mission.id) || [];

        return {
          ...mission,
          company_name: mission.companies?.navn || null,
          personnel: personnelMap.get(mission.id) || [],
          drones: dronesMap.get(mission.id) || [],
          equipment: equipmentMap.get(mission.id) || [],
          documents: docsMap.get(mission.id) || [],
          sora: (soraMap.get(mission.id) || [])[0] || null,
          incidents: incidentsMap.get(mission.id) || [],
          flightLogs: missionLogs,
          created_by_name: mission.user_id ? (profileMap.get(mission.user_id) || null) : null,
          aiRisk: riskEntries[0] || null,
        };
      });

      if (append) {
        setData(prev => [...prev, ...missionsWithDetails]);
      } else {
        setData(missionsWithDetails);
        if (companyId && !hasActiveFilters(activeFilters)) setCachedData(`offline_missions_${companyId}_${tab}`, missionsWithDetails);

      }
    } catch (error) {
      console.error("Error fetching missions:", error);
      toast.error("Kunne ikke laste oppdrag");
    } finally {
      setLoadingFn(false);
    }
  };

  const fetchMissions = () => {
    if (filterTab === 'active') {
      const activeCount = Math.max(activeMissions.length, PAGE_SIZE);
      fetchMissionsForTab('active', 0, activeCount, false);
    } else {
      const completedCount = Math.max(completedMissions.length, PAGE_SIZE);
      completedLoadedRef.current = true;
      fetchMissionsForTab('completed', 0, completedCount, false);
    }
  };

  const loadMore = useCallback(() => {
    const tab = filterTab;
    const currentCount = tab === 'active' ? activeMissions.length : completedMissions.length;
    fetchMissionsForTab(tab, currentCount, PAGE_SIZE, true);
  }, [filterTab, activeMissions.length, completedMissions.length, filters]);

  // Server-side search
  const searchMissions = useCallback(async (query: string, tab: 'active' | 'completed') => {
    lastSearchQueryRef.current = query;
    if (!query.trim()) {
      setSearchActive(false);
      setSearchResults([]);
      return;
    }
    setSearchActive(true);
    setIsSearching(true);
    try {
      const activeFilters = filtersRef.current;
      const relationIds = await getFilteredMissionIds(activeFilters);
      if (relationIds !== null && relationIds.length === 0) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      const q = `%${query}%`;
      let dbQuery = supabase
        .from("missions")
        .select(`*, customers (id, navn, kontaktperson, telefon, epost), companies:company_id(id, navn)`)
        .or(`tittel.ilike.${q},lokasjon.ilike.${q},beskrivelse.ilike.${q}`)
        .order("tidspunkt", { ascending: tab === "active" })
        .limit(50);

      if (tab === "active") {
        dbQuery = dbQuery.in("status", ["Planlagt", "Pågående"]);
      } else {
        dbQuery = dbQuery.in("status", ["Fullført", "Avbrutt"]);
      }

      if (activeFilters.customerId !== 'alle') {
        dbQuery = dbQuery.eq('customer_id', activeFilters.customerId);
      }
      if (relationIds !== null) {
        dbQuery = dbQuery.in('id', relationIds);
      }

      const { data, error } = await dbQuery;
      if (error) throw error;


      const missionsList = data || [];
      if (missionsList.length === 0) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      const missionIds = missionsList.map(m => m.id);

      const [
        personnelRes, dronesRes, equipmentRes, soraRes,
        incidentsRes, risksRes, docsRes, logsRes
      ] = await Promise.all([
        supabase.from("mission_personnel").select("mission_id, profile_id, profiles(id, full_name), role_id, company_mission_roles(id, name)").in("mission_id", missionIds),
        supabase.from("mission_drones").select("mission_id, drone_id, drones(id, modell, serienummer)").in("mission_id", missionIds),
        supabase.from("mission_equipment").select("mission_id, equipment_id, equipment(id, navn, type)").in("mission_id", missionIds),
        supabase.from("mission_sora").select("*").in("mission_id", missionIds),
        supabase.from("incidents").select("*").in("mission_id", missionIds),
        supabase.from("mission_risk_assessments").select("*").in("mission_id", missionIds).order("created_at", { ascending: false }),
        supabase.from("mission_documents").select("mission_id, document_id, documents(id, tittel, beskrivelse, kategori, nettside_url, fil_url, gyldig_til, varsel_dager_for_utløp, versjon, oppdatert_dato)").in("mission_id", missionIds),
        supabase.from("flight_logs").select("id, mission_id, flight_date, flight_duration_minutes, departure_location, landing_location, safesky_mode, completed_checklists, flight_track, user_id, drone_id, source, drone_model, aircraft_serial, total_distance_m, max_distance_m, max_height_m, max_horiz_speed_ms, max_vert_speed_ms, rth_triggered, dronelog_warnings, battery_sn, battery_cycles, battery_health_pct, battery_full_capacity_mah, battery_voltage_min_v, battery_cell_deviation_max_v, battery_temp_min_c, battery_temp_max_c, gps_sat_min, gps_sat_max, drones(id, modell)").in("mission_id", missionIds).order("flight_date", { ascending: false }),
      ]);

      const allFlightLogIds = (logsRes.data || []).map((l: any) => l.id);
      const flightLogPersonnelRes = allFlightLogIds.length > 0
        ? await supabase.from("flight_log_personnel").select("flight_log_id, profile_id, profiles(id, full_name)").in("flight_log_id", allFlightLogIds)
        : { data: [] };

      const uniqueUserIds = [...new Set([
        ...missionsList.map(m => m.user_id).filter(Boolean),
        ...(logsRes.data || []).map((l: any) => l.user_id).filter(Boolean),
      ])] as string[];
      const profilesRes = uniqueUserIds.length > 0
        ? await supabase.from("profiles").select("id, full_name").in("id", uniqueUserIds)
        : { data: [] };


      const groupBy = <T extends Record<string, any>>(arr: T[], key: string): Map<string, T[]> => {
        const map = new Map<string, T[]>();
        for (const item of arr) {
          const k = item[key];
          if (!map.has(k)) map.set(k, []);
          map.get(k)!.push(item);
        }
        return map;
      };

      const personnelMap = groupBy(personnelRes.data || [], "mission_id");
      const dronesMap = groupBy(dronesRes.data || [], "mission_id");
      const equipmentMap = groupBy(equipmentRes.data || [], "mission_id");
      const soraMap = groupBy(soraRes.data || [], "mission_id");
      const incidentsMap = groupBy(incidentsRes.data || [], "mission_id");
      const risksMap = groupBy(risksRes.data || [], "mission_id");
      const docsMap = groupBy(docsRes.data || [], "mission_id");
      const logsMap = groupBy(logsRes.data || [], "mission_id");
      const flpMap = groupBy((flightLogPersonnelRes.data || []) as any[], "flight_log_id");
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.full_name]));

      const missionsWithDetails = missionsList.map((mission) => {
        const missionLogs = (logsMap.get(mission.id) || []).map((log: any) => {
          const pilotEntry = (flpMap.get(log.id) || [])[0];
          const fallbackName = log.user_id ? profileMap.get(log.user_id) : null;
          const pilot = pilotEntry?.profiles || (fallbackName ? { id: log.user_id, full_name: fallbackName } : null);
          return { ...log, pilot };
        });

        const riskEntries = risksMap.get(mission.id) || [];
        return {
          ...mission,
          company_name: mission.companies?.navn || null,
          personnel: personnelMap.get(mission.id) || [],
          drones: dronesMap.get(mission.id) || [],
          equipment: equipmentMap.get(mission.id) || [],
          documents: docsMap.get(mission.id) || [],
          sora: (soraMap.get(mission.id) || [])[0] || null,
          incidents: incidentsMap.get(mission.id) || [],
          flightLogs: missionLogs,
          created_by_name: mission.user_id ? (profileMap.get(mission.user_id) || null) : null,
          aiRisk: riskEntries[0] || null,
        };
      });

      setSearchResults(missionsWithDetails);
    } catch (error) {
      console.error("Error searching missions:", error);
      toast.error("Søk feilet");
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchActive(false);
    setSearchResults([]);
  }, []);

  // Handlers
  const handleSubmitForApproval = async (mission: Mission, companySettings?: { require_sora_on_missions?: boolean; require_sora_steps?: number; prevent_self_approval?: boolean }, soraApprovalEnabled?: boolean) => {
    try {
      // Check if SORA is required (only when sora_based_approval is NOT active)
      if (companySettings?.require_sora_on_missions && !soraApprovalEnabled) {
        const { count, error: countError } = await supabase
          .from('mission_risk_assessments')
          .select('id', { count: 'exact', head: true })
          .eq('mission_id', mission.id);

        if (countError) throw countError;

        const requiredSteps = companySettings.require_sora_steps ?? 1;
        if ((count ?? 0) < requiredSteps) {
          toast.error('Gjennomfør SORA først');
          return;
        }
      }

      const { data: approvers, error: approverError } = await supabase
        .rpc('get_mission_approvers', { target_company_id: companyId! });

      if (approverError) throw approverError;

      if (!approvers || approvers.length === 0) {
        toast.error('Ingen i selskapet har rollen som godkjenner. Tildel rollen under Admin-panelet først.');
        return;
      }

      if (companySettings?.prevent_self_approval) {
        const { data: personnel, error: personnelError } = await supabase
          .from('mission_personnel')
          .select('profile_id')
          .eq('mission_id', mission.id);

        if (personnelError) throw personnelError;

        const assignedIds = new Set((personnel || []).map((p: any) => p.profile_id).filter(Boolean));
        const availableApprovers = (approvers || []).filter((a: any) => !assignedIds.has(a.id));

        if (availableApprovers.length === 0) {
          toast.error('Ingen tilgjengelige godkjennere. Alle godkjennere er tilknyttet oppdraget.');
          return;
        }
      }

      const { error } = await supabase
        .from('missions')
        .update({
          approval_status: 'pending_approval',
          submitted_for_approval_at: new Date().toISOString()
        })
        .eq('id', mission.id);

      if (error) throw error;

      try {
        await invokeEmailFunction('send-notification-email', {
          body: {
            type: 'notify_mission_approval',
            companyId,
            mission: {
              id: mission.id,
              tittel: mission.tittel,
              lokasjon: mission.lokasjon,
              tidspunkt: mission.tidspunkt,
              beskrivelse: mission.beskrivelse || '',
            }
          }
        });
      } catch (emailError) {
        console.error('Error sending approval notification:', emailError);
      }

      toast.success('Oppdraget er sendt til godkjenning');
      fetchMissions();
    } catch (error) {
      console.error('Error submitting for approval:', error);
      toast.error('Kunne ikke sende til godkjenning');
    }
  };

  const handleDeleteMission = async (deletingMission: Mission | null) => {
    if (!deletingMission) return;
    
    try {
      await supabase.from('mission_personnel').delete().eq('mission_id', deletingMission.id);
      await supabase.from('mission_equipment').delete().eq('mission_id', deletingMission.id);
      await supabase.from('mission_drones').delete().eq('mission_id', deletingMission.id);
      await supabase.from('mission_sora').delete().eq('mission_id', deletingMission.id);
      
      const { error } = await supabase
        .from('missions')
        .delete()
        .eq('id', deletingMission.id);
      
      if (error) throw error;
      
      toast.success('Oppdraget ble slettet');
      fetchMissions();
    } catch (error) {
      console.error('Error deleting mission:', error);
      toast.error('Kunne ikke slette oppdraget');
    }
  };

  const handleToggleMissionChecklist = async (checklistMission: Mission | null, checklistId: string) => {
    if (!checklistMission) return;
    const existing: string[] = checklistMission.checklist_ids || [];
    const isLinked = existing.includes(checklistId);
    const newIds = isLinked
      ? existing.filter((id: string) => id !== checklistId)
      : [...existing, checklistId];
    const { error } = await supabase
      .from('missions')
      .update({ checklist_ids: newIds })
      .eq('id', checklistMission.id);
    if (error) {
      toast.error('Kunne ikke oppdatere sjekkliste');
      return null;
    }
    fetchMissions();
    return newIds;
  };

  const handleMissionChecklistComplete = async (checklistId: string, executingChecklistMissionId: string | null) => {
    if (!checklistId || !executingChecklistMissionId) return;
    const mission = [...activeMissions, ...completedMissions].find(m => m.id === executingChecklistMissionId);
    const existing: string[] = mission?.checklist_completed_ids || [];
    if (!existing.includes(checklistId)) {
      await supabase.from('missions').update({
        checklist_completed_ids: [...existing, checklistId]
      }).eq('id', executingChecklistMissionId);
    }
    fetchMissions();
  };

  const doImportKml = async (file: File, missionId: string) => {
    setImportingKml(true);
    try {
      const parsed = await parseKmlOrKmz(file);
      const updatePayload: any = { route: parsed };
      const mission = [...activeMissions, ...completedMissions].find(m => m.id === missionId);
      if (mission && !mission.latitude && parsed.coordinates.length > 0) {
        updatePayload.latitude = parsed.coordinates[0].lat;
        updatePayload.longitude = parsed.coordinates[0].lng;
      }
      const { error } = await supabase.from('missions').update(updatePayload).eq('id', missionId);
      if (error) throw error;
      toast.success(`Rute importert: ${parsed.coordinates.length} punkter · ${parsed.totalDistance.toFixed(2)} km`);
      fetchMissions();
    } catch (err: any) {
      toast.error(err?.message || 'Import feilet');
    } finally {
      setImportingKml(false);
      setPendingKmlFile(null);
      setKmlImportMissionId(null);
      if (kmlInputRef.current) kmlInputRef.current.value = '';
    }
  };

  const handleKmlFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !kmlImportMissionId) return;
    const mission = [...activeMissions, ...completedMissions].find(m => m.id === kmlImportMissionId);
    const hasRoute = (mission?.route as any)?.coordinates?.length > 0;
    if (hasRoute) {
      setPendingKmlFile(file);
      setReplaceRouteConfirmOpen(true);
    } else {
      doImportKml(file, kmlImportMissionId);
    }
  };

  return {
    // Auth/loading
    user,
    loading,
    companyId,
    location,
    navigate,

    // Data
    activeMissions,
    completedMissions,
    missions,
    isLoading,
    isLoadingMore,
    hasMoreData,
    filterTab,
    setFilterTab,

    // Filters
    filters,
    setFilters,
    filterOptions,


    // Actions
    fetchMissions,
    loadMore,
    searchMissions,
    clearSearch,
    searchActive,
    isSearching,
    searchResults,
    handleSubmitForApproval,
    handleDeleteMission,
    handleToggleMissionChecklist,
    handleMissionChecklistComplete,

    // KML
    kmlImportMissionId,
    setKmlImportMissionId,
    importingKml,
    replaceRouteConfirmOpen,
    setReplaceRouteConfirmOpen,
    pendingKmlFile,
    setPendingKmlFile,
    kmlInputRef,
    doImportKml,
    handleKmlFileSelected,
  };
};
