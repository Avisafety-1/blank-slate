import { supabase } from "@/integrations/supabase/client";
import { droneDisplayLabel } from "@/lib/flightAnalysisTrack";

export interface ReassignFlightLogInput {
  flightLogId: string;
  newDroneId?: string | null;
  newPilotId?: string | null;
}

export interface ReassignPreview {
  droneChanged: boolean;
  pilotChanged: boolean;
  hours: number;
  fromDrone: string | null;
  toDrone: string | null;
  fromPilot: string | null;
  toPilot: string | null;
  warningEntries: number;
  personnelEntries: number;
  otherCrew: number;
}

export interface ReassignResult {
  changed: boolean;
  drone_changed?: boolean;
  pilot_changed?: boolean;
  hours_moved?: number;
  warnings_moved?: number;
  personnel_entries_moved?: number;
}

const droneLabel = async (id?: string | null): Promise<string | null> => {
  if (!id) return null;
  const { data } = await (supabase as any)
    .from("drones")
    .select("modell, serienummer, internal_serial, registration_number")
    .eq("id", id)
    .maybeSingle();
  return data ? droneDisplayLabel(data) || id : id;
};

const pilotLabel = async (id?: string | null): Promise<string | null> => {
  if (!id) return null;
  const { data } = await (supabase as any).from("profiles").select("full_name").eq("id", id).maybeSingle();
  return data?.full_name || id;
};

/**
 * Reads (never writes) everything needed to show the user exactly what a
 * reassignment will move before they confirm it.
 */
export async function previewFlightLogReassign({
  flightLogId,
  newDroneId,
  newPilotId,
}: ReassignFlightLogInput): Promise<ReassignPreview> {
  const { data: log, error } = await (supabase as any)
    .from("flight_logs")
    .select("id, drone_id, user_id, flight_date, flight_duration_minutes, created_at")
    .eq("id", flightLogId)
    .maybeSingle();
  if (error) throw error;
  if (!log) throw new Error("Flight log not found");

  const { data: personnelRows } = await (supabase as any)
    .from("flight_log_personnel")
    .select("profile_id")
    .eq("flight_log_id", flightLogId);
  const currentPilotId: string | null = personnelRows?.[0]?.profile_id ?? log.user_id ?? null;

  const droneChanged = !!newDroneId && newDroneId !== log.drone_id;
  const pilotChanged = !!newPilotId && newPilotId !== currentPilotId;

  // Warning entries that clearly belong to this flight (same window as the DB function)
  let warningEntries = 0;
  if (droneChanged && log.drone_id && log.user_id && log.created_at) {
    const from = new Date(new Date(log.created_at).getTime() - 10 * 60 * 1000).toISOString();
    const to = new Date(new Date(log.created_at).getTime() + 10 * 60 * 1000).toISOString();
    const { count } = await (supabase as any)
      .from("drone_log_entries")
      .select("id", { count: "exact", head: true })
      .eq("drone_id", log.drone_id)
      .eq("entry_type", "Advarsel")
      .eq("entry_date", log.flight_date)
      .eq("user_id", log.user_id)
      .gte("created_at", from)
      .lte("created_at", to);
    warningEntries = count || 0;
  }

  let personnelEntries = 0;
  if (pilotChanged) {
    const { count } = await (supabase as any)
      .from("personnel_log_entries")
      .select("id", { count: "exact", head: true })
      .eq("flight_log_id", flightLogId);
    personnelEntries = count || 0;
  }

  const otherCrew = (personnelRows || []).filter((r: any) => r.profile_id !== currentPilotId).length;

  const [fromDrone, toDrone, fromPilot, toPilot] = await Promise.all([
    droneChanged ? droneLabel(log.drone_id) : Promise.resolve(null),
    droneChanged ? droneLabel(newDroneId) : Promise.resolve(null),
    pilotChanged ? pilotLabel(currentPilotId) : Promise.resolve(null),
    pilotChanged ? pilotLabel(newPilotId) : Promise.resolve(null),
  ]);

  return {
    droneChanged,
    pilotChanged,
    hours: Number(log.flight_duration_minutes || 0) / 60,
    fromDrone,
    toDrone,
    fromPilot,
    toPilot,
    warningEntries,
    personnelEntries,
    otherCrew,
  };
}

/**
 * Moves a flight log to another drone and/or pilot.
 *
 * Everything happens inside a single transactional SECURITY DEFINER function
 * (`public.reassign_flight_log`): flight_logs.drone_id/user_id, accumulated
 * drone hours, warning entries in the drone logbook, the pilot row in
 * flight_log_personnel (other crew is kept) and the personnel logbook entries.
 * Either all of it succeeds, or nothing is changed.
 */
export async function reassignFlightLog({
  flightLogId,
  newDroneId,
  newPilotId,
}: ReassignFlightLogInput): Promise<ReassignResult> {
  const { data, error } = await (supabase as any).rpc("reassign_flight_log", {
    p_flight_log_id: flightLogId,
    p_drone_id: newDroneId || null,
    p_pilot_id: newPilotId || null,
  });
  if (error) throw error;
  return (data || { changed: false }) as ReassignResult;
}
