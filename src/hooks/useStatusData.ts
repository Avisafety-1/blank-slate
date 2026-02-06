import { useQueries, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Status } from "@/types";
import { calculateMaintenanceStatus, calculateDroneAggregatedStatus, calculatePersonnelAggregatedStatus } from "@/lib/maintenanceStatus";
import { useEffect } from "react";

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

const fetchDrones = async () => {
  // Batch all 3 queries in parallel instead of N+1 per drone
  const [dronesResult, accessoriesResult, droneEquipmentResult] = await Promise.all([
    supabase.from("drones").select("*").eq("aktiv", true),
    supabase.from("drone_accessories").select("*"),
    supabase.from("drone_equipment").select(`
      drone_id,
      equipment:equipment_id (
        id,
        neste_vedlikehold,
        varsel_dager
      )
    `),
  ]);

  if (dronesResult.error || !dronesResult.data) {
    throw dronesResult.error;
  }

  const dronesData = dronesResult.data;
  const allAccessories = accessoriesResult.data || [];
  const allDroneEquipment = droneEquipmentResult.data || [];

  // Group accessories and equipment by drone_id in memory
  const accessoriesByDrone = new Map<string, any[]>();
  for (const acc of allAccessories) {
    const list = accessoriesByDrone.get(acc.drone_id) || [];
    list.push(acc);
    accessoriesByDrone.set(acc.drone_id, list);
  }

  const equipmentByDrone = new Map<string, any[]>();
  for (const link of allDroneEquipment) {
    if (link.equipment) {
      const list = equipmentByDrone.get(link.drone_id) || [];
      list.push(link.equipment);
      equipmentByDrone.set(link.drone_id, list);
    }
  }

  return dronesData.map((drone) => {
    const accessories = accessoriesByDrone.get(drone.id) || [];
    const linkedEquipment = equipmentByDrone.get(drone.id) || [];

    const { status } = calculateDroneAggregatedStatus(
      { neste_inspeksjon: drone.neste_inspeksjon, varsel_dager: drone.varsel_dager },
      accessories,
      linkedEquipment
    );

    return { ...drone, status };
  });
};

const fetchEquipment = async () => {
  const { data, error } = await supabase
    .from("equipment")
    .select("*")
    .eq("aktiv", true);
  
  if (error || !data) {
    throw error;
  }

  return data.map(item => ({
    ...item,
    status: calculateMaintenanceStatus(item.neste_vedlikehold, item.varsel_dager ?? 14) as Status
  }));
};

const fetchPersonnel = async () => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, personnel_competencies(*)")
    .eq("approved", true);
  
  if (error || !data) {
    throw error;
  }

  return data.map(profile => ({
    ...profile,
    status: calculatePersonnelAggregatedStatus(
      profile.personnel_competencies || [],
      30
    )
  }));
};

export const useStatusData = () => {
  const { user, companyId } = useAuth();
  const queryClient = useQueryClient();

  // Real-time subscriptions for automatic cache invalidation
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('status-data-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drones' }, 
        () => { queryClient.invalidateQueries({ queryKey: ['drones', companyId] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, 
        () => { queryClient.invalidateQueries({ queryKey: ['equipment', companyId] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, 
        () => { queryClient.invalidateQueries({ queryKey: ['personnel', companyId] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personnel_competencies' }, 
        () => { queryClient.invalidateQueries({ queryKey: ['personnel', companyId] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drone_accessories' }, 
        () => { queryClient.invalidateQueries({ queryKey: ['drones', companyId] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drone_equipment' }, 
        () => { queryClient.invalidateQueries({ queryKey: ['drones', companyId] }); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, companyId, queryClient]);

  const results = useQueries({
    queries: [
      {
        queryKey: ['drones', companyId],
        queryFn: fetchDrones,
        enabled: !!user,
        staleTime: 5000,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: ['equipment', companyId],
        queryFn: fetchEquipment,
        enabled: !!user,
        staleTime: 5000,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: ['personnel', companyId],
        queryFn: fetchPersonnel,
        enabled: !!user,
        staleTime: 5000,
        refetchOnWindowFocus: true,
      },
    ],
  });

  const [dronesResult, equipmentResult, personnelResult] = results;

  const isLoading = dronesResult.isLoading || equipmentResult.isLoading || personnelResult.isLoading;
  const drones = dronesResult.data || [];
  const equipment = equipmentResult.data || [];
  const personnel = personnelResult.data || [];

  return {
    isLoading,
    drones,
    equipment,
    personnel,
    droneStatus: countByStatus(drones),
    equipmentStatus: countByStatus(equipment),
    personnelStatus: countByStatus(personnel),
    refetchDrones: dronesResult.refetch,
    refetchEquipment: equipmentResult.refetch,
    refetchPersonnel: personnelResult.refetch,
  };
};
