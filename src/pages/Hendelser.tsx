import { useState, useEffect } from "react";
import droneBackground from "@/assets/drone-background.png";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AddIncidentDialog } from "@/components/dashboard/AddIncidentDialog";
import { IncidentDetailDialog } from "@/components/dashboard/IncidentDetailDialog";
import { GlassCard } from "@/components/GlassCard";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
type Incident = {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  hendelsestidspunkt: string;
  alvorlighetsgrad: string;
  status: string;
  kategori: string | null;
  lokasjon: string | null;
  rapportert_av: string | null;
  opprettet_dato: string | null;
  oppdatert_dato: string | null;
  user_id: string | null;
  mission_id: string | null;
  oppfolgingsansvarlig_id: string | null;
  company_id: string;
};
const statusOptions = ["Alle", "Åpen", "Under behandling", "Ferdigbehandlet", "Lukket"];
const severityColors: Record<string, string> = {
  Kritisk: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-100 dark:border-red-700",
  Høy: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-900/30 dark:text-orange-100 dark:border-orange-700",
  Middels: "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-100 dark:border-yellow-700",
  Lav: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/30 dark:text-blue-100 dark:border-blue-700"
};
const statusColors: Record<string, string> = {
  Åpen: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-100 dark:border-red-700",
  "Under behandling": "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-100 dark:border-yellow-700",
  Ferdigbehandlet: "bg-green-100 text-green-900 border-green-300 dark:bg-green-900/30 dark:text-green-100 dark:border-green-700",
  Lukket: "bg-gray-100 text-gray-900 border-gray-300 dark:bg-gray-700/30 dark:text-gray-100 dark:border-gray-600"
};
const Hendelser = () => {
  const navigate = useNavigate();
  const {
    user,
    loading: authLoading,
    companyId
  } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [filteredIncidents, setFilteredIncidents] = useState<Incident[]>([]);
  const [oppfolgingsansvarlige, setOppfolgingsansvarlige] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("Alle");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth", {
        replace: true
      });
    }
  }, [user, authLoading, navigate]);
  useEffect(() => {
    fetchIncidents();
    const channel = supabase.channel('incidents_changes').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'incidents'
    }, () => {
      fetchIncidents();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);
  useEffect(() => {
    filterIncidents();
  }, [incidents, searchQuery, selectedStatus]);
  const fetchIncidents = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('incidents').select('*').order('opprettet_dato', {
        ascending: false
      });
      if (error) throw error;
      setIncidents(data || []);

      // Hent oppfølgingsansvarlige for hendelser som har det
      const incidentsWithResponsible = (data || []).filter(inc => inc.oppfolgingsansvarlig_id);
      if (incidentsWithResponsible.length > 0) {
        const userIds = [...new Set(incidentsWithResponsible.map(inc => inc.oppfolgingsansvarlig_id))];
        const {
          data: profiles
        } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        if (profiles) {
          const responsibleMap: Record<string, string> = {};
          profiles.forEach(profile => {
            responsibleMap[profile.id] = profile.full_name || 'Ukjent bruker';
          });
          setOppfolgingsansvarlige(responsibleMap);
        }
      }
    } catch (error) {
      console.error('Error fetching incidents:', error);
    } finally {
      setLoading(false);
    }
  };
  const filterIncidents = () => {
    let filtered = [...incidents];

    // Filter by status
    if (selectedStatus !== "Alle") {
      filtered = filtered.filter(incident => incident.status === selectedStatus);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(incident => incident.tittel.toLowerCase().includes(query) || incident.beskrivelse?.toLowerCase().includes(query) || incident.kategori?.toLowerCase().includes(query) || incident.rapportert_av?.toLowerCase().includes(query) || incident.lokasjon?.toLowerCase().includes(query));
    }
    setFilteredIncidents(filtered);
  };
  const handleIncidentClick = (incident: Incident) => {
    setSelectedIncident(incident);
    setDetailDialogOpen(true);
  };
  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>;
  }
  return <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div className="fixed inset-0 z-0" style={{
      backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
      backgroundSize: "cover",
      backgroundPosition: "center center",
      backgroundRepeat: "no-repeat"
    }} />

      {/* Content */}
      <div className="relative z-10 w-full">
        <Header />
        
        <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-secondary-foreground">Hendelser</h1>
          
        </div>

        <GlassCard className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Søk i hendelser..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            
            <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Legg til hendelse
            </Button>
          </div>

          <div className="flex gap-2 mt-4 flex-wrap">
            {statusOptions.map(status => <Button key={status} variant={selectedStatus === status ? "default" : "outline"} size="sm" onClick={() => setSelectedStatus(status)}>
                {status}
              </Button>)}
          </div>
        </GlassCard>

        {loading ? <GlassCard>
            <p className="text-center text-muted-foreground py-8">Laster hendelser...</p>
          </GlassCard> : filteredIncidents.length === 0 ? <GlassCard>
            <p className="text-center text-muted-foreground py-8">
              {searchQuery || selectedStatus !== "Alle" ? "Ingen hendelser funnet med valgte filtre" : "Ingen hendelser rapportert ennå"}
            </p>
          </GlassCard> : <div className="grid gap-4">
            {filteredIncidents.map(incident => <GlassCard key={incident.id}>
                <div className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleIncidentClick(incident)}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{incident.tittel}</h3>
                        <Badge className={statusColors[incident.status] || ""}>
                          {incident.status}
                        </Badge>
                        <Badge className={severityColors[incident.alvorlighetsgrad] || ""}>
                          {incident.alvorlighetsgrad}
                        </Badge>
                        {incident.kategori && <Badge variant="outline">{incident.kategori}</Badge>}
                      </div>
                      
                      {incident.beskrivelse && <p className="text-sm text-foreground opacity-90 line-clamp-2 mb-2">
                          {incident.beskrivelse}
                        </p>}
                      
                      <div className="flex gap-4 text-xs text-foreground opacity-80 flex-wrap">
                        {incident.lokasjon && <span>📍 {incident.lokasjon}</span>}
                        <span>
                          📅 {format(new Date(incident.hendelsestidspunkt), "d. MMM yyyy HH:mm", {
                        locale: nb
                      })}
                        </span>
                        {incident.rapportert_av && <span>👤 {incident.rapportert_av}</span>}
                        {incident.oppfolgingsansvarlig_id && oppfolgingsansvarlige[incident.oppfolgingsansvarlig_id] && <span>🔔 Ansvarlig: {oppfolgingsansvarlige[incident.oppfolgingsansvarlig_id]}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>)}
          </div>}
        </main>
      </div>

      <AddIncidentDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />

      <IncidentDetailDialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen} incident={selectedIncident} />
    </div>;
};
export default Hendelser;