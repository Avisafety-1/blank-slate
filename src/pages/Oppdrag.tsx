import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MapPin, 
  Calendar, 
  Users, 
  Plane, 
  Package, 
  FileText, 
  Download,
  Search,
  Loader2,
  Edit,
  Plus,
  AlertTriangle,
  Route,
  Ruler,
  Navigation,
  Clock,
  Radio,
  ClipboardCheck,
  Trash2,
  ShieldCheck,
  Brain,
  ChevronDown,
  Info,
  Send,
  CheckCircle2
} from "lucide-react";
import { getResourceConflictsForMission, ResourceConflict } from "@/hooks/useResourceConflicts";
import { ResourceConflictWarning } from "@/components/dashboard/ResourceConflictWarning";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { generateDJIKMZ, sanitizeFilename } from "@/lib/kmzExport";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import droneBackground from "@/assets/drone-background.png";
import autoTable from "jspdf-autotable";
import { createPdfDocument, setFontStyle, sanitizeForPdf, sanitizeFilenameForPdf, formatDateForPdf } from "@/lib/pdfUtils";
import { DroneWeatherPanel } from "@/components/DroneWeatherPanel";
import { MissionMapPreview } from "@/components/dashboard/MissionMapPreview";
import { ExpandedMapDialog } from "@/components/dashboard/ExpandedMapDialog";
import { AirspaceWarnings } from "@/components/dashboard/AirspaceWarnings";
import { AddMissionDialog, RouteData } from "@/components/dashboard/AddMissionDialog";
import { SoraAnalysisDialog } from "@/components/dashboard/SoraAnalysisDialog";
import { IncidentDetailDialog } from "@/components/dashboard/IncidentDetailDialog";
import { DocumentDetailDialog } from "@/components/dashboard/DocumentDetailDialog";
import { RiskAssessmentTypeDialog } from "@/components/dashboard/RiskAssessmentTypeDialog";
import { MissionStatusDropdown } from "@/components/dashboard/MissionStatusDropdown";
import { RiskAssessmentDialog } from "@/components/dashboard/RiskAssessmentDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { toast } from "sonner";

type Mission = any;

const statusColors: Record<string, string> = {
  Planlagt: "bg-blue-500/20 text-blue-900 border-blue-500/30",
  Pågående: "bg-green-500/20 text-green-900 border-green-500/30",
  Fullført: "bg-gray-500/20 text-gray-900 border-gray-500/30",
  Avbrutt: "bg-red-500/20 text-red-900 border-red-500/30"
};

const incidentSeverityColors: Record<string, string> = {
  Lav: "bg-blue-500/20 text-blue-900 border-blue-500/30",
  Middels: "bg-yellow-500/20 text-yellow-900 border-yellow-500/30",
  Høy: "bg-orange-500/20 text-orange-900 border-orange-500/30",
  Kritisk: "bg-red-500/20 text-red-900 border-red-500/30",
};

const incidentStatusColors: Record<string, string> = {
  Åpen: "bg-blue-500/20 text-blue-900 border-blue-500/30",
  "Under behandling": "bg-yellow-500/20 text-yellow-900 border-yellow-500/30",
  Løst: "bg-green-500/20 text-green-900 border-green-500/30",
  Lukket: "bg-gray-500/20 text-gray-900 border-gray-500/30",
};

// Component to display checklist badges with names fetched from documents
const ChecklistBadges = ({ checklistIds }: { checklistIds: string[] }) => {
  const [names, setNames] = useState<string[]>([]);
  
  useEffect(() => {
    const fetchChecklistNames = async () => {
      if (!checklistIds || checklistIds.length === 0) return;
      
      const { data } = await supabase
        .from('documents')
        .select('id, tittel')
        .in('id', checklistIds);
      
      if (data) {
        setNames(data.map(d => d.tittel));
      }
    };
    
    fetchChecklistNames();
  }, [checklistIds]);
  
  if (names.length === 0) return null;
  
  return (
    <Badge variant="outline" className="text-xs bg-green-500/20 text-green-900 border-green-500/30">
      <ClipboardCheck className="h-3 w-3 mr-1" />
      ✓ {names.join(', ')}
    </Badge>
  );
};

const Oppdrag = () => {
  const { user, loading, companyId } = useAuth();
  const { isAdmin } = useRoleCheck();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeMissions, setActiveMissions] = useState<Mission[]>([]);
  const [completedMissions, setCompletedMissions] = useState<Mission[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(true);
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState("alle");
  const [pilotFilter, setPilotFilter] = useState("alle");
  const [droneFilter, setDroneFilter] = useState("alle");
  const [filterTab, setFilterTab] = useState<"active" | "completed">("active");

  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [soraDialogOpen, setSoraDialogOpen] = useState(false);
  const [soraEditingMissionId, setSoraEditingMissionId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [expandedMapMission, setExpandedMapMission] = useState<Mission | null>(null);
  const [deletingMission, setDeletingMission] = useState<Mission | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [riskTypeDialogOpen, setRiskTypeDialogOpen] = useState(false);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskAssessmentMission, setRiskAssessmentMission] = useState<Mission | null>(null);
  const [riskDialogShowHistory, setRiskDialogShowHistory] = useState(false);
  const [exportPdfMission, setExportPdfMission] = useState<Mission | null>(null);
  const [exportPdfDialogOpen, setExportPdfDialogOpen] = useState(false);
  const [includeRiskAssessment, setIncludeRiskAssessment] = useState(false);
  
  // State for route planner navigation
  const [initialRouteData, setInitialRouteData] = useState<RouteData | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialSelectedPersonnel, setInitialSelectedPersonnel] = useState<string[]>([]);
  const [initialSelectedEquipment, setInitialSelectedEquipment] = useState<string[]>([]);
  const [initialSelectedDrones, setInitialSelectedDrones] = useState<string[]>([]);
  const [initialSelectedCustomer, setInitialSelectedCustomer] = useState<string>("");

  // Computed variables - tab only controls which list is shown
  const missions = filterTab === 'active' ? activeMissions : completedMissions;
  const isLoading = filterTab === 'active' ? isLoadingActive : isLoadingCompleted;

  // Handle navigation state from route planner
  useEffect(() => {
    const state = location.state as any;
    // Check if we have routeData or formData from route planner (or openDialog for backward compatibility)
    if (state?.routeData || state?.formData || state?.openDialog) {
      setInitialRouteData(state.routeData || null);
      setInitialFormData(state.formData || null);
      setInitialSelectedPersonnel(state.selectedPersonnel || []);
      setInitialSelectedEquipment(state.selectedEquipment || []);
      setInitialSelectedDrones(state.selectedDrones || []);
      setInitialSelectedCustomer(state.selectedCustomer || "");
      
      // Check if we're editing an existing mission
      if (state.missionId) {
        // Fetch the mission and open edit dialog
        const fetchMission = async () => {
          const { data } = await supabase
            .from('missions')
            .select('*')
            .eq('id', state.missionId)
            .maybeSingle();
          
          if (data) {
            setEditingMission(data);
            setEditDialogOpen(true);
          }
        };
        fetchMission();
      } else {
        // Open the add dialog for new mission
        setAddDialogOpen(true);
      }
      
      // Clear the navigation state
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, navigate, location.pathname]);

  useEffect(() => {
    if (!loading && !user && navigator.onLine) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (companyId) {
      const loadAll = async () => {
        await fetchMissionsForTab('active');
        // Background-load completed after active is done
        fetchMissionsForTab('completed');
      };
      loadAll();
    }
  }, [companyId]);

  // Real-time subscription for missions + approval/comment updates
  useEffect(() => {
    const handler = () => {
      if (!navigator.onLine) return;
      fetchMissionsForTab('active');
      fetchMissionsForTab('completed');
    };

    const channel = supabase
      .channel('oppdrag-page-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'missions',
        },
        handler
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mission_personnel',
        },
        handler
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mission_drones',
        },
        handler
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const fetchMissionsForTab = async (tab: 'active' | 'completed') => {
    const setData = tab === 'active' ? setActiveMissions : setCompletedMissions;
    const setLoading = tab === 'active' ? setIsLoadingActive : setIsLoadingCompleted;

    // 1. Load cache first
    if (companyId) {
      const cached = getCachedData<Mission[]>(`offline_missions_${companyId}_${tab}`);
      if (cached) {
        setData(cached);
        setLoading(false);
      }
    }

    // 2. Skip network if offline
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from("missions")
        .select(`
          *,
          customers (
            id,
            navn,
            kontaktperson,
            telefon,
            epost
          )
        `)
        .order("tidspunkt", { ascending: tab === "active" });

      if (tab === "active") {
        query = query.in("status", ["Planlagt", "Pågående"]);
      } else {
        query = query.eq("status", "Fullført");
      }

      const { data, error } = await query;

      if (error) throw error;

      // Batch-fetch all related data in parallel instead of per-mission
      const missionsList = data || [];
      const missionIds = missionsList.map(m => m.id);

      if (missionIds.length === 0) {
        setData([]);
        if (companyId) setCachedData(`offline_missions_${companyId}_${tab}`, []);
        setLoading(false);
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

      // Batch-fetch flight log personnel
      const allFlightLogIds = (logsRes.data || []).map((l: any) => l.id);
      const flightLogPersonnelRes = allFlightLogIds.length > 0
        ? await supabase.from("flight_log_personnel").select("flight_log_id, profile_id, profiles(id, full_name)").in("flight_log_id", allFlightLogIds)
        : { data: [] };

      // Batch-fetch creator profiles
      const uniqueUserIds = [...new Set(missionsList.map(m => m.user_id).filter(Boolean))] as string[];
      const profilesRes = uniqueUserIds.length > 0
        ? await supabase.from("profiles").select("id, full_name").in("id", uniqueUserIds)
        : { data: [] };

      // Build lookup maps
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
      // Cache for offline use
      if (companyId) setCachedData(`offline_missions_${companyId}_${tab}`, missionsWithDetails);
    } catch (error) {
      console.error("Error fetching missions:", error);
      toast.error("Kunne ikke laste oppdrag");
    } finally {
      setLoading(false);
    }
  };

  // Convenience wrapper to refresh both tabs
  const fetchMissions = () => {
    fetchMissionsForTab('active');
    fetchMissionsForTab('completed');
  };

  // Compute unique filter options from current missions list
  const uniqueCustomers = [...new Set(missions.map(m => m.customers?.navn).filter(Boolean))].sort();
  const uniquePilots = [...new Set(missions.flatMap(m => (m.personnel || []).map((p: any) => p.profiles?.full_name).filter(Boolean)))].sort();
  const uniqueDrones = [...new Set(missions.flatMap(m => (m.drones || []).map((d: any) => d.drones?.modell).filter(Boolean)))].sort();

  const filteredMissions = missions.filter((mission) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(
        mission.tittel?.toLowerCase().includes(q) ||
        mission.lokasjon?.toLowerCase().includes(q) ||
        mission.beskrivelse?.toLowerCase().includes(q)
      )) return false;
    }
    if (customerFilter !== "alle" && mission.customers?.navn !== customerFilter) return false;
    if (pilotFilter !== "alle") {
      const hasPilot = (mission.personnel || []).some((p: any) => p.profiles?.full_name === pilotFilter);
      if (!hasPilot) return false;
    }
    if (droneFilter !== "alle") {
      const hasDrone = (mission.drones || []).some((d: any) => d.drones?.modell === droneFilter);
      if (!hasDrone) return false;
    }
    return true;
  });

  const handleEditMission = (mission: Mission) => {
    setEditingMission(mission);
    setEditDialogOpen(true);
  };

  const handleMissionUpdated = () => {
    fetchMissions();
    setEditDialogOpen(false);
    setEditingMission(null);
  };

  const handleMissionAdded = () => {
    fetchMissions();
    setAddDialogOpen(false);
  };

  const handleEditSora = (missionId: string) => {
    setSoraEditingMissionId(missionId);
    setSoraDialogOpen(true);
  };

  const handleSoraSaved = () => {
    fetchMissions();
    setSoraDialogOpen(false);
    setSoraEditingMissionId(null);
  };

  const handleNewRiskAssessment = (mission: Mission) => {
    setRiskAssessmentMission(mission);
    setRiskTypeDialogOpen(true);
  };

  const handleSelectAI = () => {
    setRiskTypeDialogOpen(false);
    setRiskDialogOpen(true);
  };

  const handleSelectSORA = () => {
    setRiskTypeDialogOpen(false);
    if (riskAssessmentMission) {
      setSoraEditingMissionId(riskAssessmentMission.id);
      setSoraDialogOpen(true);
    }
  };

  const handleRiskAssessmentSaved = () => {
    fetchMissions();
    setRiskDialogOpen(false);
    setRiskAssessmentMission(null);
  };

  const getAIRiskBadgeColor = (recommendation: string) => {
    switch (recommendation?.toLowerCase()) {
      case 'proceed':
        return 'bg-green-500/20 text-green-900 border-green-500/30';
      case 'proceed_with_caution':
        return 'bg-yellow-500/20 text-yellow-900 border-yellow-500/30';
      case 'not_recommended':
        return 'bg-red-500/20 text-red-900 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-900 border-gray-500/30';
    }
  };

  const getAIRiskLabel = (recommendation: string) => {
    switch (recommendation?.toLowerCase()) {
      case 'proceed':
        return 'Anbefalt';
      case 'proceed_with_caution':
        return 'Forsiktighet';
      case 'not_recommended':
        return 'Ikke anbefalt';
      default:
        return recommendation || 'Ukjent';
    }
  };

  const formatAIRiskScore = (score: unknown) => {
    const n = typeof score === "number" ? score : Number(score);
    if (!Number.isFinite(n)) return "—/10";
    return `${n.toFixed(1)}/10`;
  };

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

      // Send email notification to approvers
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

  const handleDeleteMission = async () => {
    if (!deletingMission) return;
    
    try {
      // Delete related records first
      await supabase.from('mission_personnel').delete().eq('mission_id', deletingMission.id);
      await supabase.from('mission_equipment').delete().eq('mission_id', deletingMission.id);
      await supabase.from('mission_drones').delete().eq('mission_id', deletingMission.id);
      await supabase.from('mission_sora').delete().eq('mission_id', deletingMission.id);
      
      // Delete the mission
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
    } finally {
      setDeletingMission(null);
    }
  };

  const exportToKMZ = async (mission: Mission) => {
    const route = mission.route as { coordinates: { lat: number; lng: number }[]; totalDistance: number } | null;
    
    if (!route?.coordinates?.length) {
      toast.error("Oppdraget har ingen planlagt rute");
      return;
    }
    
    try {
      // Fetch user's full name for opprettet_av
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id)
        .single();
      const opprettetAv = userProfile?.full_name || user?.email || 'Ukjent';

      const blob = await generateDJIKMZ(
        mission.tittel || 'Oppdrag',
        route,
        50 // Default flight height 50m
      );
      
      const fileName = `${sanitizeFilename(mission.tittel || 'oppdrag')}-${Date.now()}.kmz`;
      const filePath = `${companyId}/${fileName}`;
      
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, {
          contentType: 'application/vnd.google-earth.kmz',
          upsert: false
        });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);
      
      // Create document record with kml-kmz category
      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          tittel: `KMZ - ${mission.tittel}`,
          beskrivelse: `Eksportert rutefil for DJI Pilot 2 - ${mission.tittel}`,
          kategori: 'kml-kmz',
          fil_url: publicUrl,
          fil_navn: fileName,
          fil_storrelse: blob.size,
          company_id: companyId,
          user_id: user?.id,
          opprettet_av: opprettetAv,
        });
      
      if (insertError) throw insertError;
      
      toast.success("KMZ-fil eksportert og lagret i dokumenter");
    } catch (error) {
      console.error("Error exporting KMZ:", error);
      toast.error("Kunne ikke eksportere KMZ");
    }
  };

  const handleExportPdfClick = (mission: Mission) => {
    setExportPdfMission(mission);
    setIncludeRiskAssessment(false);
    setExportPdfDialogOpen(true);
  };

  const handleConfirmExportPdf = async () => {
    if (!exportPdfMission) return;
    setExportPdfDialogOpen(false);
    await exportToPDF(exportPdfMission, includeRiskAssessment);
  };

  const exportToPDF = async (mission: Mission, includeRisk: boolean = false) => {
    try {
      // Fetch user's full name for opprettet_av
      const { data: pdfUserProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id)
        .single();
      const pdfOpprettetAv = pdfUserProfile?.full_name || user?.email || 'Ukjent';

      const pdf = await createPdfDocument();
      const pageWidth = pdf.internal.pageSize.getWidth();
      
      // Fetch airspace warnings if coordinates exist
      let airspaceWarnings: any[] = [];
      const routeCoords = (mission.route as any)?.coordinates || null;
      const effectiveLat = mission.latitude ?? routeCoords?.[0]?.lat;
      const effectiveLng = mission.longitude ?? routeCoords?.[0]?.lng;
      
      if (effectiveLat && effectiveLng) {
        const { data: airspaceData } = await supabase.rpc("check_mission_airspace", {
          p_lat: effectiveLat,
          p_lng: effectiveLng,
          p_route: routeCoords,
        });
        if (airspaceData) {
          const severityOrder: Record<string, number> = { warning: 0, caution: 1, note: 2 };
          airspaceWarnings = (airspaceData as any[]).sort(
            (a, b) => (severityOrder[a.level] || 3) - (severityOrder[b.level] || 3)
          );
        }
      }
      
      // Header
      pdf.setFontSize(18);
      setFontStyle(pdf, "bold");
      pdf.text("Oppdragsrapport", pageWidth / 2, 20, { align: "center" });
      
      // Mission title
      pdf.setFontSize(14);
      setFontStyle(pdf, "normal");
      pdf.text(sanitizeForPdf(mission.tittel), pageWidth / 2, 32, { align: "center" });
      
      pdf.setFontSize(10);
      pdf.setTextColor(100);
      pdf.text(`Eksportert: ${formatDateForPdf(new Date(), "dd.MM.yyyy 'kl.' HH:mm")}`, pageWidth / 2, 40, { align: "center" });
      pdf.setTextColor(0);
      
      let yPos = 50;
      
      // Add map image if coordinates exist
      if (mission.latitude && mission.longitude) {
        try {
          // Generate static map URL (using OpenStreetMap static map service)
          const mapWidth = 600;
          const mapHeight = 300;
          const zoom = 12;
          const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${mission.latitude},${mission.longitude}&zoom=${zoom}&size=${mapWidth}x${mapHeight}&markers=${mission.latitude},${mission.longitude},red-pushpin`;
          
          // Add map image to PDF
          pdf.addImage(mapUrl, 'PNG', 15, yPos, 180, 90);
          yPos += 100;
        } catch (mapError) {
          console.error("Error adding map to PDF:", mapError);
          // Continue without map if there's an error
        }
      }
      
      // Airspace Warnings
      if (airspaceWarnings.length > 0) {
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("Luftromsadvarsler", 15, yPos);
        yPos += 7;
        
        const levelLabels: Record<string, string> = {
          warning: "ADVARSEL",
          caution: "FORSIKTIGHET",
          note: "INFORMASJON"
        };
        
        const airspaceData = airspaceWarnings.map((w: any) => [
          sanitizeForPdf(levelLabels[w.level] || w.level),
          sanitizeForPdf(w.zone_name) || "-",
          w.is_inside ? "Innenfor sone" : `${Math.round(w.distance_meters)}m unna`,
          sanitizeForPdf(w.message) || "-"
        ]);
        
        autoTable(pdf, {
          startY: yPos,
          head: [["Nivå", "Sone", "Avstand", "Melding"]],
          body: airspaceData,
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
            0: { fontStyle: "bold", cellWidth: 25 },
            1: { cellWidth: 35 },
            2: { cellWidth: 25 },
            3: { cellWidth: 95 }
          }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 10;
      }
      
      // Route info
      if (mission.route && (mission.route as any).coordinates?.length > 0) {
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("Planlagt flyrute", 15, yPos);
        yPos += 7;
        
        const routeData = mission.route as any;
        const routeInfo = [
          ["Antall punkter", String(routeData.coordinates.length)],
          ["Total avstand", `${(routeData.totalDistance || 0).toFixed(2)} km`],
        ];
        
        autoTable(pdf, {
          startY: yPos,
          head: [],
          body: routeInfo,
          theme: "grid",
          styles: { fontSize: 9 },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 5;
        
        // Route coordinates table
        const coordData = routeData.coordinates.map((coord: any, index: number) => [
          String(index + 1),
          coord.lat.toFixed(6),
          coord.lng.toFixed(6)
        ]);
        
        autoTable(pdf, {
          startY: yPos,
          head: [["Punkt", "Breddegrad", "Lengdegrad"]],
          body: coordData,
          theme: "grid",
          styles: { fontSize: 8 },
          columnStyles: { 
            0: { cellWidth: 20 },
            1: { cellWidth: 50 },
            2: { cellWidth: 50 }
          }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 10;
      }
      
      // Basic info
      pdf.setFontSize(12);
      setFontStyle(pdf, "bold");
      pdf.text("Grunnleggende informasjon", 15, yPos);
      yPos += 7;
      
      setFontStyle(pdf, "normal");
      pdf.setFontSize(10);
      
      const basicInfo = [
        ["Status", sanitizeForPdf(mission.status)],
        ["Risikonivia", sanitizeForPdf(mission.risk_nivå)],
        ["Lokasjon", sanitizeForPdf(mission.lokasjon)],
        ["Dato/tid", formatDateForPdf(mission.tidspunkt, "dd. MMMM yyyy HH:mm")],
        ...(mission.slutt_tidspunkt ? [["Sluttid", formatDateForPdf(mission.slutt_tidspunkt, "dd. MMMM yyyy HH:mm")]] : []),
        ...(mission.latitude && mission.longitude ? [["Koordinater", `${mission.latitude.toFixed(5)}, ${mission.longitude.toFixed(5)}`]] : [])
      ];
      
      autoTable(pdf, {
        startY: yPos,
        head: [],
        body: basicInfo,
        theme: "grid",
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } }
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 10;
      
      // Customer info
      if (mission.customers) {
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("Kundeinformasjon", 15, yPos);
        yPos += 7;
        
        setFontStyle(pdf, "normal");
        pdf.setFontSize(10);
        
        const customerInfo = [
          ["Navn", sanitizeForPdf(mission.customers.navn)],
          ...(mission.customers.kontaktperson ? [["Kontaktperson", sanitizeForPdf(mission.customers.kontaktperson)]] : []),
          ...(mission.customers.telefon ? [["Telefon", sanitizeForPdf(mission.customers.telefon)]] : []),
          ...(mission.customers.epost ? [["E-post", sanitizeForPdf(mission.customers.epost)]] : [])
        ];
        
        autoTable(pdf, {
          startY: yPos,
          head: [],
          body: customerInfo,
          theme: "grid",
          styles: { fontSize: 9 },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 10;
      }
      
      // Personnel
      if (mission.personnel?.length > 0) {
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("Personell", 15, yPos);
        yPos += 7;
        
        const personnelData = mission.personnel.map((p: any) => [
          sanitizeForPdf(p.profiles?.full_name) || "Ukjent"
        ]);
        
        autoTable(pdf, {
          startY: yPos,
          head: [["Navn"]],
          body: personnelData,
          theme: "grid",
          styles: { fontSize: 9 }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 10;
      }
      
      // Drones
      if (mission.drones?.length > 0) {
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("Droner", 15, yPos);
        yPos += 7;
        
        const dronesData = mission.drones.map((d: any) => [
          d.drones?.modell || "Ukjent",
          d.drones?.serienummer || "-"
        ]);
        
        autoTable(pdf, {
          startY: yPos,
          head: [["Modell", "Serienummer"]],
          body: dronesData,
          theme: "grid",
          styles: { fontSize: 9 }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 10;
      }
      
      // Equipment
      if (mission.equipment?.length > 0) {
        if (yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }
        
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("Utstyr", 15, yPos);
        yPos += 7;
        
        const equipmentData = mission.equipment.map((e: any) => [
          e.equipment?.navn || "Ukjent",
          e.equipment?.type || "-"
        ]);
        
        autoTable(pdf, {
          startY: yPos,
          head: [["Navn", "Type"]],
          body: equipmentData,
          theme: "grid",
          styles: { fontSize: 9 }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 10;
      }
      
      // SORA
      if (mission.sora) {
        if (yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }
        
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("SORA-analyse", 15, yPos);
        yPos += 7;
        
        const soraInfo = [
          ["Status", mission.sora.sora_status || "-"],
          ...(mission.sora.sail ? [["SAIL", mission.sora.sail]] : []),
          ...(mission.sora.fgrc ? [["Final GRC", mission.sora.fgrc.toString()]] : []),
          ...(mission.sora.residual_risk_level ? [["Residual Risk", mission.sora.residual_risk_level]] : [])
        ];
        
        autoTable(pdf, {
          startY: yPos,
          head: [],
          body: soraInfo,
          theme: "grid",
          styles: { fontSize: 9 },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 10;
      }
      
      // AI Risk Assessment (if requested and available)
      if (includeRisk && mission.aiRisk) {
        try {
          if (yPos > 200) {
            pdf.addPage();
            yPos = 20;
          }
          
          pdf.setFontSize(12);
          setFontStyle(pdf, "bold");
          pdf.text("AI Risikovurdering", 15, yPos);
          yPos += 7;
          
          const recommendationLabels: Record<string, string> = {
            'proceed': 'Anbefalt',
            'proceed_with_caution': 'Forsiktighet anbefalt',
            'not_recommended': 'Ikke anbefalt'
          };
          
          const recommendation = mission.aiRisk.recommendation || '';
          const overallScore = mission.aiRisk.overall_score;
          const weatherScore = mission.aiRisk.weather_score;
          const airspaceScore = mission.aiRisk.airspace_score;
          const pilotScore = mission.aiRisk.pilot_experience_score;
          const equipmentScore = mission.aiRisk.equipment_score;
          const complexityScore = mission.aiRisk.mission_complexity_score;
          
          const riskInfo: string[][] = [
            ["Anbefaling", sanitizeForPdf(recommendationLabels[recommendation.toLowerCase()] || recommendation)]
          ];
          
          if (overallScore != null) {
            riskInfo.push(["Total score", `${Number(overallScore).toFixed(1)}/10`]);
          }
          if (weatherScore != null) {
            riskInfo.push(["Vaer-score", `${Number(weatherScore).toFixed(1)}/10`]);
          }
          if (airspaceScore != null) {
            riskInfo.push(["Luftrom-score", `${Number(airspaceScore).toFixed(1)}/10`]);
          }
          if (pilotScore != null) {
            riskInfo.push(["Pilot-score", `${Number(pilotScore).toFixed(1)}/10`]);
          }
          if (equipmentScore != null) {
            riskInfo.push(["Utstyr-score", `${Number(equipmentScore).toFixed(1)}/10`]);
          }
          if (complexityScore != null) {
            riskInfo.push(["Kompleksitet-score", `${Number(complexityScore).toFixed(1)}/10`]);
          }
          if (mission.aiRisk.created_at) {
            riskInfo.push(["Vurdert", formatDateForPdf(mission.aiRisk.created_at, "dd.MM.yyyy HH:mm")]);
          }
          
          autoTable(pdf, {
            startY: yPos,
            head: [],
            body: riskInfo,
            theme: "grid",
            styles: { fontSize: 9 },
            columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } }
          });
          
          yPos = (pdf as any).lastAutoTable.finalY + 5;
          
          // Add AI analysis summary if available
          const aiAnalysis = mission.aiRisk.ai_analysis as any;
          if (aiAnalysis?.summary) {
            pdf.setFontSize(10);
            setFontStyle(pdf, "bold");
            pdf.text("Oppsummering:", 15, yPos);
            yPos += 5;
            
            setFontStyle(pdf, "normal");
            pdf.setFontSize(9);
            const sanitizedSummary = sanitizeForPdf(aiAnalysis.summary);
            const splitSummary = pdf.splitTextToSize(sanitizedSummary, pageWidth - 30);
            pdf.text(splitSummary, 15, yPos);
            yPos += splitSummary.length * 4 + 5;
          }
          
          // Add recommendations list if available
          if (aiAnalysis?.recommendations && Array.isArray(aiAnalysis.recommendations) && aiAnalysis.recommendations.length > 0) {
            if (yPos > 250) {
              pdf.addPage();
              yPos = 20;
            }
            
            pdf.setFontSize(10);
            setFontStyle(pdf, "bold");
            pdf.text("Anbefalinger:", 15, yPos);
            yPos += 5;
            
            setFontStyle(pdf, "normal");
            pdf.setFontSize(9);
            
            aiAnalysis.recommendations.forEach((rec: any, index: number) => {
              if (yPos > 270) {
                pdf.addPage();
                yPos = 20;
              }
              // Handle both string and object recommendations
              let recText = '';
              if (typeof rec === 'string') {
                recText = rec;
              } else if (rec && typeof rec === 'object') {
                // Try common properties: text, title, description, message, content
                recText = rec.text || rec.title || rec.description || rec.message || rec.content || rec.recommendation || JSON.stringify(rec);
              }
              const sanitizedRec = sanitizeForPdf(recText);
              const bulletText = `${index + 1}. ${sanitizedRec}`;
              const splitRec = pdf.splitTextToSize(bulletText, pageWidth - 35);
              pdf.text(splitRec, 18, yPos);
              yPos += splitRec.length * 4 + 2;
            });
            
            yPos += 5;
          }
          
          yPos += 5;
        } catch (riskError) {
          console.error("Error adding risk assessment to PDF:", riskError);
          // Continue with PDF generation even if risk assessment fails
        }
      }
      
      // Incidents
      if (mission.incidents?.length > 0) {
        if (yPos > 220) {
          pdf.addPage();
          yPos = 20;
        }
        
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("Tilknyttede hendelser", 15, yPos);
        yPos += 7;
        
        const incidentData = mission.incidents.map((incident: any) => [
          incident.tittel,
          incident.alvorlighetsgrad,
          incident.status,
          incident.hovedaarsak || "-",
          formatDateForPdf(new Date(incident.hendelsestidspunkt), "dd.MM.yyyy HH:mm")
        ]);
        
        autoTable(pdf, {
          startY: yPos,
          head: [["Tittel", "Alvorlighet", "Status", "Hovedårsak", "Tidspunkt"]],
          body: incidentData,
          theme: "grid",
          styles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 25 },
            2: { cellWidth: 30 },
            3: { cellWidth: 35 },
            4: { cellWidth: 35 }
          }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 10;
      }
      
      // Flight Logs
      if (mission.flightLogs?.length > 0) {
        if (yPos > 220) {
          pdf.addPage();
          yPos = 20;
        }
        
        pdf.setFontSize(12);
        setFontStyle(pdf, "bold");
        pdf.text("Flyturer", 15, yPos);
        yPos += 7;
        
        // Fetch all checklist names for this mission's flight logs
        const allChecklistIds = mission.flightLogs
          .flatMap((log: any) => log.completed_checklists || [])
          .filter((id: string, index: number, self: string[]) => self.indexOf(id) === index);
        
        let checklistNameMap: Record<string, string> = {};
        if (allChecklistIds.length > 0) {
          const { data: checklistData } = await supabase
            .from('documents')
            .select('id, tittel')
            .in('id', allChecklistIds);
          
          if (checklistData) {
            checklistNameMap = Object.fromEntries(
              checklistData.map(d => [d.id, d.tittel])
            );
          }
        }
        
        const safeskyLabels: Record<string, string> = {
          'none': 'Av',
          'advisory': 'Advisory (rute)',
          'live_uav': 'Live posisjon'
        };
        
        const flightData = mission.flightLogs.map((log: any) => {
          const checklistNames = (log.completed_checklists || [])
            .map((id: string) => checklistNameMap[id])
            .filter(Boolean)
            .join(', ') || '-';
          
          return [
            format(new Date(log.flight_date), "dd.MM.yyyy", { locale: nb }),
            `${log.flight_duration_minutes} min`,
            log.pilot?.full_name || '-',
            log.drones?.modell || '-',
            safeskyLabels[log.safesky_mode] || 'Av',
            checklistNames
          ];
        });
        
        autoTable(pdf, {
          startY: yPos,
          head: [["Dato", "Flytid", "Pilot", "Drone", "SafeSky", "Sjekklister"]],
          body: flightData,
          theme: "grid",
          styles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 32 },
            1: { cellWidth: 18 },
            2: { cellWidth: 30 },
            3: { cellWidth: 30 },
            4: { cellWidth: 28 },
            5: { cellWidth: 42 }
          }
        });
        
        yPos = (pdf as any).lastAutoTable.finalY + 10;
      }
      
      // Description & Notes
      if (mission.beskrivelse || mission.merknader) {
        if (yPos > 240) {
          pdf.addPage();
          yPos = 20;
        }
        
        if (mission.beskrivelse) {
          pdf.setFontSize(12);
          setFontStyle(pdf, "bold");
          pdf.text("Beskrivelse", 15, yPos);
          yPos += 7;
          
          setFontStyle(pdf, "normal");
          pdf.setFontSize(9);
          const splitDescription = pdf.splitTextToSize(mission.beskrivelse, pageWidth - 30);
          pdf.text(splitDescription, 15, yPos);
          yPos += splitDescription.length * 5 + 10;
        }
        
        if (mission.merknader) {
          if (yPos > 250) {
            pdf.addPage();
            yPos = 20;
          }
          
          pdf.setFontSize(12);
          setFontStyle(pdf, "bold");
          pdf.text("Merknader", 15, yPos);
          yPos += 7;
          
          setFontStyle(pdf, "normal");
          pdf.setFontSize(9);
          const splitNotes = pdf.splitTextToSize(mission.merknader, pageWidth - 30);
          pdf.text(splitNotes, 15, yPos);
        }
      }
      
      // Generate PDF as blob and upload to documents
      const pdfBlob = pdf.output('blob');
      const fileName = `oppdrag-${mission.tittel.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${Date.now()}.pdf`;
      const filePath = `${companyId}/${fileName}`;
      
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false
        });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);
      
      // Create document record
      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          tittel: `Oppdragsrapport - ${mission.tittel}`,
          beskrivelse: `Eksportert rapport for oppdrag ${mission.tittel}`,
          kategori: 'oppdrag',
          fil_url: publicUrl,
          fil_navn: fileName,
          fil_storrelse: pdfBlob.size,
          company_id: companyId,
          user_id: user?.id,
          opprettet_av: pdfOpprettetAv,
        });
      
      if (insertError) throw insertError;
      
      toast.success("PDF eksportert og lagret i dokumenter");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("Kunne ikke eksportere PDF");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat"
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full">
        {/* Main Content */}
        <main className="w-full px-3 sm:px-4 py-3 sm:py-5">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl sm:text-4xl font-bold text-foreground">Oppdrag</h1>
            </div>

            {/* Filter Controls */}
            <GlassCard className="p-3 sm:p-4 space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as "active" | "completed")} className="flex-1">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="active" className="text-xs sm:text-sm">Pågående og kommende</TabsTrigger>
                    <TabsTrigger value="completed" className="text-xs sm:text-sm">Fullførte</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button onClick={() => setAddDialogOpen(true)} className="w-full sm:w-auto" size="lg">
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Legg til oppdrag</span>
                  <span className="sm:hidden">Nytt oppdrag</span>
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Søk etter oppdrag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filter dropdowns */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Kunde" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle kunder</SelectItem>
                    {uniqueCustomers.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={pilotFilter} onValueChange={setPilotFilter}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Pilot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle piloter</SelectItem>
                    {uniquePilots.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={droneFilter} onValueChange={setDroneFilter}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Drone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle droner</SelectItem>
                    {uniqueDrones.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </GlassCard>

            {/* Missions List */}
            {isLoading ? (
              <GlassCard className="p-8 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </GlassCard>
            ) : filteredMissions.length === 0 ? (
              <GlassCard className="p-8 text-center">
                <p className="text-muted-foreground">
                  {searchQuery ? "Ingen oppdrag funnet" : "Ingen oppdrag"}
                </p>
              </GlassCard>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {filteredMissions.map((mission) => (
                  <GlassCard key={mission.id} className="p-4 sm:p-6 space-y-3 sm:space-y-4">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-3 sm:gap-4">
                      <div className="space-y-2 flex-1 w-full">
                        <h3 className="text-lg sm:text-xl font-semibold text-foreground">{mission.tittel}</h3>
                        <div className="flex flex-wrap gap-2">
                          <MissionStatusDropdown
                            missionId={mission.id}
                            currentStatus={mission.status}
                            onStatusChanged={fetchMissions}
                            statusColors={statusColors}
                            className="text-xs"
                          />
                          {/* Approval status badge */}
                          {mission.approval_status === 'pending_approval' && (
                            <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-900 border-yellow-500/30">
                              <Clock className="h-3 w-3 mr-1" />
                              Venter på godkjenning
                            </Badge>
                          )}
                          {mission.approval_status === 'approved' && (
                            <Badge variant="outline" className="text-xs bg-green-500/20 text-green-900 border-green-500/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Godkjent
                            </Badge>
                          )}
                          {mission.approval_status === 'not_approved' && (
                            <Badge variant="outline" className="text-xs bg-gray-500/20 text-gray-700 border-gray-500/30">
                              Ikke godkjent
                            </Badge>
                          )}
                          {mission.aiRisk && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getAIRiskBadgeColor(mission.aiRisk.recommendation)} cursor-pointer hover:opacity-80 transition-opacity`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRiskAssessmentMission(mission);
                                setRiskDialogShowHistory(true);
                                setRiskDialogOpen(true);
                              }}
                            >
                              <Brain className="h-3 w-3 mr-1" />
                              AI: {getAIRiskLabel(mission.aiRisk.recommendation)} ({formatAIRiskScore(mission.aiRisk.overall_score)})
                            </Badge>
                          )}
                          {mission.sora && (
                            <Badge variant="outline" className="text-xs">
                              <FileText className="h-3 w-3 mr-1" />
                              SORA: {mission.sora.sora_status}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="w-full sm:w-auto">
                            <span>Flere valg</span>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-popover z-50">
                          <DropdownMenuItem onClick={() => handleEditMission(mission)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Rediger
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleNewRiskAssessment(mission)}>
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            Ny risikovurdering
                          </DropdownMenuItem>
                          {mission.approval_status === 'not_approved' && (
                            <DropdownMenuItem onClick={() => handleSubmitForApproval(mission)}>
                              <Send className="h-4 w-4 mr-2" />
                              Send til godkjenning
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleExportPdfClick(mission)}>
                            <Download className="h-4 w-4 mr-2" />
                            Eksporter PDF
                          </DropdownMenuItem>
                          {(mission.route as { coordinates?: any[] } | null)?.coordinates?.length > 0 && (
                            <DropdownMenuItem onClick={() => exportToKMZ(mission)}>
                              <Navigation className="h-4 w-4 mr-2" />
                              Eksporter KMZ
                            </DropdownMenuItem>
                          )}
                          {isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => setDeletingMission(mission)}
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Slett
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-muted-foreground">Lokasjon</p>
                          <p className="text-foreground">{mission.lokasjon}</p>
                          {mission.latitude && mission.longitude && (
                            <p className="text-xs text-muted-foreground">
                              {mission.latitude.toFixed(5)}, {mission.longitude.toFixed(5)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-muted-foreground">Tidspunkt</p>
                          <p className="text-foreground">
                            {format(new Date(mission.tidspunkt), "dd. MMMM yyyy HH:mm", { locale: nb })}
                          </p>
                          {mission.slutt_tidspunkt && (
                            <p className="text-xs text-muted-foreground">
                              til {format(new Date(mission.slutt_tidspunkt), "dd. MMMM HH:mm", { locale: nb })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Created By */}
                    {mission.created_by_name && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Opprettet av: </span>
                        <span className="text-foreground">{mission.created_by_name}</span>
                      </div>
                    )}

                    {/* Customer Info */}
                    {mission.customers && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">KUNDE</p>
                        <div className="space-y-1">
                          <p className="text-sm text-foreground">{mission.customers.navn}</p>
                          {mission.customers.kontaktperson && (
                            <p className="text-xs text-muted-foreground">
                              Kontakt: {mission.customers.kontaktperson}
                            </p>
                          )}
                          {(mission.customers.telefon || mission.customers.epost) && (
                            <p className="text-xs text-muted-foreground">
                              {[mission.customers.telefon, mission.customers.epost].filter(Boolean).join(" • ")}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Resources Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border/50">
                      {/* Personnel */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs font-semibold text-muted-foreground">PERSONELL</p>
                        </div>
                        {mission.personnel?.length > 0 ? (
                          <ul className="space-y-2">
                            {mission.personnel.map((p: any) => {
                              const allMissionsForConflict = missions.map((m: any) => ({
                                id: m.id,
                                tittel: m.tittel,
                                tidspunkt: m.tidspunkt,
                                slutt_tidspunkt: m.slutt_tidspunkt,
                                status: m.status,
                                personnel: m.personnel || [],
                                drones: m.drones || [],
                                equipment: m.equipment || [],
                              }));
                              const conflicts = getResourceConflictsForMission(
                                mission.id,
                                mission.tidspunkt,
                                mission.slutt_tidspunkt,
                                p.profile_id,
                                'personnel',
                                allMissionsForConflict
                              );
                              return (
                                <li key={p.profile_id} className="space-y-0.5">
                                  <span className="text-sm text-foreground flex items-center gap-1">
                                    {p.profiles?.full_name || "Ukjent"}
                                    {conflicts.length > 0 && (
                                      conflicts.some((c: ResourceConflict) => c.conflictType === 'overlap') 
                                        ? <AlertTriangle className="h-3 w-3 text-amber-500" />
                                        : <Info className="h-3 w-3 text-blue-500" />
                                    )}
                                  </span>
                                  <ResourceConflictWarning conflicts={conflicts} compact />
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
                        )}
                      </div>

                      {/* Drones */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Plane className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs font-semibold text-muted-foreground">DRONER</p>
                        </div>
                        {mission.drones?.length > 0 ? (
                          <ul className="space-y-2">
                            {mission.drones.map((d: any) => {
                              const allMissionsForConflict = missions.map((m: any) => ({
                                id: m.id,
                                tittel: m.tittel,
                                tidspunkt: m.tidspunkt,
                                slutt_tidspunkt: m.slutt_tidspunkt,
                                status: m.status,
                                personnel: m.personnel || [],
                                drones: m.drones || [],
                                equipment: m.equipment || [],
                              }));
                              const conflicts = getResourceConflictsForMission(
                                mission.id,
                                mission.tidspunkt,
                                mission.slutt_tidspunkt,
                                d.drone_id,
                                'drone',
                                allMissionsForConflict
                              );
                              return (
                                <li key={d.drone_id} className="space-y-0.5">
                                  <span className="text-sm text-foreground flex items-center gap-1">
                                    {d.drones?.modell} (SN: {d.drones?.serienummer})
                                    {conflicts.length > 0 && (
                                      conflicts.some((c: ResourceConflict) => c.conflictType === 'overlap') 
                                        ? <AlertTriangle className="h-3 w-3 text-amber-500" />
                                        : <Info className="h-3 w-3 text-blue-500" />
                                    )}
                                  </span>
                                  <ResourceConflictWarning conflicts={conflicts} compact />
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
                        )}
                      </div>

                      {/* Equipment */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs font-semibold text-muted-foreground">UTSTYR</p>
                        </div>
                        {mission.equipment?.length > 0 ? (
                          <ul className="space-y-2">
                            {mission.equipment.map((e: any) => {
                              const allMissionsForConflict = missions.map((m: any) => ({
                                id: m.id,
                                tittel: m.tittel,
                                tidspunkt: m.tidspunkt,
                                slutt_tidspunkt: m.slutt_tidspunkt,
                                status: m.status,
                                personnel: m.personnel || [],
                                drones: m.drones || [],
                                equipment: m.equipment || [],
                              }));
                              const conflicts = getResourceConflictsForMission(
                                mission.id,
                                mission.tidspunkt,
                                mission.slutt_tidspunkt,
                                e.equipment_id,
                                'equipment',
                                allMissionsForConflict
                              );
                              return (
                                <li key={e.equipment_id} className="space-y-0.5">
                                  <span className="text-sm text-foreground flex items-center gap-1">
                                    {e.equipment?.navn} ({e.equipment?.type})
                                    {conflicts.length > 0 && (
                                      conflicts.some((c: ResourceConflict) => c.conflictType === 'overlap') 
                                        ? <AlertTriangle className="h-3 w-3 text-amber-500" />
                                        : <Info className="h-3 w-3 text-blue-500" />
                                    )}
                                  </span>
                                  <ResourceConflictWarning conflicts={conflicts} compact />
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
                        )}
                      </div>
                    </div>

                    {/* Documents */}
                    {mission.documents?.length > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs font-semibold text-muted-foreground">DOKUMENTER</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {mission.documents.map((d: any) => {
                            const doc = d.documents;
                            return (
                              <button
                                key={d.document_id}
                                onClick={() => {
                                  setSelectedDocument(doc);
                                  setDocumentDialogOpen(true);
                                }}
                                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {doc?.tittel}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Route Info */}
                    {mission.route && (mission.route as any).coordinates?.length > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Route className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs font-semibold text-muted-foreground">PLANLAGT RUTE</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            <span>{(mission.route as any).coordinates.length} punkter</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{((mission.route as any).totalDistance || 0).toFixed(2)} km</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    {mission.beskrivelse && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">BESKRIVELSE</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{mission.beskrivelse}</p>
                      </div>
                    )}

                    {/* Weather and Map Data */}
                    {(() => {
                      const routeCoords = (mission.route as any)?.coordinates;
                      const effectiveLat = mission.latitude ?? routeCoords?.[0]?.lat;
                      const effectiveLng = mission.longitude ?? routeCoords?.[0]?.lng;
                      const isCompleted = mission.status === "Fullført";
                      const hasWeatherSnapshot = mission.weather_data_snapshot;
                      
                      if (!effectiveLat || !effectiveLng) return null;
                      
                      return (
                        <div className="pt-2 border-t border-border/50 space-y-3 sm:space-y-4">
                          <DroneWeatherPanel
                            latitude={effectiveLat}
                            longitude={effectiveLng}
                            savedWeatherData={isCompleted && hasWeatherSnapshot ? hasWeatherSnapshot : undefined}
                          />
                          <AirspaceWarnings
                            latitude={effectiveLat}
                            longitude={effectiveLng}
                            routePoints={routeCoords}
                          />
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-2">KART</p>
                            <div 
                              className="h-[150px] sm:h-[200px] relative overflow-hidden rounded-lg cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                              onClick={() => setExpandedMapMission(mission)}
                            >
                              <MissionMapPreview
                                latitude={effectiveLat}
                                longitude={effectiveLng}
                                route={mission.route as any}
                                flightTracks={
                                  mission.flightLogs
                                    ?.filter((log: any) => log.flight_track?.positions?.length > 0)
                                    .map((log: any) => ({
                                      positions: log.flight_track.positions,
                                      flightLogId: log.id,
                                      flightDate: log.flight_date,
                                    })) || null
                                }
                              />
                              <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                                <span className="bg-background/90 px-2 py-1 rounded text-xs font-medium">Klikk for å forstørre</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* SORA Analysis */}
                    {mission.sora && (
                      <div className="pt-2 border-t border-border/50">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-muted-foreground">SORA-ANALYSE</p>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleEditSora(mission.id)}
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Rediger
                            </Button>
                            <Badge variant="outline" className={
                              mission.sora.sora_status === "Ferdig" 
                                ? "bg-green-500/20 text-green-300 border-green-500/30"
                                : mission.sora.sora_status === "Pågår"
                                ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                                : "bg-gray-500/20 text-gray-300 border-gray-500/30"
                            }>
                              {mission.sora.sora_status}
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          {mission.sora.sail && (
                            <div>
                              <p className="text-xs text-muted-foreground">SAIL</p>
                              <p className="font-medium text-foreground">{mission.sora.sail}</p>
                            </div>
                          )}
                          {mission.sora.igrc && (
                            <div>
                              <p className="text-xs text-muted-foreground">Initial GRC</p>
                              <p className="font-medium text-foreground">{mission.sora.igrc}</p>
                            </div>
                          )}
                          {mission.sora.fgrc && (
                            <div>
                              <p className="text-xs text-muted-foreground">Final GRC</p>
                              <p className="font-medium text-foreground">{mission.sora.fgrc}</p>
                            </div>
                          )}
                          {mission.sora.residual_risk_level && (
                            <div>
                              <p className="text-xs text-muted-foreground">Residual Risk</p>
                              <p className="font-medium text-foreground">{mission.sora.residual_risk_level}</p>
                            </div>
                          )}
                        </div>
                        {mission.sora.residual_risk_comment && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {mission.sora.residual_risk_comment}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Incidents Section */}
                    {mission.incidents?.length > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <p className="text-xs font-semibold text-muted-foreground">
                            TILKNYTTEDE HENDELSER ({mission.incidents.length})
                          </p>
                        </div>
                        <div className="space-y-2">
                          {mission.incidents.map((incident: any) => (
                            <div
                              key={incident.id}
                              onClick={() => {
                                setSelectedIncident(incident);
                                setIncidentDialogOpen(true);
                              }}
                              className="p-2 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-sm">{incident.tittel}</h4>
                                  <div className="flex flex-wrap items-center gap-1 text-xs mt-1">
                                    <Badge className={incidentSeverityColors[incident.alvorlighetsgrad] || ""}>
                                      {incident.alvorlighetsgrad}
                                    </Badge>
                                    {incident.hovedaarsak && (
                                      <Badge variant="outline" className="bg-amber-500/20 text-amber-900 border-amber-500/30">
                                        {incident.hovedaarsak}
                                      </Badge>
                                    )}
                                    <span className="text-muted-foreground">
                                      {format(new Date(incident.hendelsestidspunkt), "dd. MMM yyyy", { locale: nb })}
                                    </span>
                                  </div>
                                </div>
                                <Badge className={incidentStatusColors[incident.status] || ""}>
                                  {incident.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Flight Logs Section */}
                    {mission.flightLogs?.length > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="h-4 w-4 text-primary" />
                          <p className="text-xs font-semibold text-muted-foreground">
                            FLYTURER ({mission.flightLogs.length})
                          </p>
                        </div>
                        <div className="space-y-2">
                          {mission.flightLogs.map((log: any) => (
                            <div
                              key={log.id}
                              className="p-3 bg-card/30 rounded border border-border/30"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{format(new Date(log.flight_date), "dd. MMMM yyyy HH:mm", { locale: nb })}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{log.flight_duration_minutes} min</span>
                                </div>
                                {log.pilot && (
                                  <div className="flex items-center gap-2">
                                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>{log.pilot.full_name}</span>
                                  </div>
                                )}
                                {log.drones && (
                                  <div className="flex items-center gap-2">
                                    <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>{log.drones.modell}</span>
                                  </div>
                                )}
                              </div>
                              
                              {/* SafeSky Mode and Checklists */}
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                {log.safesky_mode && log.safesky_mode !== 'none' && (
                                  <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-900 border-blue-500/30">
                                    <Radio className="h-3 w-3 mr-1" />
                                    SafeSky: {log.safesky_mode === 'advisory' ? 'Advisory' : 'Live UAV'}
                                  </Badge>
                                )}
                                {log.completed_checklists && log.completed_checklists.length > 0 && (
                                  <ChecklistBadges checklistIds={log.completed_checklists} />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {mission.merknader && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">MERKNADER</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{mission.merknader}</p>
                      </div>
                    )}

                    {/* Approver Comments */}
                    {Array.isArray(mission.approver_comments) && mission.approver_comments.length > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">KOMMENTARER</p>
                        <div className="space-y-1.5">
                          {mission.approver_comments.map((c: any, i: number) => (
                            <div key={i} className="text-sm bg-muted/50 rounded-md p-2">
                              <span className="font-medium">Kommentar fra godkjenner {c.author_name}:</span>{' '}
                              {c.comment}
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({new Date(c.created_at).toLocaleDateString('no-NO', { day: '2-digit', month: 'short', year: 'numeric' })})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Add Mission Dialog */}
        <AddMissionDialog
          open={addDialogOpen}
          onOpenChange={(open) => {
            setAddDialogOpen(open);
            if (!open) {
              // Clear initial data when dialog closes
              setInitialRouteData(null);
              setInitialFormData(null);
              setInitialSelectedPersonnel([]);
              setInitialSelectedEquipment([]);
              setInitialSelectedDrones([]);
              setInitialSelectedCustomer("");
            }
          }}
          onMissionAdded={handleMissionAdded}
          initialRouteData={initialRouteData}
          initialFormData={initialFormData}
          initialSelectedPersonnel={initialSelectedPersonnel}
          initialSelectedEquipment={initialSelectedEquipment}
          initialSelectedDrones={initialSelectedDrones}
          initialSelectedCustomer={initialSelectedCustomer}
        />

        {/* Edit Mission Dialog */}
        <AddMissionDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) {
              // Clear initial data when dialog closes
              setInitialRouteData(null);
              setInitialFormData(null);
              setInitialSelectedPersonnel([]);
              setInitialSelectedEquipment([]);
              setInitialSelectedDrones([]);
              setInitialSelectedCustomer("");
            }
          }}
          onMissionAdded={handleMissionUpdated}
          mission={editingMission}
          initialRouteData={initialRouteData}
          initialFormData={initialFormData}
          initialSelectedPersonnel={initialSelectedPersonnel}
          initialSelectedEquipment={initialSelectedEquipment}
          initialSelectedDrones={initialSelectedDrones}
          initialSelectedCustomer={initialSelectedCustomer}
        />

        {/* SORA Analysis Dialog */}
        <SoraAnalysisDialog
          open={soraDialogOpen}
          onOpenChange={setSoraDialogOpen}
          missionId={soraEditingMissionId || undefined}
          onSaved={handleSoraSaved}
        />

        {/* Incident Detail Dialog */}
        <IncidentDetailDialog
          open={incidentDialogOpen}
          onOpenChange={setIncidentDialogOpen}
          incident={selectedIncident}
        />

        {/* Expanded Map Dialog */}
        {expandedMapMission && (() => {
          const routeCoords = (expandedMapMission.route as any)?.coordinates;
          const effectiveLat = (expandedMapMission as any).latitude ?? routeCoords?.[0]?.lat;
          const effectiveLng = (expandedMapMission as any).longitude ?? routeCoords?.[0]?.lng;
          
          // Also try to get coordinates from flight tracks if no mission coords
          const firstTrack = (expandedMapMission as any).flightLogs?.find((log: any) => log.flight_track?.positions?.length > 0);
          const trackLat = firstTrack?.flight_track?.positions?.[0]?.lat;
          const trackLng = firstTrack?.flight_track?.positions?.[0]?.lng;
          
          const finalLat = effectiveLat ?? trackLat;
          const finalLng = effectiveLng ?? trackLng;
          
          if (!finalLat || !finalLng) return null;
          
          return (
            <ExpandedMapDialog
              open={!!expandedMapMission}
              onOpenChange={(open) => !open && setExpandedMapMission(null)}
              latitude={finalLat}
              longitude={finalLng}
              route={expandedMapMission.route as any}
              flightTracks={
                (expandedMapMission as any).flightLogs
                  ?.filter((log: any) => log.flight_track?.positions?.length > 0)
                  .map((log: any) => ({
                    positions: log.flight_track.positions,
                    flightLogId: log.id,
                    flightDate: log.flight_date,
                  })) || null
              }
              missionTitle={expandedMapMission.tittel}
            />
          );
        })()}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingMission} onOpenChange={(open) => !open && setDeletingMission(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Er du sikker på at du vil slette gjeldende oppdrag?</AlertDialogTitle>
              <AlertDialogDescription>
                Denne handlingen kan ikke angres. Oppdraget "{deletingMission?.tittel}" og alle tilknyttede data vil bli permanent slettet.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteMission} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Slett oppdrag
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Document Detail Dialog */}
        <DocumentDetailDialog
          open={documentDialogOpen}
          onOpenChange={setDocumentDialogOpen}
          document={selectedDocument}
          status={(() => {
            if (!selectedDocument?.gyldig_til) return "Grønn";
            const daysUntil = Math.ceil((new Date(selectedDocument.gyldig_til).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysUntil < 0) return "Rød";
            if (daysUntil <= (selectedDocument.varsel_dager_for_utløp || 30)) return "Gul";
            return "Grønn";
          })()}
        />

        {/* Risk Assessment Type Dialog */}
        <RiskAssessmentTypeDialog
          open={riskTypeDialogOpen}
          onOpenChange={setRiskTypeDialogOpen}
          onSelectAI={handleSelectAI}
          onSelectSORA={handleSelectSORA}
        />

        {/* AI Risk Assessment Dialog */}
        {riskAssessmentMission && (
          <RiskAssessmentDialog
            open={riskDialogOpen}
            onOpenChange={(open) => {
              setRiskDialogOpen(open);
              if (!open) {
                setRiskAssessmentMission(null);
                setRiskDialogShowHistory(false);
                fetchMissions(); // Refresh to show new assessment
              }
            }}
            mission={riskAssessmentMission}
            initialTab={riskDialogShowHistory ? 'history' : 'input'}
          />
        )}

        {/* Export PDF Dialog */}
        <AlertDialog open={exportPdfDialogOpen} onOpenChange={setExportPdfDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eksporter oppdragsrapport</AlertDialogTitle>
              <AlertDialogDescription>
                {exportPdfMission?.aiRisk ? (
                  <div className="space-y-4 mt-2">
                    <p>Velg hva som skal inkluderes i rapporten:</p>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="includeRisk" 
                        checked={includeRiskAssessment}
                        onCheckedChange={(checked) => setIncludeRiskAssessment(checked === true)}
                      />
                      <label 
                        htmlFor="includeRisk" 
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        Inkluder siste AI-risikovurdering
                      </label>
                    </div>
                  </div>
                ) : (
                  <p>Oppdraget "{exportPdfMission?.tittel}" vil bli eksportert som PDF og lagret i dokumenter.</p>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmExportPdf}>
                Eksporter PDF
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default Oppdrag;
