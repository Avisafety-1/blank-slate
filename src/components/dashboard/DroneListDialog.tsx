import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useState, useEffect } from "react";
import { DroneDetailDialog } from "@/components/resources/DroneDetailDialog";
import { useTerminology } from "@/hooks/useTerminology";
import { Status } from "@/types";

interface DroneListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drones: any[];
  onDronesUpdated?: () => void;
}

export const DroneListDialog = ({ open, onOpenChange, drones, onDronesUpdated }: DroneListDialogProps) => {
  const [selectedDrone, setSelectedDrone] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const terminology = useTerminology();

  const handleDroneClick = (drone: any) => {
    setSelectedDrone(drone);
    setDetailDialogOpen(true);
  };

  const handleDroneUpdated = () => {
    if (onDronesUpdated) {
      onDronesUpdated();
    }
  };

  // Sync selectedDrone when drones prop changes
  useEffect(() => {
    if (selectedDrone && drones.length > 0) {
      const updated = drones.find(d => d.id === selectedDrone.id);
      if (updated) {
        setSelectedDrone(updated);
      }
    }
  }, [drones]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{terminology.vehicles} ({drones.length})</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {drones.map((drone) => (
            <div 
              key={drone.id} 
              onClick={() => handleDroneClick(drone)}
              className="border border-border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{drone.modell}</h3>
                  <p className="text-sm text-muted-foreground">SN: {drone.serienummer}</p>
                </div>
                <StatusBadge status={drone.status as Status} />
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Flyvetimer</p>
                  <p className="font-medium">{drone.flyvetimer}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Tilgjengelig</p>
                  <p className="font-medium">{drone.tilgjengelig ? "Ja" : "Nei"}</p>
                </div>
                {drone.neste_inspeksjon && (
                  <div>
                    <p className="text-muted-foreground text-xs">Neste insp.</p>
                    <p className="font-medium">
                      {format(new Date(drone.neste_inspeksjon), "dd.MM.yy", { locale: nb })}
                    </p>
                  </div>
                )}
                {drone.sist_inspeksjon && (
                  <div>
                    <p className="text-muted-foreground text-xs">Sist insp.</p>
                    <p className="font-medium">
                      {format(new Date(drone.sist_inspeksjon), "dd.MM.yy", { locale: nb })}
                    </p>
                  </div>
                )}
              </div>
              
              {drone.merknader && (
                <div className="text-sm pt-2 border-t border-border">
                  <span className="text-muted-foreground">Merknader:</span>
                  <p className="mt-1">{drone.merknader}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>

      {selectedDrone && (
        <DroneDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          drone={selectedDrone}
          onDroneUpdated={handleDroneUpdated}
        />
      )}
    </Dialog>
  );
};