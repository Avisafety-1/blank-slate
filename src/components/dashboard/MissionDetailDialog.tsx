import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { MapPin, Calendar, AlertTriangle, Pencil } from "lucide-react";
import { useState } from "react";
import { AddMissionDialog } from "./AddMissionDialog";
import { AirspaceWarnings } from "./AirspaceWarnings";
import { MissionMapPreview } from "./MissionMapPreview";
import { DroneWeatherPanel } from "@/components/DroneWeatherPanel";

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

const riskColors: Record<string, string> = {
  Lav: "bg-status-green/20 text-green-700 dark:text-green-300 border-status-green/30",
  Middels: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Høy: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
};

export const MissionDetailDialog = ({ open, onOpenChange, mission, onMissionUpdated }: MissionDetailDialogProps) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);

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
          <DialogHeader>
            <div className="flex items-center justify-between gap-4 pr-8">
              <DialogTitle className="text-lg sm:text-xl">{mission.tittel}</DialogTitle>
              <Button size="sm" variant="outline" onClick={handleEditClick}>
                <Pencil className="w-4 h-4 mr-2" />
                Rediger
              </Button>
            </div>
          </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge className={`${statusColors[mission.status] || ""} border`}>
              {mission.status}
            </Badge>
            <Badge className={`${riskColors[mission.risk_nivå] || ""} border`}>
              Risiko: {mission.risk_nivå}
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Lokasjon</p>
                <p className="text-base">{mission.lokasjon}</p>
              </div>
            </div>

            {mission.latitude && mission.longitude && (
              <>
                <AirspaceWarnings 
                  latitude={mission.latitude} 
                  longitude={mission.longitude}
                  routePoints={(mission.route as any)?.coordinates}
                />
                <DroneWeatherPanel 
                  latitude={mission.latitude} 
                  longitude={mission.longitude} 
                />
              </>
            )}

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
    </>
  );
};