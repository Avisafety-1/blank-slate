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
  const { data: dronesData, error } = await supabase
    .from("drones")
    .select("*")
    .eq("aktiv", true);
  
  if (error || !dronesData) {
    throw error;
  }

  // Fetch accessories and linked equipment for each drone in parallel
  const dronesWithAggregatedStatus = await Promise.all(
    dronesData.map(async (drone) => {
      const [accessoriesResult, linkedEquipmentResult] = await Promise.all([
        supabase
          .from("drone_accessories")
          .select("*")
          .eq("drone_id", drone.id),
        supabase
          .from("drone_equipment")
          .select(`
            equipment:equipment_id (
              id,
              neste_vedlikehold,
              varsel_dager
            )
          `)
          .eq("drone_id", drone.id)
      ]);

      const accessories = accessoriesResult.data || [];
      const linkedEquipment = (linkedEquipmentResult.data || [])
        .map((link: any) => link.equipment)
        .filter(Boolean);

      const { status } = calculateDroneAggregatedStatus(
        { neste_inspeksjon: drone.neste_inspeksjon, varsel_dager: drone.varsel_dager },
        accessories,
        linkedEquipment
      );

      return { ...drone, status };
    })
  );

  return dronesWithAggregatedStatus;
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
        () => { if (navigator.onLine) queryClient.invalidateQueries({ queryKey: ['drones', companyId] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, 
        () => { if (navigator.onLine) queryClient.invalidateQueries({ queryKey: ['equipment', companyId] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, 
        () => { if (navigator.onLine) queryClient.invalidateQueries({ queryKey: ['personnel', companyId] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personnel_competencies' }, 
        () => { if (navigator.onLine) queryClient.invalidateQueries({ queryKey: ['personnel', companyId] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drone_accessories' }, 
        () => { if (navigator.onLine) queryClient.invalidateQueries({ queryKey: ['drones', companyId] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drone_equipment' }, 
        () => { if (navigator.onLine) queryClient.invalidateQueries({ queryKey: ['drones', companyId] }); })
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
        staleTime: 30000, // 30 seconds
        refetchOnWindowFocus: true,
      },
      {
        queryKey: ['equipment', companyId],
        queryFn: fetchEquipment,
        enabled: !!user,
        staleTime: 30000,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: ['personnel', companyId],
        queryFn: fetchPersonnel,
        enabled: !!user,
        staleTime: 30000,
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
