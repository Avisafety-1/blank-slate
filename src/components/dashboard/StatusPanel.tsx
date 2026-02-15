import { GlassCard } from "@/components/GlassCard";
import { Plane, Gauge, Users } from "lucide-react";
import { Status } from "@/types";
import { useState } from "react";
import { DroneListDialog } from "./DroneListDialog";
import { EquipmentListDialog } from "./EquipmentListDialog";
import { PersonnelListDialog } from "./PersonnelListDialog";
import { useTerminology } from "@/hooks/useTerminology";
import { useTranslation } from "react-i18next";
import { useStatusData } from "@/hooks/useStatusData";
import { Skeleton } from "@/components/ui/skeleton";

interface StatusCounts {
  Grønn: number;
  Gul: number;
  Rød: number;
}

const statusSegments: { key: Status; bg: string; text: string }[] = [
  { key: "Grønn", bg: "bg-status-green", text: "text-green-950" },
  { key: "Gul", bg: "bg-status-yellow", text: "text-yellow-950" },
  { key: "Rød", bg: "bg-status-red", text: "text-red-950" },
];

const StatusCard = ({
  title,
  icon: Icon,
  counts,
  onSegmentClick,
}: {
  title: string;
  icon: any;
  counts: StatusCounts;
  onSegmentClick: (status: Status) => void;
}) => {
  const total = counts.Grønn + counts.Gul + counts.Rød;

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold text-xs sm:text-sm text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground ml-auto">({total})</span>
      </div>

      <div className="flex w-full h-12 sm:h-14">
        {statusSegments.map(({ key, bg, text }) =>
          counts[key] > 0 ? (
            <button
              key={key}
              type="button"
              style={{ flexGrow: counts[key] }}
              className={`${bg} ${text} flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity min-w-0`}
              onClick={() => onSegmentClick(key)}
            >
              <span className="text-lg sm:text-xl font-bold leading-tight">{counts[key]}</span>
            </button>
          ) : null
        )}
      </div>
    </div>
  );
};

const StatusCardSkeleton = () => (
  <div className="rounded-lg border border-border overflow-hidden bg-card">
    <div className="flex items-center gap-1.5 px-3 py-2">
      <Skeleton className="w-4 h-4 rounded" />
      <Skeleton className="h-4 w-16" />
    </div>
    <Skeleton className="h-12 sm:h-14 w-full rounded-none" />
  </div>
);

export const StatusPanel = () => {
  const { t } = useTranslation();
  const terminology = useTerminology();
  const [droneDialogOpen, setDroneDialogOpen] = useState(false);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [personnelDialogOpen, setPersonnelDialogOpen] = useState(false);
  const [droneFilter, setDroneFilter] = useState<Status | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<Status | null>(null);
  const [personnelFilter, setPersonnelFilter] = useState<Status | null>(null);

  const {
    isLoading,
    drones,
    equipment,
    personnel,
    droneStatus,
    equipmentStatus,
    personnelStatus,
    refetchDrones,
    refetchEquipment,
    refetchPersonnel,
  } = useStatusData();

  const openDrone = (status: Status) => { setDroneFilter(status); setDroneDialogOpen(true); };
  const openEquipment = (status: Status) => { setEquipmentFilter(status); setEquipmentDialogOpen(true); };
  const openPersonnel = (status: Status) => { setPersonnelFilter(status); setPersonnelDialogOpen(true); };

  return (
    <>
      <GlassCard className="overflow-hidden">
        <h2 className="text-sm sm:text-base font-semibold mb-3">{t('dashboard.status.title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 w-full">
          {isLoading ? (
            <>
              <StatusCardSkeleton />
              <StatusCardSkeleton />
              <StatusCardSkeleton />
            </>
          ) : (
            <>
              <StatusCard title={terminology.vehicles} icon={Plane} counts={droneStatus} onSegmentClick={openDrone} />
              <StatusCard title={t('dashboard.status.equipment')} icon={Gauge} counts={equipmentStatus} onSegmentClick={openEquipment} />
              <StatusCard title={t('dashboard.status.personnel')} icon={Users} counts={personnelStatus} onSegmentClick={openPersonnel} />
            </>
          )}
        </div>
      </GlassCard>
      
      <DroneListDialog 
        open={droneDialogOpen} 
        onOpenChange={(o) => { setDroneDialogOpen(o); if (!o) setDroneFilter(null); }}
        drones={drones}
        onDronesUpdated={refetchDrones}
        statusFilter={droneFilter}
        onStatusFilterChange={setDroneFilter}
      />
      <EquipmentListDialog 
        open={equipmentDialogOpen} 
        onOpenChange={(o) => { setEquipmentDialogOpen(o); if (!o) setEquipmentFilter(null); }}
        equipment={equipment}
        onEquipmentUpdated={refetchEquipment}
        statusFilter={equipmentFilter}
        onStatusFilterChange={setEquipmentFilter}
      />
      <PersonnelListDialog 
        open={personnelDialogOpen} 
        onOpenChange={(o) => { setPersonnelDialogOpen(o); if (!o) setPersonnelFilter(null); }}
        personnel={personnel}
        onPersonnelUpdated={refetchPersonnel}
        statusFilter={personnelFilter}
        onStatusFilterChange={setPersonnelFilter}
      />
    </>
  );
};
