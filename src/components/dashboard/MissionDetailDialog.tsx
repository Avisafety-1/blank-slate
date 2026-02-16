import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { MapPin, Calendar, AlertTriangle, Pencil, ShieldCheck, Brain, Clock, CheckCircle2, Maximize2, Route } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AddMissionDialog } from "./AddMissionDialog";
import { AirspaceWarnings } from "./AirspaceWarnings";
import { MissionMapPreview } from "./MissionMapPreview";
import { ExpandedMapDialog } from "./ExpandedMapDialog";
import { DroneWeatherPanel } from "@/components/DroneWeatherPanel";
import { MissionResourceSections } from "./MissionResourceSections";
import { RiskAssessmentDialog } from "./RiskAssessmentDialog";
import { RiskAssessmentTypeDialog } from "./RiskAssessmentTypeDialog";
import { SoraAnalysisDialog } from "./SoraAnalysisDialog";
import { MissionStatusDropdown } from "./MissionStatusDropdown";

type Mission = any;

interface MissionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mission: Mission | null;
  onMissionUpdated?: () => void;
  onEditRoute?: (mission: any) => void;
}

const statusColors: Record<string, string> = {
  Planlagt: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  Pågående: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Fullført: "bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30",
};

const getAIRiskBadgeColor = (recommendation: string) => {
  switch (recommendation?.toLowerCase()) {
    case 'proceed':
      return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30';
    case 'proceed_with_caution':
      return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
    case 'not_recommended':
      return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30';
    default:
      return 'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30';
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

export const MissionDetailDialog = ({ open, onOpenChange, mission, onMissionUpdated, onEditRoute }: MissionDetailDialogProps) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [riskTypeDialogOpen, setRiskTypeDialogOpen] = useState(false);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskDialogShowHistory, setRiskDialogShowHistory] = useState(false);
  const [soraDialogOpen, setSoraDialogOpen] = useState(false);
  const [expandedMapOpen, setExpandedMapOpen] = useState(false);
  const [flightLogs, setFlightLogs] = useState<any[] | null>(null);
  const [liveMission, setLiveMission] = useState<any>(null);

  // Re-fetch mission data when dialog opens to get latest route etc.
  useEffect(() => {
    if (!open || !mission?.id) {
      setLiveMission(null);
      return;
    }
    const fetchLatest = async () => {
      const { data } = await supabase
        .from("missions")
        .select("*")
        .eq("id", mission.id)
        .single();
      if (data) setLiveMission(data);
    };
    fetchLatest();
  }, [open, mission?.id]);

  // Fetch flight logs when expanded map opens
  useEffect(() => {
    if (!expandedMapOpen || !mission?.id) return;
    if (mission.flightLogs) {
      setFlightLogs(mission.flightLogs);
      return;
    }
    const fetchLogs = async () => {
      const { data } = await supabase
        .from("flight_logs")
        .select("id, flight_date, flight_track, flight_duration_minutes")
        .eq("mission_id", mission.id)
        .not("flight_track", "is", null);
      setFlightLogs(data || []);
    };
    fetchLogs();
  }, [expandedMapOpen, mission?.id, mission?.flightLogs]);

  // Use live data merged with prop data (live takes priority for fields like route)
  const currentMission = liveMission ? { ...mission, ...liveMission } : mission;

  // Memoize flightTracks to prevent re-creating array references on every render,
  // which would cancel in-progress terrain elevation fetches in ExpandedMapDialog
  const memoizedFlightTracks = useMemo(() => {
    if (!flightLogs || flightLogs.length === 0) return null;
    const tracks = flightLogs
      .filter((log: any) => log.flight_track?.positions?.length > 0)
      .map((log: any) => ({
        positions: log.flight_track.positions,
        flightLogId: log.id,
        flightDate: log.flight_date,
      }));
    return tracks.length > 0 ? tracks : null;
  }, [flightLogs]);

  if (!mission) return null;

  const handleEditClick = () => {
    onOpenChange(false);
    setEditDialogOpen(true);
  };

  const handleMissionUpdated = () => {
    if (onMissionUpdated) {
      onMissionUpdated();
    }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="space-y-3">
            <div className="flex items-start justify-between gap-2 pr-8">
              <DialogTitle className="text-lg sm:text-xl">{currentMission.tittel}</DialogTitle>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {onEditRoute && (
                  <Button size="sm" variant="outline" onClick={() => onEditRoute(currentMission)}>
                    <Route className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Rediger rute</span>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleEditClick}>
                  <Pencil className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Rediger</span>
                </Button>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setRiskTypeDialogOpen(true)}
              className="w-full sm:w-auto"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Risikovurdering
            </Button>
          </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <MissionStatusDropdown
              missionId={currentMission.id}
              currentStatus={currentMission.status}
              onStatusChanged={() => {
                onMissionUpdated?.();
                // Re-fetch live mission
                supabase.from("missions").select("*").eq("id", currentMission.id).single().then(({ data }) => {
                  if (data) setLiveMission(data);
                });
              }}
              statusColors={statusColors}
              className="border"
            />
            {currentMission.approval_status === 'pending_approval' && (
              <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-900 dark:text-yellow-300 border-yellow-500/30">
                <Clock className="h-3 w-3 mr-1" />
                Venter godkjenning
              </Badge>
            )}
            {currentMission.approval_status === 'approved' && (
              <Badge variant="outline" className="text-xs bg-green-500/20 text-green-900 dark:text-green-300 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Godkjent
              </Badge>
            )}
            {currentMission.approval_status === 'not_approved' && (
              <Badge variant="outline" className="text-xs bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30">
                Ikke godkjent
              </Badge>
            )}
            {currentMission.aiRisk ? (
              <Badge 
                className={`${getAIRiskBadgeColor(currentMission.aiRisk.recommendation)} border cursor-pointer hover:opacity-80 transition-opacity`}
                onClick={() => {
                  setRiskDialogShowHistory(true);
                  setRiskDialogOpen(true);
                }}
              >
                <Brain className="w-3 h-3 mr-1" />
                AI: {getAIRiskLabel(currentMission.aiRisk.recommendation)} ({formatAIRiskScore(currentMission.aiRisk.overall_score)})
              </Badge>
            ) : (
              <Badge className="bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30 border">
                <Brain className="w-3 h-3 mr-1" />
                Risiko: Ikke vurdert
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Lokasjon</p>
                <p className="text-base">{currentMission.lokasjon}</p>
              </div>
            </div>

          {(() => {
              const routeCoords = (currentMission.route as any)?.coordinates;
              const effectiveLat = currentMission.latitude ?? routeCoords?.[0]?.lat;
              const effectiveLng = currentMission.longitude ?? routeCoords?.[0]?.lng;
              const isCompleted = currentMission.status === "Fullført";
              const hasWeatherSnapshot = currentMission.weather_data_snapshot;
              
              if (!effectiveLat || !effectiveLng) return null;
              
              return (
                <>
                  <AirspaceWarnings 
                    latitude={effectiveLat} 
                    longitude={effectiveLng}
                    routePoints={routeCoords}
                  />
                  <DroneWeatherPanel 
                    latitude={effectiveLat} 
                    longitude={effectiveLng}
                    savedWeatherData={isCompleted && hasWeatherSnapshot ? hasWeatherSnapshot : undefined}
                  />
                </>
              );
            })()}

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tidspunkt</p>
                <p className="text-base">
                  {format(new Date(currentMission.tidspunkt), "dd. MMMM yyyy, HH:mm", { locale: nb })}
                </p>
              </div>
          </div>
          </div>

          <MissionResourceSections mission={currentMission} open={open} />

          {currentMission.latitude && currentMission.longitude && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Kartvisning</p>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setExpandedMapOpen(true)}>
                  <Maximize2 className="w-3.5 h-3.5 mr-1" />
                  Utvid
                </Button>
              </div>
              <div 
                className="h-[200px] relative overflow-hidden rounded-lg cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                onClick={() => setExpandedMapOpen(true)}
              >
                <MissionMapPreview latitude={currentMission.latitude} longitude={currentMission.longitude} route={currentMission.route as any} />
              </div>
            </div>
          )}

          {currentMission.beskrivelse && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Beskrivelse</p>
              <p className="text-base leading-relaxed whitespace-pre-wrap">{currentMission.beskrivelse}</p>
            </div>
          )}

          {currentMission.merknader && (
            <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Merknader</p>
                  <p className="text-sm mt-1 text-amber-900 dark:text-amber-100">{currentMission.merknader}</p>
                </div>
              </div>
            </div>
          )}

          {/* Approver Comments */}
          {Array.isArray(currentMission.approver_comments) && currentMission.approver_comments.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Kommentarer fra godkjenner</p>
              <div className="space-y-2">
                {currentMission.approver_comments.map((c: any, i: number) => (
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
        </div>
      </DialogContent>
    </Dialog>

    <AddMissionDialog
      open={editDialogOpen}
      onOpenChange={setEditDialogOpen}
      onMissionAdded={handleMissionUpdated}
      mission={currentMission}
    />

    <RiskAssessmentTypeDialog
      open={riskTypeDialogOpen}
      onOpenChange={setRiskTypeDialogOpen}
      onSelectAI={() => {
        setRiskTypeDialogOpen(false);
        setRiskDialogOpen(true);
      }}
      onSelectSORA={() => {
        setRiskTypeDialogOpen(false);
        setSoraDialogOpen(true);
      }}
    />

    <RiskAssessmentDialog
      open={riskDialogOpen}
      onOpenChange={(open) => {
        setRiskDialogOpen(open);
        if (!open) setRiskDialogShowHistory(false);
      }}
      mission={currentMission}
      initialTab={riskDialogShowHistory ? 'history' : 'input'}
    />

    <SoraAnalysisDialog
      open={soraDialogOpen}
      onOpenChange={setSoraDialogOpen}
      missionId={currentMission.id}
    />

    {currentMission.latitude && currentMission.longitude && (
      <ExpandedMapDialog
        open={expandedMapOpen}
        onOpenChange={setExpandedMapOpen}
        latitude={currentMission.latitude}
        longitude={currentMission.longitude}
        route={currentMission.route as any}
        flightTracks={memoizedFlightTracks}
        missionTitle={currentMission.tittel}
        missionId={currentMission.id}
        onSoraUpdated={onMissionUpdated}
      />
    )}
    </>
  );
};