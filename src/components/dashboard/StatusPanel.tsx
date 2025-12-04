import { GlassCard } from "@/components/GlassCard";
import { Plane, Gauge, Users } from "lucide-react";
import { Status } from "@/types";
import { useState, useEffect } from "react";
import { DroneListDialog } from "./DroneListDialog";
import { EquipmentListDialog } from "./EquipmentListDialog";
import { PersonnelListDialog } from "./PersonnelListDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTerminology } from "@/hooks/useTerminology";
import { calculateMaintenanceStatus, calculateDroneAggregatedStatus } from "@/lib/maintenanceStatus";

interface StatusCounts {
  Grønn: number;
  Gul: number;
  Rød: number;
}

const countByStatus = (items: { status: Status }[]): StatusCounts => {
  return items.reduce((acc, item) => {
    acc[item.status]++;
    return acc;
  }, { Grønn: 0, Gul: 0, Rød: 0 });
};

const StatusCard = ({
  title,
  icon: Icon,
  counts,
  onClick
}: {
  title: string;
  icon: any;
  counts: StatusCounts;
  onClick: () => void;
}) => {
  const total = counts.Grønn + counts.Gul + counts.Rød;
  const primaryStatus = counts.Rød > 0 ? "Rød" : counts.Gul > 0 ? "Gul" : "Grønn";
  const bgColors = {
    Grønn: "bg-status-green/20",
    Gul: "bg-status-yellow/20",
    Rød: "bg-status-red/20"
  };
  const borderColors = {
    Grønn: "border-status-green",
    Gul: "border-status-yellow",
    Rød: "border-status-red"
  };
  return (
    <div 
      onClick={onClick} 
      className={`${bgColors[primaryStatus]} ${borderColors[primaryStatus]} border-2 rounded p-2 sm:p-3 transition-all hover:scale-105 cursor-pointer text-gray-700 dark:text-gray-200`}
    >
      <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        <h3 className="font-semibold text-xs sm:text-sm">{title}</h3>
      </div>
      
      <div className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">{total}</div>
      
      <div className="flex flex-wrap gap-1 sm:gap-2 text-[10px] sm:text-xs">
        <div className="flex items-center gap-0.5 sm:gap-1">
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-status-green flex-shrink-0" />
          <span className="whitespace-nowrap">{counts.Grønn}</span>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-status-yellow flex-shrink-0" />
          <span className="whitespace-nowrap">{counts.Gul}</span>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-status-red flex-shrink-0" />
          <span className="whitespace-nowrap">{counts.Rød}</span>
        </div>
      </div>
    </div>
  );
};

export const StatusPanel = () => {
  const { user, companyId } = useAuth();
  const terminology = useTerminology();
  const [droneDialogOpen, setDroneDialogOpen] = useState(false);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [personnelDialogOpen, setPersonnelDialogOpen] = useState(false);
  const [drones, setDrones] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [personnel, setPersonnel] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchDrones();
      fetchEquipment();
      fetchPersonnel();
    }
  }, [user, companyId]);

  const fetchDrones = async () => {
    // Fetch drones with their accessories and linked equipment
    const { data: dronesData, error } = await supabase
      .from("drones")
      .select("*")
      .eq("aktiv", true);
    
    if (error || !dronesData) {
      console.error("Error fetching drones:", error);
      return;
    }

    // Fetch accessories and linked equipment for each drone
    const dronesWithAggregatedStatus = await Promise.all(
      dronesData.map(async (drone) => {
        // Fetch accessories
        const { data: accessories } = await supabase
          .from("drone_accessories")
          .select("*")
          .eq("drone_id", drone.id);

        // Fetch linked equipment
        const { data: linkedEquipmentData } = await supabase
          .from("drone_equipment")
          .select(`
            equipment:equipment_id (
              id,
              neste_vedlikehold,
              varsel_dager
            )
          `)
          .eq("drone_id", drone.id);

        const linkedEquipment = (linkedEquipmentData || [])
          .map((link: any) => link.equipment)
          .filter(Boolean);

        // Calculate aggregated status
        const { status } = calculateDroneAggregatedStatus(
          { neste_inspeksjon: drone.neste_inspeksjon, varsel_dager: drone.varsel_dager },
          accessories || [],
          linkedEquipment
        );

        return { ...drone, status };
      })
    );

    setDrones(dronesWithAggregatedStatus);
  };

  const fetchEquipment = async () => {
    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("aktiv", true);
    
    if (!error && data) {
      // Calculate dynamic status based on neste_vedlikehold with varsel_dager
      const equipmentWithDynamicStatus = data.map(item => ({
        ...item,
        status: calculateMaintenanceStatus(item.neste_vedlikehold, item.varsel_dager ?? 14) as Status
      }));
      setEquipment(equipmentWithDynamicStatus);
    }
  };

  const fetchPersonnel = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*, personnel_competencies(*)")
      .eq("approved", true);
    
    if (!error && data) {
      // Map profiles to include a status field (default to "Grønn")
      const personnelWithStatus = data.map(profile => ({
        ...profile,
        status: "Grønn" as Status
      }));
      setPersonnel(personnelWithStatus);
    }
  };

  const droneStatus = countByStatus(drones);
  const equipmentStatus = countByStatus(equipment);
  const personnelStatus = countByStatus(personnel);

  return (
    <>
      <GlassCard className="overflow-hidden">
        <h2 className="text-sm sm:text-base font-semibold mb-3">Ressursstatus</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 w-full">
          <StatusCard title={terminology.vehicles} icon={Plane} counts={droneStatus} onClick={() => setDroneDialogOpen(true)} />
          <StatusCard title="Utstyr" icon={Gauge} counts={equipmentStatus} onClick={() => setEquipmentDialogOpen(true)} />
          <StatusCard title="Personell" icon={Users} counts={personnelStatus} onClick={() => setPersonnelDialogOpen(true)} />
        </div>
      </GlassCard>
      
      <DroneListDialog 
        open={droneDialogOpen} 
        onOpenChange={setDroneDialogOpen} 
        drones={drones}
        onDronesUpdated={fetchDrones}
      />
      <EquipmentListDialog 
        open={equipmentDialogOpen} 
        onOpenChange={setEquipmentDialogOpen} 
        equipment={equipment}
        onEquipmentUpdated={fetchEquipment}
      />
      <PersonnelListDialog 
        open={personnelDialogOpen} 
        onOpenChange={setPersonnelDialogOpen} 
        personnel={personnel}
        onPersonnelUpdated={fetchPersonnel}
      />
    </>
  );
};
