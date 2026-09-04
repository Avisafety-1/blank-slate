import { supabase } from "@/integrations/supabase/client";
import { fetchTotalMissionsFor, dateInputToDate } from "@/lib/maintenanceSchedules";

/**
 * Shared helper to perform a drone inspection.
 * Used by DroneDetailDialog (manual + checklist) and Kalender.
 *
 * Updates sist_inspeksjon (full timestamp), neste_inspeksjon,
 * hours_at_last_inspection, missions_at_last_inspection,
 * and inserts a drone_inspections log row.
 */
export async function performDroneInspection(params: {
  droneId: string;
  companyId: string;
  userId: string;
  currentFlyvetimer: number;
  inspectionIntervalDays: number | null;
  inspectionType?: string;
  notes?: string;
  /** Optional YYYY-MM-DD to backdate the inspection (defaults to today). */
  performedDate?: string;
}): Promise<void> {
  const {
    droneId,
    companyId,
    userId,
    currentFlyvetimer,
    inspectionIntervalDays,
    inspectionType = "Manuell inspeksjon",
    notes = "",
    performedDate,
  } = params;

  const performedAt = dateInputToDate(performedDate) ?? new Date();
  const now = performedAt.toISOString();

  // Count total unique missions for this drone up to now (shared helper so the
  // stored baseline matches what every inspection view displays)
  const totalMissions = await fetchTotalMissionsFor("droner", droneId);


  let nextInspection: string | null = null;
  if (inspectionIntervalDays) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + inspectionIntervalDays);
    nextInspection = nextDate.toISOString().split("T")[0];
  }

  const { error: updateError } = await supabase
    .from("drones")
    .update({
      sist_inspeksjon: now,
      neste_inspeksjon: nextInspection,
      hours_at_last_inspection: currentFlyvetimer,
      missions_at_last_inspection: totalMissions ?? 0,
      maintenance_notification_sent: false,
    })
    .eq("id", droneId);

  if (updateError) throw updateError;

  await supabase.from("drone_inspections").insert({
    drone_id: droneId,
    company_id: companyId,
    user_id: userId,
    inspection_date: now,
    inspection_type: inspectionType,
    notes,
  });
}

/**
 * Counts unique missions since the last inspection for a drone.
 * Uses flight_logs with mission_id != null and flight_date > sist_inspeksjon.
 *
 * NOTE: Supabase head:true count counts rows, not distinct values.
 * To get truly unique mission counts we fetch the ids and deduplicate client-side.
 */
export async function countUniqueMissionsSinceInspection(
  droneId: string,
  sistInspeksjon: string | null
): Promise<number> {
  let query = supabase
    .from("flight_logs")
    .select("mission_id")
    .eq("drone_id", droneId)
    .not("mission_id", "is", null);

  if (sistInspeksjon) {
    query = query.gt("flight_date", sistInspeksjon);
  }

  const { data } = await query;
  if (!data) return 0;

  const uniqueIds = new Set(data.map((row: any) => row.mission_id));
  return uniqueIds.size;
}
