import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { MapPin, Calendar, AlertTriangle, Pencil, ShieldCheck, Brain } from "lucide-react";
import { useState } from "react";
import { AddMissionDialog } from "./AddMissionDialog";
import { AirspaceWarnings } from "./AirspaceWarnings";
import { MissionMapPreview } from "./MissionMapPreview";
import { DroneWeatherPanel } from "@/components/DroneWeatherPanel";
import { RiskAssessmentDialog } from "./RiskAssessmentDialog";
import { RiskAssessmentTypeDialog } from "./RiskAssessmentTypeDialog";
import { SoraAnalysisDialog } from "./SoraAnalysisDialog";

type Mission = any;

interface MissionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mission: Mission | null;
  onMissionUpdated?: () => void;
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

export const MissionDetailDialog = ({ open, onOpenChange, mission, onMissionUpdated }: MissionDetailDialogProps) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [riskTypeDialogOpen, setRiskTypeDialogOpen] = useState(false);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskDialogShowHistory, setRiskDialogShowHistory] = useState(false);
  const [soraDialogOpen, setSoraDialogOpen] = useState(false);
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
              <DialogTitle className="text-lg sm:text-xl">{mission.tittel}</DialogTitle>
              <Button size="sm" variant="outline" onClick={handleEditClick} className="flex-shrink-0">
                <Pencil className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Rediger</span>
              </Button>
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
            <Badge className={`${statusColors[mission.status] || ""} border`}>
              {mission.status}
            </Badge>
            {mission.aiRisk ? (
              <Badge 
                className={`${getAIRiskBadgeColor(mission.aiRisk.recommendation)} border cursor-pointer hover:opacity-80 transition-opacity`}
                onClick={() => {
                  setRiskDialogShowHistory(true);
                  setRiskDialogOpen(true);
                }}
              >
                <Brain className="w-3 h-3 mr-1" />
                AI: {getAIRiskLabel(mission.aiRisk.recommendation)} ({formatAIRiskScore(mission.aiRisk.overall_score)})
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
                <p className="text-base">{mission.lokasjon}</p>
              </div>
            </div>

          {(() => {
              const routeCoords = (mission.route as any)?.coordinates;
              const effectiveLat = mission.latitude ?? routeCoords?.[0]?.lat;
              const effectiveLng = mission.longitude ?? routeCoords?.[0]?.lng;
              const isCompleted = mission.status === "Fullført";
              const hasWeatherSnapshot = mission.weather_data_snapshot;
              
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
                  {format(new Date(mission.tidspunkt), "dd. MMMM yyyy, HH:mm", { locale: nb })}
                </p>
              </div>
            </div>
          </div>

          {mission.latitude && mission.longitude && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">Kartvisning</p>
              <div className="h-[200px] relative overflow-hidden rounded-lg">
                <MissionMapPreview latitude={mission.latitude} longitude={mission.longitude} route={mission.route as any} />
              </div>
            </div>
          )}

          {mission.beskrivelse && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Beskrivelse</p>
              <p className="text-base leading-relaxed whitespace-pre-wrap">{mission.beskrivelse}</p>
            </div>
          )}

          {mission.merknader && (
            <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Merknader</p>
                  <p className="text-sm mt-1 text-amber-900 dark:text-amber-100">{mission.merknader}</p>
                </div>
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
      mission={mission}
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
      mission={mission}
      initialTab={riskDialogShowHistory ? 'history' : 'input'}
    />

    <SoraAnalysisDialog
      open={soraDialogOpen}
      onOpenChange={setSoraDialogOpen}
      missionId={mission.id}
    />
    </>
  );
};