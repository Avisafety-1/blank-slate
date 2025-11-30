import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { AlertTriangle, Clock } from "lucide-react";

import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useState, useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { IncidentDetailDialog } from "./IncidentDetailDialog";
import { AddIncidentDialog } from "./AddIncidentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const severityColors = {
  Lav: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  Middels: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  Høy: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  Kritisk: "bg-status-red/20 text-red-700 dark:text-red-300",
};

const statusColors = {
  Ny: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  "Under utredning": "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  "Tiltak iverksatt": "bg-green-500/20 text-green-700 dark:text-green-300",
  Lukket: "bg-gray-500/20 text-gray-700 dark:text-gray-300",
  Åpen: "bg-status-red/20 text-red-700 dark:text-red-300",
  "Under behandling": "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  Ferdigbehandlet: "bg-green-500/20 text-green-700 dark:text-green-300",
  Pågår: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  Utført: "bg-status-green/20 text-green-700 dark:text-green-300",
  Forsinket: "bg-status-red/20 text-red-700 dark:text-red-300",
};

type Incident = Tables<"incidents">;

export const IncidentsSection = () => {
  const { companyId } = useAuth();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [myFollowUpIncidents, setMyFollowUpIncidents] = useState<Incident[]>([]);
  const [followUpLoading, setFollowUpLoading] = useState(true);

  // Fetch incidents from database
  useEffect(() => {
    fetchIncidents();
  }, [companyId]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('incidents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newIncident = payload.new as Incident;
            if (newIncident.status !== 'Ferdigbehandlet') {
              setIncidents((current) => [newIncident, ...current]);
            }
        } else if (payload.eventType === 'UPDATE') {
          const updatedIncident = payload.new as Incident;
          
          // Oppdater selectedIncident hvis det er samme hendelse
          setSelectedIncident((current) => {
            if (current?.id === updatedIncident.id) {
              return updatedIncident;
            }
            return current;
          });
          
          setIncidents((current) => {
            // Remove if now Ferdigbehandlet, otherwise update
            if (updatedIncident.status === 'Ferdigbehandlet') {
              return current.filter((incident) => incident.id !== updatedIncident.id);
            }
            return current.map((incident) =>
              incident.id === updatedIncident.id ? updatedIncident : incident
            );
          });
        } else if (payload.eventType === 'DELETE') {
            setIncidents((current) =>
              current.filter((incident) => incident.id !== (payload.old as Incident).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  // Fetch follow-up incidents for logged-in user
  useEffect(() => {
    const fetchMyFollowUps = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setMyFollowUpIncidents([]);
          setFollowUpLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('incidents')
          .select('*')
          .eq('oppfolgingsansvarlig_id', user.id)
          .order('hendelsestidspunkt', { ascending: false });

        if (error) throw error;

        setMyFollowUpIncidents(data || []);
      } catch (error: any) {
        console.error('Error fetching follow-up incidents:', error);
        toast.error('Kunne ikke laste oppfølgingshendelser');
      } finally {
        setFollowUpLoading(false);
      }
    };

    fetchMyFollowUps();

    // Realtime subscription for follow-up incidents
    const followUpChannel = supabase
      .channel('my-followup-incidents')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents'
        },
        async () => {
          fetchMyFollowUps();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(followUpChannel);
    };
  }, [companyId]);

  const fetchIncidents = async () => {
    try {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .neq('status', 'Ferdigbehandlet')
        .order('opprettet_dato', { ascending: false });

      if (error) throw error;

      setIncidents(data || []);
    } catch (error: any) {
      console.error('Error fetching incidents:', error);
      toast.error('Kunne ikke laste hendelser');
    } finally {
      setLoading(false);
    }
  };

  const handleIncidentClick = (incident: Incident) => {
    setSelectedIncident(incident);
    setDetailDialogOpen(true);
  };

  return (
    <>
      <GlassCard className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 sm:mb-3 gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive flex-shrink-0" />
          <h2 className="text-sm sm:text-base font-semibold truncate">Hendelser</h2>
        </div>
        <Button 
          size="sm" 
          variant="destructive" 
          className="gap-1 h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3 flex-shrink-0"
          onClick={() => setAddDialogOpen(true)}
        >
          <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
          <span>Rapporter hendelse</span>
        </Button>
      </div>

      <Tabs defaultValue="incidents" className="w-full flex-1 flex flex-col">
        <TabsList className="w-full h-8 sm:h-9">
          <TabsTrigger value="incidents" className="flex-1 text-xs sm:text-sm">
            Hendelser ({incidents.length})
          </TabsTrigger>
          <TabsTrigger value="followups" className="flex-1 text-xs sm:text-sm">
            Oppfølging ({myFollowUpIncidents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incidents" className="mt-2 sm:mt-3 flex-1">
          <div className="space-y-1.5 sm:space-y-2 overflow-y-auto h-[400px] pr-2 sm:pr-4">
            {loading ? (
              <div className="text-center py-4 text-xs sm:text-sm text-muted-foreground">
                Laster hendelser...
              </div>
            ) : incidents.length === 0 ? (
              <div className="text-center py-4 text-xs sm:text-sm text-muted-foreground">
                Ingen hendelser registrert
              </div>
            ) : (
              incidents.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => handleIncidentClick(incident)}
                  className="p-2 sm:p-3 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-xs sm:text-sm mb-1">{incident.tittel}</h3>
                      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
                        <Badge className={`${severityColors[incident.alvorlighetsgrad as keyof typeof severityColors] || 'bg-gray-500/20'} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5`}>
                          {incident.alvorlighetsgrad}
                        </Badge>
                        {incident.kategori && (
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">{incident.kategori}</Badge>
                        )}
                        <span className="text-muted-foreground">
                          {format(new Date(incident.hendelsestidspunkt), "dd. MMM", { locale: nb })}
                        </span>
                      </div>
                    </div>
                    <Badge className={`${statusColors[incident.status as keyof typeof statusColors] || 'bg-gray-500/20'} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap`}>{incident.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="followups" className="mt-2 sm:mt-3 flex-1">
          <div className="space-y-1.5 sm:space-y-2 overflow-y-auto h-[400px] pr-2 sm:pr-4">
            {followUpLoading ? (
              <div className="text-center py-4 text-xs sm:text-sm text-muted-foreground">
                Laster oppfølginger...
              </div>
            ) : myFollowUpIncidents.length === 0 ? (
              <div className="text-center py-4 text-xs sm:text-sm text-muted-foreground">
                Du har ingen hendelser som oppfølgingsansvarlig
              </div>
            ) : (
              myFollowUpIncidents.map((incident) => (
                <div
                  key={incident.id}
                  onClick={() => handleIncidentClick(incident)}
                  className="p-2 sm:p-3 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-xs sm:text-sm mb-1">{incident.tittel}</h3>
                      {incident.beskrivelse && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1 mb-1 sm:mb-1.5">
                          {incident.beskrivelse}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
                        <Badge className={`${severityColors[incident.alvorlighetsgrad as keyof typeof severityColors] || 'bg-gray-500/20'} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5`}>
                          {incident.alvorlighetsgrad}
                        </Badge>
                        {incident.kategori && (
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">
                            {incident.kategori}
                          </Badge>
                        )}
                        <span className="text-muted-foreground">
                          {format(new Date(incident.hendelsestidspunkt), "dd. MMM", { locale: nb })}
                        </span>
                        {incident.lokasjon && (
                          <span className="text-muted-foreground truncate">• {incident.lokasjon}</span>
                        )}
                      </div>
                    </div>
                    <Badge className={`${statusColors[incident.status as keyof typeof statusColors] || 'bg-gray-500/20'} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap`}>
                      {incident.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AddIncidentDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />
      
      <IncidentDetailDialog 
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        incident={selectedIncident}
      />
    </GlassCard>
    </>
  );
};
