import { supabase } from "@/integrations/supabase/client";

/**
 * Felles sannhetskilde for hvilke flyturer som tilhører en person.
 *
 * - Alle flyturer der personen er koblet som personell (flight_log_personnel).
 * - Pluss flyturer personen eier (flight_logs.user_id) som IKKE har noen
 *   pilotkobling i det hele tatt — da antar vi at eieren også er piloten.
 *
 * Flyturer personen eier, men der andre er registrert som personell, tas ikke
 * med (eieren er da bare importøren).
 */
export async function getPilotFlightLogIds(personId: string): Promise<string[]> {
  const [linkedRes, ownedRes] = await Promise.all([
    (supabase as any)
      .from("flight_log_personnel")
      .select("flight_log_id")
      .eq("profile_id", personId),
    (supabase as any)
      .from("flight_logs")
      .select("id")
      .eq("user_id", personId),
  ]);

  if (linkedRes.error) throw linkedRes.error;
  if (ownedRes.error) throw ownedRes.error;

  const ids = new Set<string>(
    (linkedRes.data || []).map((r: any) => r.flight_log_id).filter(Boolean),
  );

  const ownedIds: string[] = (ownedRes.data || []).map((r: any) => r.id);
  if (ownedIds.length > 0) {
    const { data: pilotRows, error: pilotErr } = await (supabase as any)
      .from("flight_log_personnel")
      .select("flight_log_id")
      .in("flight_log_id", ownedIds);
    if (pilotErr) throw pilotErr;
    const withPilots = new Set((pilotRows || []).map((r: any) => r.flight_log_id));
    for (const id of ownedIds) {
      if (!withPilots.has(id)) ids.add(id);
    }
  }

  return Array.from(ids);
}
