import { supabase } from "@/integrations/supabase/client";

export interface ReassignFlightLogInput {
  flightLogId: string;
  newDroneId?: string | null;
  newPilotId?: string | null;
}

const moveHours = async (fromId: string | null, toId: string | null, hours: number) => {
  if (hours <= 0) return;
  const adjust = async (id: string, delta: number) => {
    const { data: row } = await (supabase as any)
      .from("drones")
      .select("flyvetimer")
      .eq("id", id)
      .maybeSingle();
    if (!row) return;
    const next = Math.max(0, Number(row.flyvetimer || 0) + delta);
    await (supabase as any).from("drones").update({ flyvetimer: next }).eq("id", id);
  };
  if (fromId) await adjust(fromId, -hours);
  if (toId) await adjust(toId, hours);
};

/**
 * Moves a flight log to another drone and/or pilot and keeps all derived data in sync:
 * - flight_logs.drone_id / user_id
 * - accumulated drone flight hours (drones.flyvetimer) are moved between the drones
 * - warning entries in the drone logbook are moved to the new drone
 * - personnel logbook entries are deleted from the old pilot and recreated for the new pilot
 * - flight_log_personnel is updated, which recomputes pilot flight hours via DB triggers
 */
export async function reassignFlightLog({ flightLogId, newDroneId, newPilotId }: ReassignFlightLogInput): Promise<void> {
  const { data: log, error: logErr } = await (supabase as any)
    .from("flight_logs")
    .select("id, drone_id, user_id, company_id, flight_date, flight_duration_minutes, departure_location, landing_location")
    .eq("id", flightLogId)
    .maybeSingle();
  if (logErr) throw logErr;
  if (!log) throw new Error("Flight log not found");

  const hours = Number(log.flight_duration_minutes || 0) / 60;
  const droneChanged = !!newDroneId && newDroneId !== log.drone_id;

  // Current pilot (personnel row takes precedence over flight_logs.user_id)
  const { data: personnelRows } = await (supabase as any)
    .from("flight_log_personnel")
    .select("id, profile_id")
    .eq("flight_log_id", flightLogId);
  const currentPilotId: string | null = personnelRows?.[0]?.profile_id ?? log.user_id ?? null;
  const pilotChanged = !!newPilotId && newPilotId !== currentPilotId;

  if (!droneChanged && !pilotChanged) return;

  // ---- Drone ----
  if (droneChanged) {
    const { error: updErr } = await (supabase as any)
      .from("flight_logs")
      .update({ drone_id: newDroneId })
      .eq("id", flightLogId);
    if (updErr) throw updErr;

    // Move warning entries created by this flight to the new drone
    if (log.drone_id && log.flight_date) {
      await (supabase as any)
        .from("drone_log_entries")
        .update({ drone_id: newDroneId })
        .eq("drone_id", log.drone_id)
        .eq("entry_date", log.flight_date)
        .eq("entry_type", "Advarsel")
        .eq("user_id", log.user_id);
    }

    await moveHours(log.drone_id, newDroneId!, hours);
  }

  // ---- Pilot ----
  if (pilotChanged) {
    const { error: updErr } = await (supabase as any)
      .from("flight_logs")
      .update({ user_id: newPilotId })
      .eq("id", flightLogId);
    if (updErr) throw updErr;

    if (personnelRows && personnelRows.length > 0) {
      // Remove old links, then add the new pilot (triggers recompute pilot hours)
      await (supabase as any).from("flight_log_personnel").delete().eq("flight_log_id", flightLogId);
    }
    const { error: insErr } = await (supabase as any)
      .from("flight_log_personnel")
      .insert({ flight_log_id: flightLogId, profile_id: newPilotId });
    if (insErr) throw insErr;

    // Move the personnel logbook entries: delete the old pilot's and recreate for the new one
    const { data: oldEntries } = await (supabase as any)
      .from("personnel_log_entries")
      .select("title, description, entry_type, entry_date, image_url, company_id, user_id")
      .eq("flight_log_id", flightLogId);

    await (supabase as any).from("personnel_log_entries").delete().eq("flight_log_id", flightLogId);

    if (oldEntries && oldEntries.length > 0) {
      const rows = oldEntries.map((e: any) => ({
        ...e,
        profile_id: newPilotId,
        flight_log_id: flightLogId,
        company_id: e.company_id || log.company_id,
      }));
      const { error: reInsErr } = await (supabase as any).from("personnel_log_entries").insert(rows);
      if (reInsErr) throw reInsErr;
    }
  }
}
