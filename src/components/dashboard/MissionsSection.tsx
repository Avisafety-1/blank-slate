import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Plus, FileText } from "lucide-react";
import { format } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { useState, useEffect } from "react";
import { MissionDetailDialog } from "./MissionDetailDialog";
import { AddMissionDialog } from "./AddMissionDialog";
import { SoraAnalysisDialog } from "./SoraAnalysisDialog";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";

type Mission = any;
type MissionSora = any;

const statusColors: Record<string, string> = {
  Planlagt: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  Pågående: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  Fullført: "bg-gray-500/20 text-gray-700 dark:text-gray-300",
};

const riskColors: Record<string, string> = {
  Lav: "bg-status-green/20 text-green-700 dark:text-green-300",
  Middels: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  Høy: "bg-status-red/20 text-red-700 dark:text-red-300",
};

export const MissionsSection = () => {
  const { t, i18n } = useTranslation();
  const { companyId } = useAuth();
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [soraDialogOpen, setSoraDialogOpen] = useState(false);
  const [selectedSoraMissionId, setSelectedSoraMissionId] = useState<string | undefined>(undefined);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionSoras, setMissionSoras] = useState<Record<string, MissionSora>>({});
  const [missionDocumentCounts, setMissionDocumentCounts] = useState<Record<string, number>>({});

  const dateLocale = i18n.language?.startsWith('en') ? enUS : nb;

  useEffect(() => {
    // Auto-complete old missions on load
    supabase.functions.invoke('auto-complete-missions').catch(console.error);
    
    fetchMissions();

    const channel = supabase
      .channel('missions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'missions',
        },
        () => {
          fetchMissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const fetchMissions = async () => {
    // Calculate date 1 day ago
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const { data, error } = await (supabase as any)
      .from("missions")
      .select("*")
      .neq("status", "Fullført")
      .neq("status", "Avlyst")
      .gte("tidspunkt", oneDayAgo.toISOString())
      .order("tidspunkt", { ascending: true });

    if (error) {
      console.error("Error fetching missions:", error);
    } else {
      setMissions(data || []);
      if (data && data.length > 0) {
        const missionIds = data.map((m: any) => m.id);
        fetchMissionSoras(missionIds);
        fetchMissionDocumentCounts(missionIds);
      }
    }
  };

  const fetchMissionDocumentCounts = async (missionIds: string[]) => {
    const { data, error } = await supabase
      .from("mission_documents")
      .select("mission_id")
      .in("mission_id", missionIds);

    if (error) {
      console.error("Error fetching mission documents:", error);
    } else if (data) {
      const counts: Record<string, number> = {};
      data.forEach((doc: any) => {
        counts[doc.mission_id] = (counts[doc.mission_id] || 0) + 1;
      });
      setMissionDocumentCounts(counts);
    }
  };

  const fetchMissionSoras = async (missionIds: string[]) => {
    const { data, error } = await supabase
      .from("mission_sora")
      .select("*")
      .in("mission_id", missionIds);

    if (error) {
      console.error("Error fetching mission SORAs:", error);
    } else if (data) {
      const soraMap: Record<string, MissionSora> = {};
      data.forEach((sora: any) => {
        soraMap[sora.mission_id] = sora;
      });
      setMissionSoras(soraMap);
    }
  };

  const handleMissionClick = (mission: Mission) => {
    setSelectedMission(mission);
    setDialogOpen(true);
  };

  const handleSoraClick = (missionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSoraMissionId(missionId);
    setSoraDialogOpen(true);
  };

  const handleNewSora = () => {
    setSelectedSoraMissionId(undefined);
    setSoraDialogOpen(true);
  };

  const handleSoraSaved = () => {
    fetchMissions();
  };

  const getSoraBadgeColor = (status: string) => {
    switch (status) {
      case "Ferdig":
        return "bg-status-green/20 text-green-700 dark:text-green-300";
      case "Under arbeid":
        return "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300";
      case "Revidert":
        return "bg-blue-500/20 text-blue-700 dark:text-blue-300";
      case "Ikke startet":
      default:
        return "bg-gray-500/20 text-gray-700 dark:text-gray-300";
    }
  };

  return (
    <>
      <GlassCard className="h-[400px] flex flex-col overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 sm:mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold truncate">{t('dashboard.missions.title')}</h2>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={handleNewSora} title={t('dashboard.missions.newSoraAnalysis')}>
              <FileText className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5 sm:space-y-2 flex-1 overflow-y-auto">
          {missions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t('dashboard.missions.noMissions')}</p>
          ) : (
            missions.map((mission) => (
              <div
                key={mission.id}
                onClick={() => handleMissionClick(mission)}
                className="p-2 sm:p-3 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-1 sm:mb-1.5">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-xs sm:text-sm truncate">{mission.tittel}</h3>
                  </div>
                  <div className="flex flex-wrap gap-1 sm:gap-2 items-center flex-shrink-0">
                    <Badge className={`${statusColors[mission.status] || ""} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap`}>
                      {mission.status}
                    </Badge>
                    <Badge 
                      onClick={(e) => handleSoraClick(mission.id, e)}
                      className={`${getSoraBadgeColor(missionSoras[mission.id]?.sora_status || "Ikke startet")} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap cursor-pointer hover:opacity-80`}
                    >
                      {missionSoras[mission.id]?.sora_status 
                        ? t('dashboard.missions.soraStatus', { status: missionSoras[mission.id].sora_status })
                        : t('dashboard.missions.soraNoStatus')}
                    </Badge>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-1.5">
                  <MapPin className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="truncate">{mission.lokasjon}</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
                  <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">
                    {format(new Date(mission.tidspunkt), "dd. MMM HH:mm", { locale: dateLocale })}
                  </Badge>
                  <Badge className={`${riskColors[mission.risk_nivå] || ""} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5`}>
                    {mission.risk_nivå}
                  </Badge>
                  {missionDocumentCounts[mission.id] > 0 && (
                    <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5">
                      <FileText className="w-3 h-3 mr-1" />
                      {missionDocumentCounts[mission.id]}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
    </GlassCard>
    
      <MissionDetailDialog 
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mission={selectedMission}
        onMissionUpdated={fetchMissions}
      />
      
      <AddMissionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onMissionAdded={fetchMissions}
      />
      
      <SoraAnalysisDialog
        open={soraDialogOpen}
        onOpenChange={setSoraDialogOpen}
        missionId={selectedSoraMissionId}
        onSaved={handleSoraSaved}
      />
    </>
  );
};
