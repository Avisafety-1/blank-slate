import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { useState, useEffect, useMemo } from "react";
import { DroneDetailDialog } from "@/components/resources/DroneDetailDialog";
import { useTerminology } from "@/hooks/useTerminology";
import { useAuth } from "@/contexts/AuthContext";
import { Status } from "@/types";
import { X, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { translateResourceStatus } from "@/lib/i18nHelpers";

interface DroneListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drones: any[];
  onDronesUpdated?: () => void;
  statusFilter?: Status | null;
  onStatusFilterChange?: (filter: Status | null) => void;
}

export const DroneListDialog = ({ open, onOpenChange, drones, onDronesUpdated, statusFilter, onStatusFilterChange }: DroneListDialogProps) => {
  const [selectedDrone, setSelectedDrone] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const terminology = useTerminology();
  const { companyId } = useAuth();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "en" ? enUS : nb;

  const filteredDrones = useMemo(() => {
    if (!statusFilter) return drones;
    return drones.filter(d => d.status === statusFilter);
  }, [drones, statusFilter]);

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

  const titleSuffix = statusFilter ? ` – ${translateResourceStatus(statusFilter)} (${filteredDrones.length})` : ` (${drones.length})`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {terminology.vehicles}{titleSuffix}
            {statusFilter && (
              <button type="button" onClick={() => onStatusFilterChange?.(null)} className="inline-flex items-center gap-0.5 text-xs bg-muted rounded-full px-2 py-0.5 hover:bg-muted/80">
                {t("resources.cards.showAll")} <X className="w-3 h-3" />
              </button>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {filteredDrones.map((drone) => (
            <div 
              key={drone.id} 
              onClick={() => handleDroneClick(drone)}
              className="border border-border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{drone.modell}</h3>
                  {(drone as any).dji_aircraft_name && (
                    <p className="text-sm text-muted-foreground">{t("resources.cards.droneName")}: {(drone as any).dji_aircraft_name}</p>
                  )}
                  {drone.registration_number && (
                    <p className="text-sm text-muted-foreground">{t("resources.cards.regNumber")}: {drone.registration_number}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{t("resources.cards.serialNumber")}: {drone.serienummer}</p>
                  {drone.internal_serial && (
                    <p className="text-sm text-muted-foreground">{t("resources.cards.internalSerial")}: {drone.internal_serial}</p>
                  )}
                  {drone.company_id !== companyId && drone.companies?.navn && (
                    <Badge variant="secondary" className="mt-1 gap-1 text-xs">
                      <Building2 className="w-3 h-3" />
                      {drone.companies.navn}
                    </Badge>
                  )}
                </div>
                <StatusBadge status={drone.status as Status} />
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">{t("resources.cards.lastFlown")}</p>
                  <p className="font-medium">{drone.last_flown ? format(new Date(drone.last_flown), "dd.MM.yyyy") : "–"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("resources.cards.flightHours")}</p>
                  <p className="font-medium">{drone.flyvetimer}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t("resources.cards.available")}</p>
                  <p className="font-medium">{drone.tilgjengelig ? t("resources.cards.yes") : t("resources.cards.no")}</p>
                </div>
                {drone.neste_inspeksjon && (
                  <div>
                    <p className="text-muted-foreground text-xs">{t("resources.cards.nextInspection")}</p>
                    <p className="font-medium">
                      {format(new Date(drone.neste_inspeksjon), "dd.MM.yy", { locale: dateLocale })}
                    </p>
                  </div>
                )}
                {drone.sist_inspeksjon && (
                  <div>
                    <p className="text-muted-foreground text-xs">{t("resources.cards.lastInspection")}</p>
                    <p className="font-medium">
                      {format(new Date(drone.sist_inspeksjon), "dd.MM.yy", { locale: dateLocale })}
                    </p>
                  </div>
                )}
              </div>
              
              {drone.merknader && (
                <div className="text-sm pt-2 border-t border-border">
                  <span className="text-muted-foreground">{t("resources.cards.notesColon")}</span>
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
