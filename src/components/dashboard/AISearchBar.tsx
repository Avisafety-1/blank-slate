import { useState, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MissionDetailDialog } from "./MissionDetailDialog";
import { IncidentDetailDialog } from "./IncidentDetailDialog";
import { DocumentDetailDialog } from "./DocumentDetailDialog";
import { EquipmentDetailDialog } from "@/components/resources/EquipmentDetailDialog";
import { DroneDetailDialog } from "@/components/resources/DroneDetailDialog";
import { SoraAnalysisDialog } from "./SoraAnalysisDialog";
import { NewsDetailDialog } from "./NewsDetailDialog";
import { PersonCompetencyDialog } from "@/components/resources/PersonCompetencyDialog";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface SearchResults {
  summary: string;
  results: {
    missions: any[];
    incidents: any[];
    documents: any[];
    equipment: any[];
    drones: any[];
    competencies: any[];
    sora: any[];
    personnel: any[];
    customers: any[];
    news: any[];
    flightLogs: any[];
    calendarEvents: any[];
  };
}

export const AISearchBar = () => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const [selectedDrone, setSelectedDrone] = useState<any>(null);
  const [selectedSora, setSelectedSora] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<any>(null);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
    }
  }, [query]);

  const handleSearch = async () => {
    if (!query.trim() || !user) return;
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-search", {
        body: {
          query: query.trim(),
          userId: user.id,
        },
      });
      if (error) throw error;
      setResults(data);
    } catch (error: any) {
      console.error("Search error:", error);
      toast.error(t('dashboard.search.couldNotSearch'));
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getTotalResults = () => {
    if (!results) return 0;
    const r = results.results;
    return (
      r.missions.length +
      r.incidents.length +
      r.documents.length +
      r.equipment.length +
      r.drones.length +
      r.competencies.length +
      r.sora.length +
      r.personnel.length +
      r.customers.length +
      r.news.length +
      r.flightLogs.length +
      r.calendarEvents.length
    );
  };

  const handleMissionClick = async (missionId: string) => {
    const { data, error } = await supabase.from("missions").select("*").eq("id", missionId).single();
    if (error) {
      toast.error("Kunne ikke hente oppdragsdetaljer");
      return;
    }
    setSelectedMission(data);
  };

  const handleIncidentClick = async (incidentId: string) => {
    const { data, error } = await supabase.from("incidents").select("*").eq("id", incidentId).single();
    if (error) {
      toast.error("Kunne ikke hente hendelsesdetaljer");
      return;
    }
    setSelectedIncident(data);
  };

  const handleDocumentClick = async (documentId: string) => {
    const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).single();
    if (error) {
      toast.error("Kunne ikke hente dokumentdetaljer");
      return;
    }
    setSelectedDocument(data);
  };

  const handleEquipmentClick = async (equipmentId: string) => {
    const { data, error } = await supabase.from("equipment").select("*").eq("id", equipmentId).single();
    if (error) {
      toast.error("Kunne ikke hente utstyrsdetaljer");
      return;
    }
    setSelectedEquipment(data);
  };

  const handleDroneClick = async (droneId: string) => {
    const { data, error } = await supabase.from("drones").select("*").eq("id", droneId).single();
    if (error) {
      toast.error("Kunne ikke hente dronedetaljer");
      return;
    }
    setSelectedDrone(data);
  };

  const handleSoraClick = async (soraId: string) => {
    const { data, error } = await supabase.from("mission_sora").select("mission_id").eq("id", soraId).single();
    if (error) {
      toast.error("Kunne ikke hente SORA-detaljer");
      return;
    }
    setSelectedSora(data.mission_id);
  };

  const handleNewsClick = async (newsId: string) => {
    const { data, error } = await supabase.from("news").select("*").eq("id", newsId).single();
    if (error) {
      toast.error("Kunne ikke hente nyhetsdetaljer");
      return;
    }
    setSelectedNews(data);
  };

  const handlePersonClick = async (personId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, personnel_competencies(*)")
      .eq("id", personId)
      .single();
    if (error) {
      toast.error("Kunne ikke hente persondetaljer");
      return;
    }
    setSelectedPerson(data);
  };

  const getDocumentStatus = (doc: any): string => {
    if (!doc.gyldig_til) return "Grønn";
    const today = new Date();
    const expiryDate = new Date(doc.gyldig_til);
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) return "Rød";
    if (daysUntilExpiry <= (doc.varsel_dager_for_utløp || 30)) return "Gul";
    return "Grønn";
  };

  return (
    <div className="space-y-4 mb-6">
      <GlassCard className="p-4">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            placeholder={t('dashboard.search.placeholder')}
          />
          <Button onClick={handleSearch} disabled={isSearching || !query.trim()}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      </GlassCard>

      {results && (
        <GlassCard className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">{t('dashboard.search.results')} ({getTotalResults()})</h3>
            {results.summary && <p className="text-sm text-muted-foreground">{results.summary}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.results.missions.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Oppdrag ({results.results.missions.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.missions.map((m: any) => (
                    <li
                      key={m.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleMissionClick(m.id)}
                    >
                      • {m.tittel}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.incidents.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Hendelser ({results.results.incidents.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.incidents.map((i: any) => (
                    <li
                      key={i.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleIncidentClick(i.id)}
                    >
                      • {i.tittel}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.documents.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Dokumenter ({results.results.documents.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.documents.map((d: any) => (
                    <li
                      key={d.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleDocumentClick(d.id)}
                    >
                      • {d.tittel}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.equipment.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Utstyr ({results.results.equipment.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.equipment.map((e: any) => (
                    <li
                      key={e.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleEquipmentClick(e.id)}
                    >
                      • {e.navn}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.drones.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Droner ({results.results.drones.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.drones.map((d: any) => (
                    <li
                      key={d.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleDroneClick(d.id)}
                    >
                      • {d.modell}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.competencies.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Kompetanser ({results.results.competencies.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.competencies.map((c: any) => (
                    <li key={c.id} className="text-muted-foreground">
                      • {c.navn} ({c.type})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.sora.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">SORA-analyser ({results.results.sora.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.sora.map((s: any) => (
                    <li
                      key={s.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleSoraClick(s.id)}
                    >
                      • SORA analyse ({s.sora_status})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.personnel.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Personell ({results.results.personnel.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.personnel.map((p: any) => (
                    <li
                      key={p.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handlePersonClick(p.id)}
                    >
                      • {p.full_name} {p.tittel && <span className="text-xs">({p.tittel})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.customers.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Kunder ({results.results.customers.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.customers.map((c: any) => (
                    <li key={c.id} className="text-muted-foreground">
                      • {c.navn} {c.kontaktperson && <span className="text-xs">({c.kontaktperson})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.news.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Nyheter ({results.results.news.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.news.map((n: any) => (
                    <li
                      key={n.id}
                      className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      onClick={() => handleNewsClick(n.id)}
                    >
                      • {n.tittel}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.flightLogs.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Flylogger ({results.results.flightLogs.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.flightLogs.map((f: any) => (
                    <li key={f.id} className="text-muted-foreground">
                      • {format(new Date(f.flight_date), "dd.MM.yy", { locale: nb })}: {f.departure_location} → {f.landing_location}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.results.calendarEvents.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Kalender ({results.results.calendarEvents.length})</h4>
                <ul className="space-y-1 text-sm">
                  {results.results.calendarEvents.map((e: any) => (
                    <li key={e.id} className="text-muted-foreground">
                      • {format(new Date(e.event_date), "dd.MM.yy", { locale: nb })}: {e.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      <MissionDetailDialog
        open={!!selectedMission}
        onOpenChange={(open) => !open && setSelectedMission(null)}
        mission={selectedMission}
      />
      <IncidentDetailDialog
        open={!!selectedIncident}
        onOpenChange={(open) => !open && setSelectedIncident(null)}
        incident={selectedIncident}
      />
      <DocumentDetailDialog
        open={!!selectedDocument}
        onOpenChange={(open) => !open && setSelectedDocument(null)}
        document={selectedDocument}
        status={selectedDocument ? getDocumentStatus(selectedDocument) : "Grønn"}
      />
      <EquipmentDetailDialog
        open={!!selectedEquipment}
        onOpenChange={(open) => !open && setSelectedEquipment(null)}
        equipment={selectedEquipment}
        onEquipmentUpdated={() => {}}
      />
      <DroneDetailDialog
        open={!!selectedDrone}
        onOpenChange={(open) => !open && setSelectedDrone(null)}
        drone={selectedDrone}
        onDroneUpdated={() => {}}
      />
      <SoraAnalysisDialog
        open={!!selectedSora}
        onOpenChange={(open) => !open && setSelectedSora(null)}
        missionId={selectedSora || undefined}
      />
      <NewsDetailDialog
        open={!!selectedNews}
        onOpenChange={(open) => !open && setSelectedNews(null)}
        news={selectedNews}
      />
      <PersonCompetencyDialog
        open={!!selectedPerson}
        onOpenChange={(open) => !open && setSelectedPerson(null)}
        person={selectedPerson}
        onCompetencyUpdated={() => {}}
      />
    </div>
  );
};
