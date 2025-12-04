import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Ruler
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import droneBackground from "@/assets/drone-background.png";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DroneWeatherPanel } from "@/components/DroneWeatherPanel";
import { MissionMapPreview } from "@/components/dashboard/MissionMapPreview";
import { AirspaceWarnings } from "@/components/dashboard/AirspaceWarnings";
import { AddMissionDialog, RouteData } from "@/components/dashboard/AddMissionDialog";
import { SoraAnalysisDialog } from "@/components/dashboard/SoraAnalysisDialog";
import { IncidentDetailDialog } from "@/components/dashboard/IncidentDetailDialog";
import { toast } from "sonner";

type Mission = any;

const statusColors: Record<string, string> = {
  Planlagt: "bg-blue-500/20 text-blue-900 border-blue-500/30",
  Pågående: "bg-green-500/20 text-green-900 border-green-500/30",
  Fullført: "bg-gray-500/20 text-gray-900 border-gray-500/30",
  Avbrutt: "bg-red-500/20 text-red-900 border-red-500/30"
};

const riskColors: Record<string, string> = {
  Lav: "bg-green-500/20 text-green-900 border-green-500/30",
  Middels: "bg-yellow-500/20 text-yellow-900 border-yellow-500/30",
  Høy: "bg-red-500/20 text-red-900 border-red-500/30"
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

const Oppdrag = () => {
  const { user, loading, companyId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"active" | "completed">("active");
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [soraDialogOpen, setSoraDialogOpen] = useState(false);
  const [soraEditingMissionId, setSoraEditingMissionId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  
  // State for route planner navigation
  const [initialRouteData, setInitialRouteData] = useState<RouteData | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialSelectedPersonnel, setInitialSelectedPersonnel] = useState<string[]>([]);
  const [initialSelectedEquipment, setInitialSelectedEquipment] = useState<string[]>([]);
  const [initialSelectedDrones, setInitialSelectedDrones] = useState<string[]>([]);
  const [initialSelectedCustomer, setInitialSelectedCustomer] = useState<string>("");

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
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (companyId) {
      fetchMissions();
    }
  }, [companyId, filterTab]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('oppdrag-page-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'missions'
        },
        () => {
          fetchMissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterTab, companyId]);

  const fetchMissions = async () => {
    setIsLoading(true);
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
        .order("tidspunkt", { ascending: filterTab === "active" });

      if (filterTab === "active") {
        query = query.in("status", ["Planlagt", "Pågående"]);
      } else {
        query = query.eq("status", "Fullført");
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch related data for each mission
      const missionsWithDetails = await Promise.all(
        (data || []).map(async (mission) => {
          // Fetch personnel
          const { data: personnel } = await supabase
            .from("mission_personnel")
            .select("profile_id, profiles(id, full_name)")
            .eq("mission_id", mission.id);

          // Fetch drones
          const { data: drones } = await supabase
            .from("mission_drones")
            .select("drone_id, drones(id, modell, serienummer)")
            .eq("mission_id", mission.id);

          // Fetch equipment
          const { data: equipment } = await supabase
            .from("mission_equipment")
            .select("equipment_id, equipment(id, navn, type)")
            .eq("mission_id", mission.id);

          // Fetch SORA
          const { data: sora } = await supabase
            .from("mission_sora")
            .select("*")
            .eq("mission_id", mission.id)
            .single();

          // Fetch incidents linked to this mission
          const { data: incidents } = await supabase
            .from("incidents")
            .select("*")
            .eq("mission_id", mission.id);

          return {
            ...mission,
            personnel: personnel || [],
            drones: drones || [],
            equipment: equipment || [],
            sora: sora || null,
            incidents: incidents || []
          };
        })
      );

      setMissions(missionsWithDetails);
    } catch (error) {
      console.error("Error fetching missions:", error);
      toast.error("Kunne ikke laste oppdrag");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMissions = missions.filter((mission) => {
    const matchesSearch =
      searchQuery === "" ||
      mission.tittel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mission.lokasjon?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mission.beskrivelse?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
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

  const exportToPDF = async (mission: Mission) => {
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      
      // Fetch airspace warnings if coordinates exist
      let airspaceWarnings: any[] = [];
      if (mission.latitude && mission.longitude) {
        const { data: airspaceData } = await supabase.rpc("check_mission_airspace", {
          p_lat: mission.latitude,
          p_lon: mission.longitude,
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
      pdf.setFont("helvetica", "bold");
      pdf.text("Oppdragsrapport", pageWidth / 2, 20, { align: "center" });
      
      // Mission title
      pdf.setFontSize(14);
      pdf.text(mission.tittel, 15, 35);
      
      let yPos = 45;
      
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
        pdf.setFont("helvetica", "bold");
        pdf.text("Luftromsadvarsler", 15, yPos);
        yPos += 7;
        
        const levelLabels: Record<string, string> = {
          warning: "ADVARSEL",
          caution: "FORSIKTIGHET",
          note: "INFORMASJON"
        };
        
        const airspaceData = airspaceWarnings.map((w: any) => [
          levelLabels[w.level] || w.level,
          w.zone_name || "-",
          w.is_inside ? "Innenfor sone" : `${Math.round(w.distance_meters)}m unna`,
          w.message || "-"
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
        pdf.setFont("helvetica", "bold");
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
      pdf.setFont("helvetica", "bold");
      pdf.text("Grunnleggende informasjon", 15, yPos);
      yPos += 7;
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      
      const basicInfo = [
        ["Status", mission.status],
        ["Risikonivå", mission.risk_nivå],
        ["Lokasjon", mission.lokasjon],
        ["Dato/tid", format(new Date(mission.tidspunkt), "dd. MMMM yyyy HH:mm", { locale: nb })],
        ...(mission.slutt_tidspunkt ? [["Sluttid", format(new Date(mission.slutt_tidspunkt), "dd. MMMM yyyy HH:mm", { locale: nb })]] : []),
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
        pdf.setFont("helvetica", "bold");
        pdf.text("Kundeinformasjon", 15, yPos);
        yPos += 7;
        
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        
        const customerInfo = [
          ["Navn", mission.customers.navn],
          ...(mission.customers.kontaktperson ? [["Kontaktperson", mission.customers.kontaktperson]] : []),
          ...(mission.customers.telefon ? [["Telefon", mission.customers.telefon]] : []),
          ...(mission.customers.epost ? [["E-post", mission.customers.epost]] : [])
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
        pdf.setFont("helvetica", "bold");
        pdf.text("Personell", 15, yPos);
        yPos += 7;
        
        const personnelData = mission.personnel.map((p: any) => [
          p.profiles?.full_name || "Ukjent"
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
        pdf.setFont("helvetica", "bold");
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
        pdf.setFont("helvetica", "bold");
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
        pdf.setFont("helvetica", "bold");
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
      
      // Incidents
      if (mission.incidents?.length > 0) {
        if (yPos > 220) {
          pdf.addPage();
          yPos = 20;
        }
        
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text("Tilknyttede hendelser", 15, yPos);
        yPos += 7;
        
        const incidentData = mission.incidents.map((incident: any) => [
          incident.tittel,
          incident.alvorlighetsgrad,
          incident.status,
          incident.hovedaarsak || "-",
          format(new Date(incident.hendelsestidspunkt), "dd.MM.yyyy HH:mm", { locale: nb })
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
      
      // Description & Notes
      if (mission.beskrivelse || mission.merknader) {
        if (yPos > 240) {
          pdf.addPage();
          yPos = 20;
        }
        
        if (mission.beskrivelse) {
          pdf.setFontSize(12);
          pdf.setFont("helvetica", "bold");
          pdf.text("Beskrivelse", 15, yPos);
          yPos += 7;
          
          pdf.setFont("helvetica", "normal");
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
          pdf.setFont("helvetica", "bold");
          pdf.text("Merknader", 15, yPos);
          yPos += 7;
          
          pdf.setFont("helvetica", "normal");
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
          opprettet_av: user?.id,
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
        <Header />

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
                          <Badge className={`text-xs ${statusColors[mission.status] || ""}`}>{mission.status}</Badge>
                          <Badge className={`text-xs ${riskColors[mission.risk_nivå] || ""}`}>{mission.risk_nivå} risiko</Badge>
                          {mission.sora && (
                            <Badge variant="outline" className="text-xs">
                              <FileText className="h-3 w-3 mr-1" />
                              SORA: {mission.sora.sora_status}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Button onClick={() => handleEditMission(mission)} size="sm" variant="outline" className="w-full sm:w-auto justify-start sm:justify-center">
                          <Edit className="h-4 w-4 mr-2" />
                          Rediger
                        </Button>
                        <Button onClick={() => exportToPDF(mission)} size="sm" variant="outline" className="w-full sm:w-auto justify-start sm:justify-center">
                          <Download className="h-4 w-4 mr-2" />
                          Eksporter PDF
                        </Button>
                      </div>
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
                          <ul className="space-y-1">
                            {mission.personnel.map((p: any) => (
                              <li key={p.profile_id} className="text-sm text-foreground">
                                {p.profiles?.full_name || "Ukjent"}
                              </li>
                            ))}
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
                          <ul className="space-y-1">
                            {mission.drones.map((d: any) => (
                              <li key={d.drone_id} className="text-sm text-foreground">
                                {d.drones?.modell} (SN: {d.drones?.serienummer})
                              </li>
                            ))}
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
                          <ul className="space-y-1">
                            {mission.equipment.map((e: any) => (
                              <li key={e.equipment_id} className="text-sm text-foreground">
                                {e.equipment?.navn} ({e.equipment?.type})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">Ingen tilknyttet</p>
                        )}
                      </div>
                    </div>

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
                    {mission.latitude && mission.longitude && (
                      <div className="pt-2 border-t border-border/50 space-y-3 sm:space-y-4">
                        <DroneWeatherPanel
                          latitude={mission.latitude}
                          longitude={mission.longitude}
                          compact
                        />
                        <AirspaceWarnings
                          latitude={mission.latitude}
                          longitude={mission.longitude}
                        />
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2">KART</p>
                          <div className="h-[150px] sm:h-[200px] relative overflow-hidden rounded-lg">
                            <MissionMapPreview
                              latitude={mission.latitude}
                              longitude={mission.longitude}
                              route={mission.route as any}
                            />
                          </div>
                        </div>
                      </div>
                    )}

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

                    {/* Notes */}
                    {mission.merknader && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">MERKNADER</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{mission.merknader}</p>
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
      </div>
    </div>
  );
};

export default Oppdrag;
