import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar as CalendarIcon, Plus, Download } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import droneBackground from "@/assets/drone-background.png";
import { format, isSameDay } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

import type { Tables } from "@/integrations/supabase/types";
import { AddMissionDialog } from "@/components/dashboard/AddMissionDialog";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { AddIncidentDialog } from "@/components/dashboard/AddIncidentDialog";
import { IncidentDetailDialog } from "@/components/dashboard/IncidentDetailDialog";
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
  const navigate = useNavigate();
  const { user, companyId } = useAuth();
  const isMobile = useIsMobile();
  const [date, setDate] = useState<Date | undefined>(new Date());
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
  const [isAdmin, setIsAdmin] = useState(false);

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

  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    const checkAdminStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });
        setIsAdmin(data || false);
      }
    };
    checkAdminStatus();
  }, []);

  useEffect(() => {
    fetchCustomEvents();
  }, [companyId]);

  // Real-time subscriptions
  useEffect(() => {
    const calendarChannel = supabase
      .channel('calendar-events-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events'
        },
        () => {
          fetchCustomEvents();
        }
      )
      .subscribe();

    const missionsChannel = supabase
      .channel('missions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'missions'
        },
        () => {
          fetchCustomEvents();
        }
      )
      .subscribe();

    const incidentsChannel = supabase
      .channel('incidents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents'
        },
        () => {
          fetchCustomEvents();
        }
      )
      .subscribe();

    const documentsChannel = supabase
      .channel('documents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents'
        },
        () => {
          fetchCustomEvents();
        }
      )
      .subscribe();

    const dronesChannel = supabase
      .channel('drones-calendar-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drones'
        },
        () => {
          fetchCustomEvents();
        }
      )
      .subscribe();

    const equipmentChannel = supabase
      .channel('equipment-calendar-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'equipment'
        },
        () => {
          fetchCustomEvents();
        }
      )
      .subscribe();

    const accessoriesChannel = supabase
      .channel('accessories-calendar-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drone_accessories'
        },
        () => {
          fetchCustomEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(calendarChannel);
      supabase.removeChannel(missionsChannel);
      supabase.removeChannel(incidentsChannel);
      supabase.removeChannel(documentsChannel);
      supabase.removeChannel(dronesChannel);
      supabase.removeChannel(equipmentChannel);
      supabase.removeChannel(accessoriesChannel);
    };
  }, [companyId]);

  const fetchCustomEvents = async () => {
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
        .select('id, modell, neste_inspeksjon, sjekkliste_id')
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
    } catch (error: any) {
      console.error('Error fetching calendar events:', error);
      toast.error('Kunne ikke laste kalenderoppføringer');
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

  const handleDateClick = (clickedDate: Date | undefined) => {
    if (clickedDate) {
      setSelectedDate(clickedDate);
      setDialogOpen(true);
    }
  };

  const handleMarkMaintenanceComplete = async (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!event.id || !event.sourceTable) return;
    
    // Check if the event has a checklist configured
    if (event.checklistId) {
      setPendingMaintenanceEvent(event);
      setChecklistDialogOpen(true);
      return;
    }
    
    // No checklist - proceed directly
    await performMaintenanceUpdate(event);
  };

  const performMaintenanceUpdate = async (event: CalendarEvent) => {
    if (!event.id || !event.sourceTable) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    try {
      if (event.sourceTable === 'drones') {
        // Fetch drone to get interval
        const { data: drone, error: fetchError } = await supabase
          .from('drones')
          .select('inspection_interval_days')
          .eq('id', event.id)
          .single();
        
        if (fetchError) throw fetchError;
        
        let nextInspection: string | null = null;
        if (drone?.inspection_interval_days) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + drone.inspection_interval_days);
          nextInspection = nextDate.toISOString().split('T')[0];
        }
        
        const { data, error } = await supabase
          .from('drones')
          .update({
            sist_inspeksjon: today,
            neste_inspeksjon: nextInspection,
          })
          .eq('id', event.id)
          .select();
        
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Ingen rettighet til å oppdatere dette');
        }

        // Also log to drone_inspections for the logbook
        if (user && companyId) {
          await supabase.from('drone_inspections').insert({
            drone_id: event.id,
            company_id: companyId,
            user_id: user.id,
            inspection_date: new Date().toISOString(),
            inspection_type: 'Planlagt inspeksjon',
            notes: `Utført via kalender`,
          });
        }
        
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
      
      setDialogOpen(false);
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

  const handleAddEntry = (type: 'oppdrag' | 'hendelse' | 'dokument') => {
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
    toast.success("Dokument lagret!");
    fetchCustomEvents();
    handleDocumentModalClose();
  };

  const handleDocumentDeleteSuccess = () => {
    toast.success("Dokument slettet!");
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
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Calendar */}
            <div className="flex-1 bg-card/50 backdrop-blur-sm rounded-lg border border-border p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  <h2 className="text-xl sm:text-2xl font-semibold">Månedsoversikt</h2>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button 
                    variant="outline" 
                    className="gap-2 w-full sm:w-auto"
                    onClick={() => setExportDialogOpen(true)}
                  >
                    <Download className="w-4 h-4" />
                    Synkroniser
                  </Button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="gap-2 w-full sm:w-auto">
                        <Plus className="w-4 h-4" />
                        Legg til oppføring
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleAddEntry('oppdrag')}>
                        Oppdrag
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAddEntry('hendelse')}>
                        Hendelse
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAddEntry('dokument')}>
                        Dokument
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <Calendar
                mode="single"
                selected={date}
                onSelect={handleDateClick}
                locale={nb}
                className={cn("rounded-md border-0 pointer-events-auto w-full")}
                classNames={{
                  months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 w-full",
                  month: "space-y-4 w-full",
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-lg font-medium",
                  nav: "space-x-1 flex items-center",
                  nav_button: cn(
                    "h-8 w-8 bg-transparent p-0 opacity-50 hover:opacity-100"
                  ),
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex w-full",
                  head_cell: "text-muted-foreground rounded-md w-full font-normal text-sm",
                  row: "flex w-full mt-2",
                  cell: cn(
                    "relative p-0 text-center focus-within:relative focus-within:z-20 w-full min-h-[70px] sm:min-h-[120px]",
                    "[&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50"
                  ),
                  day: cn(
                    "h-full w-full p-1 sm:p-2 font-normal hover:bg-accent/30 hover:text-accent-foreground rounded-md",
                    "flex flex-col items-start justify-start gap-1"
                  ),
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  day_today: "bg-accent text-accent-foreground font-semibold",
                  day_outside: "text-muted-foreground opacity-50",
                  day_disabled: "text-muted-foreground opacity-50",
                }}
                components={{
                  Day: ({ date: dayDate, ...props }) => {
                    const dayEvents = getEventsForDate(dayDate);

                    if (isMobile) {
                      const maxDots = 4;
                      const displayDots = dayEvents.slice(0, maxDots);
                      const hasMore = dayEvents.length > maxDots;

                      return (
                        <button
                          {...props}
                          onClick={() => handleDateClick(dayDate)}
                          className="h-full w-full p-1 font-normal hover:bg-accent/30 hover:text-accent-foreground rounded-md flex flex-col items-center justify-start gap-1"
                        >
                          <span className="text-sm font-medium">{format(dayDate, "d")}</span>
                          {displayDots.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                              {displayDots.map((event, idx) => (
                                <div
                                  key={event.id || idx}
                                  className={cn("w-2 h-2 rounded-full", getEventDotColor(event.type))}
                                />
                              ))}
                              {hasMore && <span className="text-[8px] text-muted-foreground">+</span>}
                            </div>
                          )}
                        </button>
                      );
                    }

                    // Desktop: tekstbasert visning
                    const displayEvents = dayEvents.slice(0, 2);
                    const remainingCount = dayEvents.length - 2;

                    return (
                      <button
                        {...props}
                        onClick={() => handleDateClick(dayDate)}
                        className={cn(
                          "h-full w-full p-2 font-normal hover:bg-accent/30 hover:text-accent-foreground rounded-md",
                          "flex flex-col items-start justify-start gap-1 text-left"
                        )}
                      >
                        <span className="text-sm font-medium mb-1">{format(dayDate, "d")}</span>
                        {displayEvents.map((event, idx) => (
                          <div
                            key={event.id || idx}
                            className={cn(
                              "text-xs truncate w-full px-1.5 py-1 rounded text-foreground cursor-pointer transition-colors font-medium border",
                              getEventBackgroundColor(event.type)
                            )}
                            title={event.title}
                          >
                            {event.title}
                          </div>
                        ))}
                        {remainingCount > 0 && (
                          <span className="text-[10px] text-muted-foreground px-1">+{remainingCount} mer</span>
                        )}
                      </button>
                    );
                  },
                }}
              />

              {/* Fargelegende */}
              <div className="mt-6 pt-4 border-t border-border">
                <p className="text-sm font-medium text-muted-foreground mb-3">Fargekode:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0" />
                    <span className="text-xs sm:text-sm">Oppdrag</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm">Hendelse</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-400 flex-shrink-0" />
                    <span className="text-xs sm:text-sm">Dokument</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm">Vedlikehold</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm">Nyhet</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-400 flex-shrink-0" />
                    <span className="text-xs sm:text-sm">Annet</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* Event Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {selectedDate && format(selectedDate, "dd. MMMM yyyy", { locale: nb })}
            </DialogTitle>
          </DialogHeader>

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
                          {event.type}
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
                              Marker som utført
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
                Ingen hendelser denne dagen
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reusable Dialogs */}
      <AddMissionDialog
        open={addMissionDialogOpen}
        onOpenChange={setAddMissionDialogOpen}
        onMissionAdded={() => {
          toast.success("Oppdrag opprettet!");
          fetchCustomEvents();
        }}
      />

      <AddIncidentDialog
        open={addIncidentDialogOpen}
        onOpenChange={setAddIncidentDialogOpen}
        defaultDate={selectedDate || undefined}
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
          toast.success("Dokument oppdatert!");
          setDocumentDetailDialogOpen(false);
          setSelectedDocument(null);
          fetchCustomEvents();
        }}
        onDeleteSuccess={() => {
          toast.success("Dokument slettet!");
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

      {/* Calendar Export Dialog */}
      <CalendarExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />
    </div>
  );
}
