import { Status } from "@/types";

/**
 * Calculates maintenance/inspection status based on the next maintenance date.
 * 
 * @param nextMaintenanceDate - The next scheduled maintenance/inspection date
 * @param warningDays - Number of days before the date to show "Gul" status (default: 14)
 * @returns "Grønn" | "Gul" | "Rød"
 * 
 * Logic:
 * - Rød: Date has passed (overdue)
 * - Gul: Within warningDays of the date (approaching)
 * - Grønn: More than warningDays away or no date set
 */
export const calculateMaintenanceStatus = (
  nextMaintenanceDate: Date | string | null | undefined,
  warningDays: number = 14
): Status => {
  if (!nextMaintenanceDate) return "Grønn"; // No date set = OK
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const nextDate = new Date(nextMaintenanceDate);
  nextDate.setHours(0, 0, 0, 0);
  
  const daysUntil = Math.floor((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntil < 0) return "Rød";           // Overdue
  if (daysUntil <= warningDays) return "Gul"; // Approaching
  return "Grønn";                             // OK
};

/**
 * Gets status color classes based on calculated status
 */
export const getStatusColorClasses = (status: Status): string => {
  const colors: Record<Status, string> = {
    Grønn: "bg-status-green/20 text-green-700 dark:text-green-300 border-status-green/30",
    Gul: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
    Rød: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
  };
  return colors[status] || "";
};

/**
 * Status priority for comparison
 */
export const STATUS_PRIORITY: Record<Status, number> = {
  "Rød": 2,
  "Gul": 1,
  "Grønn": 0,
};

/**
 * Interface for competencies with expiry dates and status flag
 */
interface CompetencyItem {
  utloper_dato?: string | null;
  påvirker_status?: boolean;
}

/**
 * Calculates aggregated status for a person based on their competencies.
 * Only considers competencies where påvirker_status is true.
 * 
 * @param competencies - Array of competencies with expiry dates and påvirker_status flag
 * @param warningDays - Number of days before expiry to show "Gul" status (default: 30)
 * @returns Status ("Grønn" | "Gul" | "Rød")
 */
export const calculatePersonnelAggregatedStatus = (
  competencies: CompetencyItem[],
  warningDays: number = 30
): Status => {
  // Filter only competencies that affect status
  const relevantCompetencies = competencies.filter(c => c.påvirker_status !== false);
  
  if (relevantCompetencies.length === 0) {
    return "Grønn"; // No relevant competencies = OK
  }
  
  let worstPriority = 0;
  
  for (const comp of relevantCompetencies) {
    if (!comp.utloper_dato) continue; // No expiry date = OK for this competency
    
    const status = calculateMaintenanceStatus(comp.utloper_dato, warningDays);
    const priority = STATUS_PRIORITY[status];
    worstPriority = Math.max(worstPriority, priority);
  }
  
  // Find the status with matching priority
  const status = (Object.entries(STATUS_PRIORITY).find(
    ([_, priority]) => priority === worstPriority
  )?.[0] || "Grønn") as Status;
  
  return status;
};

/**
 * Interface for items with maintenance/inspection dates
 */
interface MaintenanceItem {
  neste_inspeksjon?: string | null;
  neste_vedlikehold?: string | null;
  varsel_dager?: number | null;
}

/**
 * Calculates aggregated status for a drone based on:
 * - The drone's own inspection status
 * - All linked accessories
 * - All linked equipment
 * 
 * Returns the "worst" status (Rød > Gul > Grønn)
 */
export const calculateDroneAggregatedStatus = (
  drone: MaintenanceItem,
  accessories: MaintenanceItem[],
  linkedEquipment: MaintenanceItem[]
): { status: Status; affectedItems: string[] } => {
  const affectedItems: string[] = [];
  let worstPriority = 0;
  
  // Calculate drone's own status
  const droneStatus = calculateMaintenanceStatus(
    drone.neste_inspeksjon,
    drone.varsel_dager ?? 14
  );
  worstPriority = STATUS_PRIORITY[droneStatus];
  
  // Check all accessories
  for (const acc of accessories) {
    const accStatus = calculateMaintenanceStatus(
      acc.neste_vedlikehold,
      acc.varsel_dager ?? 14
    );
    const accPriority = STATUS_PRIORITY[accStatus];
    if (accPriority > 0) {
      affectedItems.push((acc as any).navn || "Tilbehør");
    }
    worstPriority = Math.max(worstPriority, accPriority);
  }
  
  // Check all linked equipment
  for (const eq of linkedEquipment) {
    const eqStatus = calculateMaintenanceStatus(
      eq.neste_vedlikehold,
      eq.varsel_dager ?? 14
    );
    const eqPriority = STATUS_PRIORITY[eqStatus];
    if (eqPriority > 0) {
      affectedItems.push((eq as any).navn || "Utstyr");
    }
    worstPriority = Math.max(worstPriority, eqPriority);
  }
  
  // Find the status with matching priority
  const status = (Object.entries(STATUS_PRIORITY).find(
    ([_, priority]) => priority === worstPriority
  )?.[0] || "Grønn") as Status;
  
  return { status, affectedItems };
};
