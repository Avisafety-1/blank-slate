import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Plus, FileText, Brain } from "lucide-react";
import { format } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { useState, useEffect } from "react";
import { MissionDetailDialog } from "./MissionDetailDialog";
import { AddMissionDialog } from "./AddMissionDialog";
import { SoraAnalysisDialog } from "./SoraAnalysisDialog";
import { RiskAssessmentDialog } from "./RiskAssessmentDialog";
import { RiskAssessmentTypeDialog } from "./RiskAssessmentTypeDialog";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { getCachedData, setCachedData } from "@/lib/offlineCache";
import { useDashboardRealtimeContext } from "@/contexts/DashboardRealtimeContext";
import { MissionStatusDropdown } from "./MissionStatusDropdown";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Mission = any;
type MissionSora = any;
type MissionAIRisk = { overall_score: number; recommendation: string };

const statusColors: Record<string, string> = {
  Planlagt: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  Pågående: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300",
  Fullført: "bg-gray-500/20 text-gray-700 dark:text-gray-300",
};


export const MissionsSection = () => {
  const { t, i18n } = useTranslation();
  const { companyId } = useAuth();
  const { registerMain } = useDashboardRealtimeContext();
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [soraDialogOpen, setSoraDialogOpen] = useState(false);
  const [selectedSoraMissionId, setSelectedSoraMissionId] = useState<string | undefined>(undefined);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionSoras, setMissionSoras] = useState<Record<string, MissionSora>>({});
  const [missionDocumentCounts, setMissionDocumentCounts] = useState<Record<string, number>>({});
  const [missionAIRisks, setMissionAIRisks] = useState<Record<string, MissionAIRisk>>({});
  
  // New states for risk assessment type dialog
  const [riskTypeDialogOpen, setRiskTypeDialogOpen] = useState(false);
  const [aiRiskDialogOpen, setAIRiskDialogOpen] = useState(false);
  const [selectedAIRiskMission, setSelectedAIRiskMission] = useState<Mission | null>(null);
  const [approvalConfirmMissionId, setApprovalConfirmMissionId] = useState<string | null>(null);

  const dateLocale = i18n.language?.startsWith('en') ? enUS : nb;

  useEffect(() => {
    // Auto-complete old missions on load (skip if offline)
    if (navigator.onLine) {
      supabase.functions.invoke('auto-complete-missions').catch(console.error);
    }
    
    fetchMissions();
  }, [companyId]);

  // Real-time via shared dashboard channel
  useEffect(() => {
    const unregister = registerMain('missions', () => {
      if (!navigator.onLine) return;
      fetchMissions();
    });
    return unregister;
  }, [registerMain]);

  const fetchMissions = async () => {
    // 1. Load cache first
    if (companyId) {
      const cached = getCachedData<any[]>(`offline_dashboard_missions_${companyId}`);
      if (cached) setMissions(cached);
    }

    // 2. Skip network if offline
    if (!navigator.onLine) return;

    // 3. Fetch fresh data
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    try {
      const { data, error } = await (supabase as any)
        .from("missions")
        .select("*")
        .neq("status", "Fullført")
        .neq("status", "Avlyst")
        .gte("tidspunkt", oneDayAgo.toISOString())
        .order("tidspunkt", { ascending: true });

      if (error) throw error;

      setMissions(data || []);
      if (companyId) setCachedData(`offline_dashboard_missions_${companyId}`, data || []);
      if (data && data.length > 0) {
        const missionIds = data.map((m: any) => m.id);
        fetchMissionSoras(missionIds);
        fetchMissionDocumentCounts(missionIds);
        fetchMissionAIRisks(missionIds);
      }
    } catch (error) {
      console.error("Error fetching missions:", error);
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

  const fetchMissionAIRisks = async (missionIds: string[]) => {
    const { data, error } = await supabase
      .from("mission_risk_assessments")
      .select("mission_id, overall_score, recommendation")
      .in("mission_id", missionIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching mission AI risks:", error);
    } else if (data) {
      // Get the latest assessment for each mission
      const riskMap: Record<string, MissionAIRisk> = {};
      data.forEach((risk: any) => {
        if (!riskMap[risk.mission_id]) {
          riskMap[risk.mission_id] = {
            overall_score: risk.overall_score,
            recommendation: risk.recommendation,
          };
        }
      });
      setMissionAIRisks(riskMap);
    }
  };

  const handleMissionClick = (mission: Mission) => {
    // Include AI risk data in the mission object
    const missionWithRisk = {
      ...mission,
      aiRisk: missionAIRisks[mission.id] || null
    };
    setSelectedMission(missionWithRisk);
    setDialogOpen(true);
  };

  const handleSoraClick = (missionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSoraMissionId(missionId);
    setSoraDialogOpen(true);
  };

  const handleNewRiskAssessment = () => {
    setRiskTypeDialogOpen(true);
  };

  const handleSelectAI = () => {
    setAIRiskDialogOpen(true);
  };

  const handleSelectSORA = () => {
    setSelectedSoraMissionId(undefined);
    setSoraDialogOpen(true);
  };

  const handleRiskAssessmentSaved = () => {
    fetchMissions();
  };

  const handleSoraSaved = () => {
    fetchMissions();
  };

  const getAIRiskBadgeColor = (recommendation: string) => {
    switch (recommendation) {
      case "go":
        return "bg-status-green/20 text-green-700 dark:text-green-300";
      case "caution":
        return "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300";
      case "no-go":
        return "bg-status-red/20 text-red-700 dark:text-red-300";
      default:
        return "bg-gray-500/20 text-gray-700 dark:text-gray-300";
    }
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
            <Button size="sm" variant="outline" onClick={handleNewRiskAssessment} title={t('dashboard.missions.newRiskAssessment', 'Ny risikovurdering')}>
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
                <div className="mb-1 sm:mb-1.5">
                  <h3 className="font-semibold text-xs sm:text-sm truncate mb-1">{mission.tittel}</h3>
                  <div className="flex flex-wrap gap-1 items-center">
                    <MissionStatusDropdown
                      missionId={mission.id}
                      currentStatus={mission.status}
                      onStatusChanged={fetchMissions}
                      statusColors={statusColors}
                      className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap"
                    />
                    {(() => {
                      const approvalStatus = mission.approval_status || 'not_approved';
                      const approvalLabel = approvalStatus === 'approved' ? 'Godkjent' : approvalStatus === 'pending_approval' ? 'Venter' : 'Ikke godkjent';
                      const approvalColor = approvalStatus === 'approved' 
                        ? 'bg-status-green/20 text-green-700 dark:text-green-300' 
                        : approvalStatus === 'pending_approval' 
                          ? 'bg-status-yellow/20 text-yellow-700 dark:text-yellow-300' 
                          : 'bg-status-red/20 text-red-700 dark:text-red-300';
                      const isClickable = approvalStatus === 'not_approved' || !mission.approval_status;
                      return (
                        <Badge 
                          className={`${approvalColor} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                          onClick={isClickable ? (e: React.MouseEvent) => {
                            e.stopPropagation();
                            setApprovalConfirmMissionId(mission.id);
                          } : undefined}
                        >
                          {approvalLabel}
                        </Badge>
                      );
                    })()}
                    <Badge 
                      onClick={(e) => handleSoraClick(mission.id, e)}
                      className={`${getSoraBadgeColor(missionSoras[mission.id]?.sora_status || "Ikke startet")} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap cursor-pointer hover:opacity-80`}
                    >
                      {missionSoras[mission.id]?.sora_status 
                        ? t('dashboard.missions.soraStatus', { status: missionSoras[mission.id].sora_status })
                        : t('dashboard.missions.soraNoStatus')}
                    </Badge>
                    {missionAIRisks[mission.id] && (
                      <Badge 
                        className={`${getAIRiskBadgeColor(missionAIRisks[mission.id].recommendation)} text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAIRiskMission(mission);
                          setAIRiskDialogOpen(true);
                        }}
                      >
                        <Brain className="w-3 h-3 mr-1" />
                        {missionAIRisks[mission.id].overall_score.toFixed(1)}
                      </Badge>
                    )}
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
      
      <RiskAssessmentTypeDialog
        open={riskTypeDialogOpen}
        onOpenChange={setRiskTypeDialogOpen}
        onSelectAI={handleSelectAI}
        onSelectSORA={handleSelectSORA}
      />
      
      <RiskAssessmentDialog
        open={aiRiskDialogOpen}
        onOpenChange={(open) => {
          setAIRiskDialogOpen(open);
          if (!open) {
            setSelectedAIRiskMission(null);
            handleRiskAssessmentSaved();
          }
        }}
        mission={selectedAIRiskMission}
        initialTab="history"
      />

      <AlertDialog open={!!approvalConfirmMissionId} onOpenChange={(open) => !open && setApprovalConfirmMissionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send til godkjenning?</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil sende dette oppdraget til godkjenning?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!approvalConfirmMissionId) return;
              const missionToApprove = missions.find((m: any) => m.id === approvalConfirmMissionId);
              await supabase
                .from('missions')
                .update({ approval_status: 'pending_approval' })
                .eq('id', approvalConfirmMissionId);
              setApprovalConfirmMissionId(null);
              fetchMissions();
              // Send email notification to approvers
              if (missionToApprove && companyId) {
                try {
                  await supabase.functions.invoke('send-notification-email', {
                    body: {
                      type: 'notify_mission_approval',
                      companyId,
                      mission: {
                        tittel: missionToApprove.tittel,
                        lokasjon: missionToApprove.lokasjon,
                        tidspunkt: missionToApprove.tidspunkt,
                        beskrivelse: missionToApprove.beskrivelse || '',
                      }
                    }
                  });
                } catch (emailError) {
                  console.error('Error sending approval notification:', emailError);
                }
              }
            }}>
              Send til godkjenning
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
