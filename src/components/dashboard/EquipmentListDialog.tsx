import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useState } from "react";
import { EquipmentDetailDialog } from "@/components/resources/EquipmentDetailDialog";
import { calculateMaintenanceStatus } from "@/lib/maintenanceStatus";
import { Status } from "@/types";

interface EquipmentListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: any[];
  onEquipmentUpdated?: () => void;
}

export const EquipmentListDialog = ({ open, onOpenChange, equipment, onEquipmentUpdated }: EquipmentListDialogProps) => {
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const handleEquipmentClick = (item: any) => {
    setSelectedEquipment(item);
    setDetailDialogOpen(true);
  };

  const handleEquipmentUpdated = () => {
    if (onEquipmentUpdated) {
      onEquipmentUpdated();
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Utstyr ({equipment.length})</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {equipment.map((item) => (
            <div 
              key={item.id} 
              onClick={() => handleEquipmentClick(item)}
              className="border border-border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{item.navn}</h3>
                  <p className="text-sm text-muted-foreground">{item.type}</p>
                </div>
                <StatusBadge status={calculateMaintenanceStatus(item.neste_vedlikehold) as Status} />
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Serienummer:</span>
                  <span className="ml-2 font-medium">{item.serienummer}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tilgjengelig:</span>
                  <span className="ml-2 font-medium">{item.tilgjengelig ? "Ja" : "Nei"}</span>
                </div>
                {item.neste_vedlikehold && (
                  <div>
                    <span className="text-muted-foreground">Neste vedlikehold:</span>
                    <span className="ml-2 font-medium">
                      {format(new Date(item.neste_vedlikehold), "dd.MM.yyyy", { locale: nb })}
                    </span>
                  </div>
                )}
                {item.sist_vedlikeholdt && (
                  <div>
                    <span className="text-muted-foreground">Sist vedlikeholdt:</span>
                    <span className="ml-2 font-medium">
                      {format(new Date(item.sist_vedlikeholdt), "dd.MM.yyyy", { locale: nb })}
                    </span>
                  </div>
                )}
              </div>
              
              {item.merknader && (
                <div className="text-sm pt-2 border-t border-border">
                  <span className="text-muted-foreground">Merknader:</span>
                  <p className="mt-1">{item.merknader}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>

      {selectedEquipment && (
        <EquipmentDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          equipment={selectedEquipment}
          onEquipmentUpdated={handleEquipmentUpdated}
        />
      )}
    </Dialog>
  );
};