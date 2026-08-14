import { supabase } from "@/integrations/supabase/client";

/**
 * Deletes a flight log and everything derived from it:
 * - deletes the personnel logbook entries linked to the flight log
 *   (must happen BEFORE the flight log is deleted: the FK is ON DELETE SET NULL,
 *   so deleting the flight log first would orphan the entries)
 * - deletes the flight_logs row (flight_log_equipment / _personnel / flight_events cascade)
 * - deletes ONLY the warning entries this flight created in the drone/equipment logbooks
 *   (matched on resource + exact entry_date + entry_type 'Advarsel' + same author)
 * - subtracts flight hours from drone + linked equipment (DB only has INSERT triggers)
 *
 * Pilot flight hours are recomputed automatically by DB triggers.
 * Nothing else is touched: other flights, other people's logbook entries and
 * manual maintenance/notes entries are all outside these filters.
 */
export async function deleteFlightLogWithLogbookEntries(flightLogId: string): Promise<void> {
  const { data: log, error: logErr } = await (supabase as any)
    .from("flight_logs")
    .select("id, drone_id, user_id, flight_date, flight_duration_minutes")
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

  // 1. Personnel logbook entries — delete FIRST (FK is ON DELETE SET NULL)
  const { error: pErr } = await (supabase as any)
    .from("personnel_log_entries")
    .delete()
    .eq("flight_log_id", flightLogId);
  if (pErr) throw pErr;

  // 2. Delete the flight log itself (cascades junction tables + events)
  const { data: deleted, error: delErr } = await (supabase as any)
    .from("flight_logs")
    .delete()
    .eq("id", flightLogId)
    .select("id");
  if (delErr) throw delErr;
  if (!deleted || deleted.length === 0) {
    throw new Error("Flight log could not be deleted (no permission)");
  }

  // 3. Warning entries created by this flight's own upload only
  if (log.flight_date && log.user_id) {
    if (log.drone_id) {
      await (supabase as any)
        .from("drone_log_entries")
        .delete()
        .eq("drone_id", log.drone_id)
        .eq("entry_date", log.flight_date)
        .eq("entry_type", "Advarsel")
        .eq("user_id", log.user_id);
    }
    for (const eqId of equipmentIds) {
      await (supabase as any)
        .from("equipment_log_entries")
        .delete()
        .eq("equipment_id", eqId)
        .eq("entry_date", log.flight_date)
        .eq("entry_type", "Advarsel")
        .eq("user_id", log.user_id);
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
