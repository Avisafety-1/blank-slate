import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar as CalendarIcon, Plus, Download, ChevronDown, LayoutGrid, GanttChart } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResourceTimeline } from "@/components/dashboard/ResourceTimeline";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import droneBackground from "@/assets/drone-background.png";
import { format, isSameDay } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtimeChannel";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "react-i18next";

import type { Tables } from "@/integrations/supabase/types";
import { AddMissionDialog } from "@/components/dashboard/AddMissionDialog";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { AddIncidentDialog } from "@/components/dashboard/AddIncidentDialog";
import { IncidentDetailDialog } from "@/components/dashboard/IncidentDetailDialog";
import { AddNewsDialog } from "@/components/dashboard/AddNewsDialog";
import DocumentCardModal from "@/components/documents/DocumentCardModal";
import { useAuth } from "@/contexts/AuthContext";
import { ChecklistExecutionDialog } from "@/components/resources/ChecklistExecutionDialog";
import { CalendarExportDialog } from "@/components/dashboard/CalendarExportDialog";

interface CalendarEvent {
  type: string;
  title: string;
  date: Date;
  color: string;
  description?: string;
  id?: string;
  isCustom?: boolean;
  sourceTable?: string;
  checklistId?: string | null;
  technicalResponsibleId?: string | null;
}

type CalendarEventDB = Tables<"calendar_events">;


const getColorForType = (type: string): string => {
  switch (type) {
    case "Oppdrag": return "text-primary";
    case "Vedlikehold": return "text-orange-500";
    case "Dokument": return "text-blue-500";
    case "Møte": return "text-purple-500";
    default: return "text-gray-500";
  }
};

export default function Kalender() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('en') ? enUS : nb;
  const navigate = useNavigate();
  const { user, companyId, ensureValidToken, isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const [month, setMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customEvents, setCustomEvents] = useState<CalendarEventDB[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [drones, setDrones] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [accessories, setAccessories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  

  // Dialog states for different entry types
  const [addMissionDialogOpen, setAddMissionDialogOpen] = useState(false);
  const [addIncidentDialogOpen, setAddIncidentDialogOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [documentModalState, setDocumentModalState] = useState<{
    document: any | null;
    isCreating: boolean;
  }>({
    document: null,
    isCreating: false,
  });

  // Detail dialog states
  const [missionDetailDialogOpen, setMissionDetailDialogOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<any | null>(null);
  const [incidentDetailDialogOpen, setIncidentDetailDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [documentDetailDialogOpen, setDocumentDetailDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null);

  // Checklist dialog state
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [pendingMaintenanceEvent, setPendingMaintenanceEvent] = useState<CalendarEvent | null>(null);
  const [confirmCalendarMaintenance, setConfirmCalendarMaintenance] = useState(false);
  const [pendingConfirmEvent, setPendingConfirmEvent] = useState<CalendarEvent | null>(null);

  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // News dialog state
  const [addNewsDialogOpen, setAddNewsDialogOpen] = useState(false);

  // Custom event form state
  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "",
    type: "Annet",
    description: "",
    time: "09:00",
  });
  const [savingEvent, setSavingEvent] = useState(false);

  useEffect(() => {
    // Use AuthContext user instead of direct session check (works offline)
    if (!user && !navigator.onLine) return; // Don't redirect if offline
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);


  useEffect(() => {
    fetchCustomEvents();
  }, [companyId]);

  // Real-time subscriptions — single consolidated channel
  useEffect(() => {
    const refetchIfOnline = () => {
      if (!navigator.onLine) return;
      fetchCustomEvents();
    };

    const channel = createUniqueChannel('kalender-main')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, refetchIfOnline)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, refetchIfOnline)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, refetchIfOnline)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, refetchIfOnline)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drones' }, refetchIfOnline)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, refetchIfOnline)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drone_accessories' }, refetchIfOnline)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const fetchCustomEvents = async () => {
    // 1. Load cache first
    if (companyId) {
      const cached = getCachedData<any>(`offline_calendar_${companyId}`);
      if (cached) {
        setCustomEvents(cached.customEvents || []);
        setMissions(cached.missions || []);
        setIncidents(cached.incidents || []);
        setDocuments(cached.documents || []);
        setDrones(cached.drones || []);
        setEquipment(cached.equipment || []);
        setAccessories(cached.accessories || []);
      }
    }

    // 2. Skip network if offline
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    // 3. Fetch fresh data
    try {
      // Fetch calendar events
      const { data: calendarData, error: calendarError } = await supabase
        .from('calendar_events')
        .select('*')
        .order('event_date', { ascending: true });

      if (calendarError) throw calendarError;
      setCustomEvents(calendarData || []);

      // Fetch missions
      const { data: missionsData, error: missionsError } = await supabase
        .from('missions')
        .select('id, tittel, beskrivelse, tidspunkt, slutt_tidspunkt, status')
        .order('tidspunkt', { ascending: true });

      if (!missionsError) {
        setMissions(missionsData || []);
      }

      // Fetch incidents
      const { data: incidentsData, error: incidentsError } = await supabase
        .from('incidents')
        .select('id, tittel, beskrivelse, hendelsestidspunkt, alvorlighetsgrad, status')
        .order('hendelsestidspunkt', { ascending: true });

      if (!incidentsError) {
        setIncidents(incidentsData || []);
      }

      // Fetch documents with expiry dates
      const { data: documentsData, error: documentsError } = await supabase
        .from('documents')
        .select('id, tittel, kategori, gyldig_til')
        .not('gyldig_til', 'is', null)
        .order('gyldig_til', { ascending: true });

      if (!documentsError) {
        setDocuments(documentsData || []);
      }

      // Fetch drones with inspection dates
      const { data: dronesData, error: dronesError } = await supabase
        .from('drones')
        .select('id, modell, neste_inspeksjon, sjekkliste_id, technical_responsible_id')
        .not('neste_inspeksjon', 'is', null)
        .order('neste_inspeksjon', { ascending: true });

      if (!dronesError) {
        setDrones(dronesData || []);
      }

      // Fetch equipment with maintenance dates
      const { data: equipmentData, error: equipmentError } = await supabase
        .from('equipment')
        .select('id, navn, neste_vedlikehold, sjekkliste_id')
        .not('neste_vedlikehold', 'is', null)
        .order('neste_vedlikehold', { ascending: true });

      if (!equipmentError) {
        setEquipment(equipmentData || []);
      }

      // Fetch drone accessories with maintenance dates
      const { data: accessoriesData, error: accessoriesError } = await supabase
        .from('drone_accessories')
        .select('id, navn, neste_vedlikehold')
        .not('neste_vedlikehold', 'is', null)
        .order('neste_vedlikehold', { ascending: true });

      if (!accessoriesError) {
        setAccessories(accessoriesData || []);
      }

      // Cache all calendar data for offline
      if (companyId) {
        setCachedData(`offline_calendar_${companyId}`, {
          customEvents: calendarData || [],
          missions: missionsData || [],
          incidents: incidentsData || [],
          documents: documentsData || [],
          drones: dronesData || [],
          equipment: equipmentData || [],
          accessories: accessoriesData || [],
        });
      }
    } catch (error: any) {
      console.error('Error fetching calendar events:', error);
      if (navigator.onLine) {
        toast.error('Kunne ikke laste kalenderoppføringer');
      }
    } finally {
      setLoading(false);
    }
  };

  // Combine all events from different sources
  const allEvents: CalendarEvent[] = [
    // Calendar events
    ...customEvents.map((event) => {
      const eventDate = new Date(event.event_date);
      if (event.event_time) {
        const [hours, minutes] = event.event_time.split(':');
        eventDate.setHours(parseInt(hours), parseInt(minutes));
      }
      
      return {
        id: event.id,
        type: event.type,
        title: event.title,
        date: eventDate,
        description: event.description || undefined,
        color: getColorForType(event.type),
        isCustom: true,
        sourceTable: 'calendar_events',
      };
    }),
    
    // Missions
    ...missions.map((mission) => ({
      id: mission.id,
      type: "Oppdrag",
      title: mission.tittel,
      date: new Date(mission.tidspunkt),
      description: mission.beskrivelse,
      color: getColorForType("Oppdrag"),
      sourceTable: 'missions',
    })),
    
    // Incidents
    ...incidents.map((incident) => ({
      id: incident.id,
      type: "Hendelse",
      title: incident.tittel,
      date: new Date(incident.hendelsestidspunkt),
      description: incident.beskrivelse,
      color: getColorForType("Hendelse"),
      sourceTable: 'incidents',
    })),
    
    // Documents (expiring)
    ...documents.map((doc) => ({
      id: doc.id,
      type: "Dokument",
      title: `${doc.tittel} utgår`,
      date: new Date(doc.gyldig_til),
      description: doc.kategori,
      color: getColorForType("Dokument"),
      sourceTable: 'documents',
    })),
    
    // Drones (inspection)
    ...drones.map((drone) => ({
      id: drone.id,
      type: "Vedlikehold",
      title: `${drone.modell} - inspeksjon`,
      date: new Date(drone.neste_inspeksjon),
      color: getColorForType("Vedlikehold"),
      sourceTable: 'drones',
      checklistId: drone.sjekkliste_id,
      technicalResponsibleId: drone.technical_responsible_id,
    })),
    
    // Equipment (maintenance)
    ...equipment.map((eq) => ({
      id: eq.id,
      type: "Vedlikehold",
      title: `${eq.navn} - vedlikehold`,
      date: new Date(eq.neste_vedlikehold),
      color: getColorForType("Vedlikehold"),
      sourceTable: 'equipment',
      checklistId: eq.sjekkliste_id,
    })),
    
    // Drone accessories (maintenance)
    ...accessories.map((acc) => ({
      id: acc.id,
      type: "Vedlikehold",
      title: `${acc.navn} - vedlikehold`,
      date: new Date(acc.neste_vedlikehold),
      color: getColorForType("Vedlikehold"),
      sourceTable: 'drone_accessories',
    })),
  ];

  const getEventsForDate = (checkDate: Date) => {
    return allEvents.filter((event) => isSameDay(event.date, checkDate));
  };

  const hasEvents = (checkDate: Date) => {
    return getEventsForDate(checkDate).length > 0;
  };

  const getEventDotColor = (type: string): string => {
    switch (type) {
      case "Oppdrag": return "bg-primary";
      case "Hendelse": return "bg-red-500";
      case "Dokument": return "bg-blue-400";
      case "Vedlikehold": return "bg-orange-500";
      case "Nyhet": return "bg-purple-500";
      case "Annet": return "bg-gray-400";
      default: return "bg-gray-400";
    }
  };

  const getEventBackgroundColor = (type: string): string => {
    switch (type) {
      case "Oppdrag": return "bg-primary/10 hover:bg-primary/20 border-primary/20";
      case "Hendelse": return "bg-red-500/10 hover:bg-red-500/20 border-red-500/20";
      case "Dokument": return "bg-blue-400/10 hover:bg-blue-400/20 border-blue-400/20";
      case "Vedlikehold": return "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20";
      case "Nyhet": return "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20";
      case "Annet": return "bg-gray-400/10 hover:bg-gray-400/20 border-gray-400/20";
      default: return "bg-gray-400/10 hover:bg-gray-400/20 border-gray-400/20";
    }
  };

  const handleDateClick = (clickedDate: Date) => {
    setSelectedDate(clickedDate);
  };

  const handleMarkMaintenanceComplete = async (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!event.id || !event.sourceTable) return;

    // Check technical responsible restriction for drones
    if (event.sourceTable === 'drones' && event.technicalResponsibleId && user?.id !== event.technicalResponsibleId) {
      toast.error('Kun teknisk ansvarlig kan utføre inspeksjon på denne dronen');
      return;
    }
    
    // Check if the event has a checklist configured
    if (event.checklistId) {
      setPendingMaintenanceEvent(event);
      setChecklistDialogOpen(true);
      return;
    }
    
    // No checklist - show confirmation dialog
    setPendingConfirmEvent(event);
    setConfirmCalendarMaintenance(true);
  };

  const performMaintenanceUpdate = async (event: CalendarEvent) => {
    if (!event.id || !event.sourceTable) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    try {
      if (event.sourceTable === 'drones') {
        if (!user || !companyId) return;
        
        // Fetch drone to get interval + current flyvetimer
        const { data: drone, error: fetchError } = await supabase
          .from('drones')
          .select('inspection_interval_days, flyvetimer')
          .eq('id', event.id)
          .single();
        
        if (fetchError) throw fetchError;
        
        // Use shared helper for consistent inspection logic
        const { performDroneInspection } = await import("@/lib/droneInspection");
        await performDroneInspection({
          droneId: event.id,
          companyId,
          userId: user.id,
          currentFlyvetimer: drone?.flyvetimer ?? 0,
          inspectionIntervalDays: drone?.inspection_interval_days ?? null,
          inspectionType: 'Planlagt inspeksjon',
          notes: 'Utført via kalender',
        });
        
        toast.success('Inspeksjon registrert som utført');
        
      } else if (event.sourceTable === 'equipment') {
        // Fetch equipment to get interval
        const { data: eq, error: fetchError } = await supabase
          .from('equipment')
          .select('vedlikeholdsintervall_dager')
          .eq('id', event.id)
          .single();
        
        if (fetchError) throw fetchError;
        
        let nextMaintenance: string | null = null;
        if (eq?.vedlikeholdsintervall_dager) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + eq.vedlikeholdsintervall_dager);
          nextMaintenance = nextDate.toISOString().split('T')[0];
        }
        
        const { data, error } = await supabase
          .from('equipment')
          .update({
            sist_vedlikeholdt: today,
            neste_vedlikehold: nextMaintenance,
          })
          .eq('id', event.id)
          .select();
        
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Ingen rettighet til å oppdatere dette');
        }
        toast.success('Vedlikehold registrert som utført');
        
      } else if (event.sourceTable === 'drone_accessories') {
        // Fetch accessory to get interval
        const { data: accessory, error: fetchError } = await supabase
          .from('drone_accessories')
          .select('vedlikeholdsintervall_dager')
          .eq('id', event.id)
          .single();
        
        if (fetchError) throw fetchError;
        
        let nextMaintenance: string | null = null;
        if (accessory?.vedlikeholdsintervall_dager) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + accessory.vedlikeholdsintervall_dager);
          nextMaintenance = nextDate.toISOString().split('T')[0];
        }
        
        const { data, error } = await supabase
          .from('drone_accessories')
          .update({
            sist_vedlikehold: today,
            neste_vedlikehold: nextMaintenance,
          })
          .eq('id', event.id)
          .select();
        
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Ingen rettighet til å oppdatere dette');
        }
        toast.success('Vedlikehold registrert som utført');
      }
      
      fetchCustomEvents();
    } catch (error: any) {
      console.error('Error marking maintenance complete:', error);
      toast.error(error.message || 'Kunne ikke registrere vedlikehold');
    }
  };

  const handleChecklistComplete = async () => {
    if (pendingMaintenanceEvent) {
      await performMaintenanceUpdate(pendingMaintenanceEvent);
      setPendingMaintenanceEvent(null);
    }
  };

  const handleEventClick = async (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Close day dialog if open
    setDialogOpen(false);

    if (!event.id) {
      toast.info(event.title, {
        description: event.description,
      });
      return;
    }

    try {
      if (event.sourceTable === 'missions') {
        const { data, error } = await supabase
          .from('missions')
          .select('*')
          .eq('id', event.id)
          .single();

        if (error) throw error;
        setSelectedMission(data);
        setMissionDetailDialogOpen(true);
      } else if (event.sourceTable === 'documents') {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('id', event.id)
          .single();

        if (error) throw error;
        setSelectedDocument(data);
        setDocumentModalState({
          document: data,
          isCreating: false,
        });
        setDocumentDetailDialogOpen(true);
      } else if (event.sourceTable === 'incidents') {
        const { data, error } = await supabase
          .from('incidents')
          .select('*')
          .eq('id', event.id)
          .single();

        if (error) throw error;
        setSelectedIncident(data);
        setIncidentDetailDialogOpen(true);
      } else {
        // For calendar_events or unknown types
        toast.info(event.title, {
          description: event.description,
        });
      }
    } catch (error) {
      console.error('Error fetching event details:', error);
      toast.error('Kunne ikke laste detaljer');
    }
  };

  const handleAddEntry = (type: 'oppdrag' | 'hendelse' | 'dokument' | 'nyhet' | 'annet', closeDialog: boolean = false) => {
    if (closeDialog) {
      setDialogOpen(false);
    }
    switch (type) {
      case 'oppdrag':
        setAddMissionDialogOpen(true);
        break;
      case 'hendelse':
        setAddIncidentDialogOpen(true);
        break;
      case 'dokument':
        setDocumentModalState({
          document: null,
          isCreating: true,
        });
        setDocumentModalOpen(true);
        break;
      case 'nyhet':
        setAddNewsDialogOpen(true);
        break;
      case 'annet':
        // If no date is selected (clicking from top menu), use today's date
        if (!selectedDate) {
          setSelectedDate(new Date());
        }
        setShowAddEventForm(true);
        setDialogOpen(true);
        break;
    }
  };

  const handleAddCustomEvent = async () => {
    if (!newEvent.title.trim()) {
      toast.error(t('pages.calendar.titleRequired'));
      return;
    }

    if (!user || !companyId) {
      toast.error(t('pages.calendar.mustBeLoggedIn'));
      return;
    }

    setSavingEvent(true);
    try {
      const eventDate = selectedDate || new Date();
      const dateString = format(eventDate, "yyyy-MM-dd");

      const { error } = await supabase.from("calendar_events").insert({
        title: newEvent.title.trim(),
        type: newEvent.type,
        description: newEvent.description.trim() || null,
        event_date: dateString,
        event_time: newEvent.time,
        user_id: user.id,
        company_id: companyId,
      });

      if (error) throw error;

      toast.success(t('pages.calendar.entrySaved'));
      setNewEvent({ title: "", type: "Annet", description: "", time: "09:00" });
      setShowAddEventForm(false);
      setDialogOpen(false);
      fetchCustomEvents();
    } catch (error: any) {
      console.error("Error adding custom event:", error);
      toast.error(t('pages.calendar.couldNotSaveEntry'));
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDocumentModalClose = () => {
    setDocumentModalOpen(false);
    setDocumentModalState({
      document: null,
      isCreating: false,
    });
  };

  const handleDocumentSaveSuccess = () => {
    toast.success(t('pages.calendar.documentSaved'));
    fetchCustomEvents();
    handleDocumentModalClose();
  };

  const handleDocumentDeleteSuccess = () => {
    toast.success(t('pages.calendar.documentDeleted'));
    fetchCustomEvents();
    handleDocumentModalClose();
  };

  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full">
        {/* Main Content */}
        <main className="w-full px-3 sm:px-4 py-3 sm:py-5">
          <Tabs defaultValue="month" className="w-full font-operational">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-timeline-grid bg-timeline-surface/90 p-2 shadow-sm backdrop-blur-sm">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <TabsList className="h-9 bg-timeline-surface-strong p-0.5">
                <TabsTrigger value="month" className="gap-1.5">
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('pages.calendar.monthlyView')}</span>
                </TabsTrigger>
                <TabsTrigger value="resources" className="gap-1.5">
                  <GanttChart className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('pages.calendar.resourceCalendar')}</span>
                </TabsTrigger>
                </TabsList>
                <div className="hidden h-7 w-px bg-timeline-grid lg:block" />
                <div className="flex h-9 max-w-full items-center gap-3 overflow-x-auto px-1 text-[11px] text-muted-foreground" aria-label={t('pages.calendar.colorLegend')}>
                  {[
                    { type: 'Oppdrag', label: t('pages.calendar.mission') },
                    { type: 'Hendelse', label: t('pages.calendar.incident') },
                    { type: 'Dokument', label: t('pages.calendar.document') },
                    { type: 'Vedlikehold', label: t('pages.calendar.maintenance') },
                    { type: 'Nyhet', label: t('pages.calendar.news') },
                    { type: 'Annet', label: t('pages.calendar.other') },
                  ].map((item) => (
                    <span key={item.type} className="flex shrink-0 items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", getEventDotColor(item.type))} />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex h-9 items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setExportDialogOpen(true)}>
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('pages.calendar.synchronize')}</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-9 gap-2">
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('pages.calendar.addEntry')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleAddEntry('oppdrag')}>{t('pages.calendar.mission')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAddEntry('hendelse')}>{t('pages.calendar.incident')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAddEntry('dokument')}>{t('pages.calendar.document')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAddEntry('nyhet')}>{t('pages.calendar.news')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAddEntry('annet')}>{t('pages.calendar.other')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <TabsContent value="month">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-md border border-timeline-grid bg-timeline-surface shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-timeline-grid bg-timeline-surface-strong/70 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5 text-primary" />
                      <h2 className="font-display text-base font-semibold">{format(month, "MMMM yyyy", { locale: dateLocale })}</h2>
                    </div>
                  </div>

                  <Calendar
                    mode="single"
                    selected={selectedDate || undefined}
                    month={month}
                    onMonthChange={setMonth}
                    onDayClick={handleDateClick}
                    locale={dateLocale}
                    className="w-full rounded-none border-0 p-0 pointer-events-auto"
                    classNames={{
                      months: "flex w-full flex-col",
                      month: "w-full space-y-0",
                      caption: "flex h-11 justify-center relative items-center border-b border-timeline-grid",
                      caption_label: "hidden",
                      nav: "space-x-1 flex items-center absolute inset-x-3 top-1.5 justify-between",
                      nav_button: cn(
                        "h-8 w-8 bg-transparent p-0 opacity-70 hover:opacity-100"
                      ),
                      nav_button_previous: "",
                      nav_button_next: "",
                      table: "w-full border-collapse",
                      head_row: "flex w-full border-b border-timeline-grid bg-timeline-surface-strong/40",
                      head_cell: "w-full py-2 text-center font-display text-[10px] font-bold uppercase text-muted-foreground",
                      row: "flex w-full",
                      cell: cn(
                        "relative w-full border-b border-r border-timeline-grid/70 p-0 text-center last:border-r-0 focus-within:z-20",
                        "[&:has([aria-selected])]:bg-primary/5"
                      ),
                      day: cn(
                        "flex h-full min-h-[76px] w-full flex-col items-start justify-start rounded-none p-0 font-normal transition-colors hover:bg-timeline-surface-strong/60 sm:min-h-[126px]"
                      ),
                      day_selected: "bg-primary/5 text-foreground ring-2 ring-inset ring-primary",
                      day_today: "bg-primary/10 text-primary font-bold",
                      day_outside: "text-muted-foreground opacity-50",
                    }}
                    components={{
                      DayContent: ({ date: dayDate }) => {
                        const dayEvents = dayDate ? getEventsForDate(dayDate) : [];
                        return (
                          <div className="flex h-full w-full flex-col items-start p-1.5 sm:p-2">
                            <span className="mb-1 text-xs leading-none sm:text-sm">
                              {dayDate?.getDate()}
                            </span>
                            <div className="flex w-full flex-wrap gap-0.5 sm:gap-1">
                              {dayEvents.slice(0, isMobile ? 2 : 4).map((event, index) => (
                                <div
                                  key={event.id || index}
                                  className={cn(
                                    "w-full truncate rounded-sm border border-l-2 px-1 py-0.5 text-left text-[9px] font-medium leading-tight sm:text-[10px]",
                                    getEventBackgroundColor(event.type)
                                  )}
                                  title={event.title}
                                >
                                  <span className="hidden sm:inline">{event.title}</span>
                                  <span className="sm:hidden">
                                    <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-0.5", getEventDotColor(event.type))} />
                                  </span>
                                </div>
                              ))}
                              {dayEvents.length > (isMobile ? 2 : 4) && (
                                <span className="text-[9px] text-muted-foreground">
                                  +{dayEvents.length - (isMobile ? 2 : 4)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      },
                    }}
                  />
                </div>

                {selectedDate && (
                  <section className="overflow-hidden rounded-md border border-timeline-grid bg-timeline-surface shadow-sm">
                    <div className="flex items-center justify-between gap-3 border-b border-timeline-grid bg-timeline-surface-strong/70 px-4 py-3">
                      <h3 className="font-display text-sm font-semibold capitalize">
                        {t('pages.calendar.eventsForDate', { date: format(selectedDate, "EEEE d. MMMM", { locale: dateLocale }) })}
                      </h3>
                      <Badge variant="secondary" className="rounded-sm">{selectedEvents.length}</Badge>
                    </div>
                    {selectedEvents.length > 0 ? (
                      <div className="divide-y divide-timeline-grid/70">
                        {selectedEvents.map((event, index) => {
                          const isMaintenanceEvent = event.sourceTable === 'drones' || event.sourceTable === 'equipment' || event.sourceTable === 'drone_accessories';
                          return (
                            <div key={event.id || index} className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-timeline-surface-strong/60" onClick={(e) => handleEventClick(event, e)}>
                              <span className={cn("h-10 w-1 shrink-0 rounded-full", getEventDotColor(event.type))} />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="truncate font-display text-sm font-semibold">{event.title}</h4>
                                  <Badge variant="outline" className="rounded-sm text-[10px]">{t(`pages.calendar.eventTypes.${event.type}`, { defaultValue: event.type })}</Badge>
                                </div>
                                {event.description && <p className="mt-1 truncate text-xs text-muted-foreground">{event.description}</p>}
                              </div>
                              {isMaintenanceEvent && (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <Switch id={`calendar-list-maintenance-${event.id}`} onCheckedChange={() => handleMarkMaintenanceComplete(event, { stopPropagation: () => {} } as React.MouseEvent)} />
                                  <Label htmlFor={`calendar-list-maintenance-${event.id}`} className="hidden cursor-pointer text-xs text-muted-foreground sm:block">{t('pages.calendar.markAsCompleted')}</Label>
                                </div>
                              )}
                              <time className="shrink-0 font-mono text-xs text-muted-foreground">{format(event.date, "HH:mm")}</time>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('pages.calendar.noEventsThisDay')}</p>
                    )}
                  </section>
                )}
              </div>
            </TabsContent>

            <TabsContent value="resources">
              <div className="bg-card/50 backdrop-blur-sm rounded-lg border border-border p-3 sm:p-6">
                <ResourceTimeline />
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Event Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setShowAddEventForm(false);
          setNewEvent({ title: "", type: "Annet", description: "", time: "09:00" });
        }
      }}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {selectedDate && format(selectedDate, "dd. MMMM yyyy", { locale: dateLocale })}
            </DialogTitle>
          </DialogHeader>

          {!showAddEventForm ? (
            <>
              <div className="space-y-3">
                {selectedEvents.length > 0 ? (
                  selectedEvents.map((event, index) => {
                    const isMaintenanceEvent = event.sourceTable === 'drones' || 
                      event.sourceTable === 'equipment' || 
                      event.sourceTable === 'drone_accessories';
                    
                    return (
                      <div
                        key={event.id || index}
                        className="p-3 bg-card/30 rounded-lg border border-border hover:bg-card/50 cursor-pointer transition-colors"
                        onClick={(e) => handleEventClick(event, e)}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm mb-1">{event.title}</h4>
                            {event.description && (
                              <p className="text-xs text-muted-foreground mb-2">{event.description}</p>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {t(`pages.calendar.eventTypes.${event.type}`, { defaultValue: event.type })}
                            </Badge>
                            {isMaintenanceEvent && (
                              <div 
                                className="flex items-center gap-2 mt-2 pt-2 border-t border-border"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Switch
                                  id={`maintenance-${event.id}`}
                                  onCheckedChange={() => handleMarkMaintenanceComplete(event, { stopPropagation: () => {} } as React.MouseEvent)}
                                  className="data-[state=checked]:bg-green-500"
                                />
                                <Label 
                                  htmlFor={`maintenance-${event.id}`}
                                  className="text-xs text-muted-foreground cursor-pointer"
                                >
                                  {t('pages.calendar.markAsCompleted')}
                                </Label>
                              </div>
                            )}
                          </div>
                          <div className={cn("text-xs font-medium", event.color)}>
                            {format(event.date, "HH:mm")}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('pages.calendar.noEventsThisDay')}
                  </p>
                )}
              </div>

              {/* Add entry dropdown button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="w-full gap-2 mt-4">
                    <Plus className="w-4 h-4" />
                    {t('pages.calendar.add')}
                    <ChevronDown className="w-4 h-4 ml-auto" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => handleAddEntry('oppdrag', true)}>
                    {t('pages.calendar.mission')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddEntry('hendelse', true)}>
                    {t('pages.calendar.incident')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddEntry('dokument', true)}>
                    {t('pages.calendar.document')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddEntry('nyhet', true)}>
                    {t('pages.calendar.news')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddEntry('annet', false)}>
                    {t('pages.calendar.other')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            /* Custom event form */
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="event-title">{t('pages.calendar.titleLabel')}</Label>
                <Input
                  id="event-title"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder={t('pages.calendar.titlePlaceholderShort')}
                  disabled={savingEvent}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-type">{t('pages.calendar.type')}</Label>
                <Select
                  value={newEvent.type}
                  onValueChange={(v) => setNewEvent({ ...newEvent, type: v })}
                  disabled={savingEvent}
                >
                  <SelectTrigger id="event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Oppdrag">{t('pages.calendar.eventTypes.Oppdrag')}</SelectItem>
                    <SelectItem value="Vedlikehold">{t('pages.calendar.eventTypes.Vedlikehold')}</SelectItem>
                    <SelectItem value="Møte">{t('pages.calendar.eventTypes.Møte')}</SelectItem>
                    <SelectItem value="Annet">{t('pages.calendar.eventTypes.Annet')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('pages.calendar.dateTime')}</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                        disabled={savingEvent}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "PPP", { locale: dateLocale }) : <span>{t('pages.calendar.pickDate')}</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate || undefined}
                        onSelect={(date) => date && setSelectedDate(date)}
                        initialFocus
                        locale={dateLocale}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    id="event-time"
                    type="time"
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                    disabled={savingEvent}
                    className="w-28"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-description">{t('pages.calendar.descriptionLabel')}</Label>
                <Textarea
                  id="event-description"
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder={t('pages.calendar.descriptionPlaceholder')}
                  rows={3}
                  disabled={savingEvent}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleAddCustomEvent} disabled={savingEvent} className="flex-1">
                  {savingEvent ? t('pages.calendar.saving') : t('pages.calendar.save')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddEventForm(false);
                    setNewEvent({ title: "", type: "Annet", description: "", time: "09:00" });
                  }}
                  disabled={savingEvent}
                >
                  {t('pages.calendar.cancel')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reusable Dialogs */}
      <AddMissionDialog
        open={addMissionDialogOpen}
        onOpenChange={setAddMissionDialogOpen}
        onMissionAdded={() => {
          toast.success(t('pages.calendar.missionCreated'));
          fetchCustomEvents();
        }}
      />

      <AddIncidentDialog
        open={addIncidentDialogOpen}
        onOpenChange={setAddIncidentDialogOpen}
        defaultDate={selectedDate || undefined}
      />

      <AddNewsDialog
        open={addNewsDialogOpen}
        onOpenChange={setAddNewsDialogOpen}
      />

      <DocumentCardModal
        document={documentModalState.document}
        isOpen={documentModalOpen}
        onClose={handleDocumentModalClose}
        onSaveSuccess={handleDocumentSaveSuccess}
        onDeleteSuccess={handleDocumentDeleteSuccess}
        isAdmin={isAdmin}
        isCreating={documentModalState.isCreating}
      />

      {/* Detail Dialogs */}
      <MissionDetailDialog
        open={missionDetailDialogOpen}
        onOpenChange={setMissionDetailDialogOpen}
        mission={selectedMission}
      />

      <IncidentDetailDialog
        open={incidentDetailDialogOpen}
        onOpenChange={setIncidentDetailDialogOpen}
        incident={selectedIncident}
      />

      <DocumentCardModal
        document={selectedDocument}
        isOpen={documentDetailDialogOpen}
        onClose={() => {
          setDocumentDetailDialogOpen(false);
          setSelectedDocument(null);
        }}
        onSaveSuccess={() => {
          toast.success(t('pages.calendar.documentUpdated'));
          setDocumentDetailDialogOpen(false);
          setSelectedDocument(null);
          fetchCustomEvents();
        }}
        onDeleteSuccess={() => {
          toast.success(t('pages.calendar.documentDeleted'));
          setDocumentDetailDialogOpen(false);
          setSelectedDocument(null);
          fetchCustomEvents();
        }}
        isAdmin={isAdmin}
        isCreating={false}
      />

      {/* Checklist execution dialog for maintenance */}
      {pendingMaintenanceEvent && pendingMaintenanceEvent.checklistId && (
        <ChecklistExecutionDialog
          open={checklistDialogOpen}
          onOpenChange={(open) => {
            setChecklistDialogOpen(open);
            if (!open) {
              setPendingMaintenanceEvent(null);
            }
          }}
          checklistId={pendingMaintenanceEvent.checklistId}
          itemName={pendingMaintenanceEvent.title}
          onComplete={handleChecklistComplete}
        />
      )}

      <CalendarExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />

      <AlertDialog open={confirmCalendarMaintenance} onOpenChange={setConfirmCalendarMaintenance}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pages.calendar.confirmMaintenance')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pages.calendar.confirmMaintenanceDesc', { title: pendingConfirmEvent?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('pages.calendar.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingConfirmEvent) {
                  await performMaintenanceUpdate(pendingConfirmEvent);
                  setPendingConfirmEvent(null);
                }
              }}
            >
              {t('pages.calendar.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
