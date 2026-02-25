import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { parseKmlOrKmz } from "@/lib/kmlImport";
import { toast } from "sonner";

type Mission = any;

export const useOppdragData = () => {
  const { user, loading, companyId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeMissions, setActiveMissions] = useState<Mission[]>([]);
  const [completedMissions, setCompletedMissions] = useState<Mission[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(true);
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false);
  const [filterTab, setFilterTab] = useState<"active" | "completed">("active");

  // KML import state
  const [kmlImportMissionId, setKmlImportMissionId] = useState<string | null>(null);
  const [importingKml, setImportingKml] = useState(false);
  const [replaceRouteConfirmOpen, setReplaceRouteConfirmOpen] = useState(false);
  const [pendingKmlFile, setPendingKmlFile] = useState<File | null>(null);
  const kmlInputRef = useRef<HTMLInputElement>(null);

  // Computed
  const missions = filterTab === 'active' ? activeMissions : completedMissions;
  const isLoading = filterTab === 'active' ? isLoadingActive : isLoadingCompleted;

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user && navigator.onLine) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // Initial load
  useEffect(() => {
    if (companyId) {
      const loadAll = async () => {
        await fetchMissionsForTab('active');
        fetchMissionsForTab('completed');
      };
      loadAll();
    }
  }, [companyId]);

  // Real-time subscription
  useEffect(() => {
    const handler = () => {
      if (!navigator.onLine) return;
      fetchMissionsForTab('active');
      fetchMissionsForTab('completed');
    };

    const channel = supabase
      .channel('oppdrag-page-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_personnel' }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_drones' }, handler)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  const fetchMissionsForTab = async (tab: 'active' | 'completed') => {
    const setData = tab === 'active' ? setActiveMissions : setCompletedMissions;
    const setLoadingFn = tab === 'active' ? setIsLoadingActive : setIsLoadingCompleted;

    if (companyId) {
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
      let query = supabase
        .from("missions")
        .select(`*, customers (id, navn, kontaktperson, telefon, epost)`)
        .order("tidspunkt", { ascending: tab === "active" });

      if (tab === "active") {
        query = query.in("status", ["Planlagt", "Pågående"]);
      } else {
        query = query.eq("status", "Fullført");
      }

      const { data, error } = await query;
      if (error) throw error;

      const missionsList = data || [];
      const missionIds = missionsList.map(m => m.id);

      if (missionIds.length === 0) {
        setData([]);
        if (companyId) setCachedData(`offline_missions_${companyId}_${tab}`, []);
        setLoadingFn(false);
        return;
      }

      const [
        personnelRes, dronesRes, equipmentRes, soraRes,
        incidentsRes, risksRes, docsRes, logsRes
      ] = await Promise.all([
        supabase.from("mission_personnel").select("mission_id, profile_id, profiles(id, full_name)").in("mission_id", missionIds),
        supabase.from("mission_drones").select("mission_id, drone_id, drones(id, modell, serienummer)").in("mission_id", missionIds),
        supabase.from("mission_equipment").select("mission_id, equipment_id, equipment(id, navn, type)").in("mission_id", missionIds),
        supabase.from("mission_sora").select("*").in("mission_id", missionIds),
        supabase.from("incidents").select("*").in("mission_id", missionIds),
        supabase.from("mission_risk_assessments").select("*").in("mission_id", missionIds).order("created_at", { ascending: false }),
        supabase.from("mission_documents").select("mission_id, document_id, documents(id, tittel, beskrivelse, kategori, nettside_url, fil_url, gyldig_til, varsel_dager_for_utløp, versjon, oppdatert_dato)").in("mission_id", missionIds),
        supabase.from("flight_logs").select("id, mission_id, flight_date, flight_duration_minutes, departure_location, landing_location, safesky_mode, completed_checklists, flight_track, user_id, drone_id, drones(id, modell)").in("mission_id", missionIds).order("flight_date", { ascending: false }),
      ]);

      const allFlightLogIds = (logsRes.data || []).map((l: any) => l.id);
      const flightLogPersonnelRes = allFlightLogIds.length > 0
        ? await supabase.from("flight_log_personnel").select("flight_log_id, profile_id, profiles(id, full_name)").in("flight_log_id", allFlightLogIds)
        : { data: [] };

      const uniqueUserIds = [...new Set(missionsList.map(m => m.user_id).filter(Boolean))] as string[];
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
          return { ...log, pilot: pilotEntry?.profiles || null };
        });

        const riskEntries = risksMap.get(mission.id) || [];

        return {
          ...mission,
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

      setData(missionsWithDetails);
      if (companyId) setCachedData(`offline_missions_${companyId}_${tab}`, missionsWithDetails);
    } catch (error) {
      console.error("Error fetching missions:", error);
      toast.error("Kunne ikke laste oppdrag");
    } finally {
      setLoadingFn(false);
    }
  };

  const fetchMissions = () => {
    fetchMissionsForTab('active');
    fetchMissionsForTab('completed');
  };

  // Handlers
  const handleSubmitForApproval = async (mission: Mission) => {
    try {
      const { error } = await supabase
        .from('missions')
        .update({
          approval_status: 'pending_approval',
          submitted_for_approval_at: new Date().toISOString()
        })
        .eq('id', mission.id);

      if (error) throw error;

      try {
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'notify_mission_approval',
            companyId,
            mission: {
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
      toast.success(`Rute importert: ${parsed.coordinates.length} punkter · ${(parsed.totalDistance / 1000).toFixed(2)} km`);
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
    filterTab,
    setFilterTab,

    // Actions
    fetchMissions,
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
