import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useState } from "react";
import { DroneDetailDialog } from "@/components/resources/DroneDetailDialog";
import { useTerminology } from "@/hooks/useTerminology";

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
              <div>
                <h3 className="font-semibold text-lg">{drone.modell}</h3>
                <p className="text-sm text-muted-foreground">SN: {drone.serienummer}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Flyvetimer:</span>
                  <span className="ml-2 font-medium">{drone.flyvetimer}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tilgjengelig:</span>
                  <span className="ml-2 font-medium">{drone.tilgjengelig ? "Ja" : "Nei"}</span>
                </div>
                {drone.neste_inspeksjon && (
                  <div>
                    <span className="text-muted-foreground">Neste inspeksjon:</span>
                    <span className="ml-2 font-medium">
                      {format(new Date(drone.neste_inspeksjon), "dd.MM.yyyy", { locale: nb })}
                    </span>
                  </div>
                )}
                {drone.sist_inspeksjon && (
                  <div>
                    <span className="text-muted-foreground">Sist inspeksjon:</span>
                    <span className="ml-2 font-medium">
                      {format(new Date(drone.sist_inspeksjon), "dd.MM.yyyy", { locale: nb })}
                    </span>
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