import { supabase } from "@/integrations/supabase/client";

/**
 * Deletes a flight log and everything derived from it:
 * - deletes the flight_logs row (junction tables cascade)
 * - subtracts flight hours from drone + linked equipment (DB only has INSERT triggers)
 * - deletes personnel logbook entries linked to the flight log
 * - deletes drone/equipment logbook entries created for this flight
 *
 * Pilot flight hours are recomputed automatically by DB triggers.
 * The flight log row is deleted first, so a permission failure leaves everything untouched.
 */
export async function deleteFlightLogWithLogbookEntries(flightLogId: string): Promise<void> {
  const { data: log, error: logErr } = await (supabase as any)
    .from("flight_logs")
    .select("id, drone_id, flight_date, flight_duration_minutes")
    .eq("id", flightLogId)
    .maybeSingle();
  if (logErr) throw logErr;
  if (!log) throw new Error("Flight log not found");

  const hours = Number(log.flight_duration_minutes || 0) / 60;

  // Linked equipment (read before the cascade removes the junction rows)
  const { data: eqRows } = await (supabase as any)
    .from("flight_log_equipment")
    .select("equipment_id")
    .eq("flight_log_id", flightLogId);
  const equipmentIds: string[] = (eqRows || []).map((r: any) => r.equipment_id).filter(Boolean);

  // 1. Delete the flight log itself (cascades junction tables + events)
  const { data: deleted, error: delErr } = await (supabase as any)
    .from("flight_logs")
    .delete()
    .eq("id", flightLogId)
    .select("id");
  if (delErr) throw delErr;
  if (!deleted || deleted.length === 0) {
    throw new Error("Flight log could not be deleted (no permission)");
  }

  // 2. Personnel logbook entries linked to this flight log
  await (supabase as any).from("personnel_log_entries").delete().eq("flight_log_id", flightLogId);

  // 3. Drone/equipment logbook entries created from this flight (same timestamp)
  if (log.flight_date) {
    if (log.drone_id) {
      await (supabase as any)
        .from("drone_log_entries")
        .delete()
        .eq("drone_id", log.drone_id)
        .eq("entry_date", log.flight_date);
    }
    for (const eqId of equipmentIds) {
      await (supabase as any)
        .from("equipment_log_entries")
        .delete()
        .eq("equipment_id", eqId)
        .eq("entry_date", log.flight_date);
    }
  }

  // 4. Subtract flight hours (only INSERT triggers exist in the DB)
  const subtractHours = async (table: "drones" | "equipment", id: string) => {
    if (!id || hours <= 0) return;
    const { data: row } = await (supabase as any).from(table).select("flyvetimer").eq("id", id).maybeSingle();
    if (!row) return;
    const next = Math.max(0, Number(row.flyvetimer || 0) - hours);
    await (supabase as any).from(table).update({ flyvetimer: next }).eq("id", id);
  };

  if (log.drone_id) await subtractHours("drones", log.drone_id);
  for (const eqId of equipmentIds) await subtractHours("equipment", eqId);
}
