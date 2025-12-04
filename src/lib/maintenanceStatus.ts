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
