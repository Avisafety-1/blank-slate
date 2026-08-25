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

export type PilotFlight = {
  id: string;
  flight_date: string;
  flight_duration_minutes: number;
};

/**
 * Samme regel som getPilotFlightLogIds, men for flere personer samtidig og med
 * selve flyturene (dato + minutter). Brukes til currency-status og KPI-er.
 *
 * @param personIds profil-ID-er
 * @param sinceDate valgfri ISO-dato (YYYY-MM-DD) for å begrense uthentingen
 */
export async function getPilotFlightsForPeople(
  personIds: string[],
  sinceDate?: string,
): Promise<Record<string, PilotFlight[]>> {
  const result: Record<string, PilotFlight[]> = {};
  if (personIds.length === 0) return result;

  // 1. Koblede flyturer via flight_log_personnel
  const { data: linkRows, error: linkErr } = await (supabase as any)
    .from("flight_log_personnel")
    .select("flight_log_id, profile_id")
    .in("profile_id", personIds);
  if (linkErr) throw linkErr;

  // 2. Egne flyturer (eier) innenfor perioden
  let ownedQuery = (supabase as any)
    .from("flight_logs")
    .select("id, user_id, flight_date, flight_duration_minutes")
    .in("user_id", personIds);
  if (sinceDate) ownedQuery = ownedQuery.gte("flight_date", sinceDate);
  const { data: ownedLogs, error: ownedErr } = await ownedQuery;
  if (ownedErr) throw ownedErr;

  // 3. Hvilke av de eide loggene har i det hele tatt en personellkobling?
  const ownedIds: string[] = (ownedLogs || []).map((l: any) => l.id);
  const ownedWithAnyPilot = new Set<string>();
  if (ownedIds.length > 0) {
    const { data: pilotRows, error: pilotErr } = await (supabase as any)
      .from("flight_log_personnel")
      .select("flight_log_id")
      .in("flight_log_id", ownedIds);
    if (pilotErr) throw pilotErr;
    for (const r of pilotRows || []) ownedWithAnyPilot.add(r.flight_log_id);
  }

  // 4. Hent detaljer for de koblede loggene
  const linkedIds = Array.from(
    new Set((linkRows || []).map((r: any) => r.flight_log_id).filter(Boolean)),
  );
  const logById = new Map<string, PilotFlight>();
  for (const l of ownedLogs || []) {
    logById.set(l.id, {
      id: l.id,
      flight_date: l.flight_date,
      flight_duration_minutes: Number(l.flight_duration_minutes) || 0,
    });
  }
  const missing = linkedIds.filter((id) => !logById.has(id));
  for (let i = 0; i < missing.length; i += 500) {
    let q = (supabase as any)
      .from("flight_logs")
      .select("id, flight_date, flight_duration_minutes")
      .in("id", missing.slice(i, i + 500));
    if (sinceDate) q = q.gte("flight_date", sinceDate);
    const { data: rows, error } = await q;
    if (error) throw error;
    for (const l of rows || []) {
      logById.set(l.id, {
        id: l.id,
        flight_date: l.flight_date,
        flight_duration_minutes: Number(l.flight_duration_minutes) || 0,
      });
    }
  }

  const seen = new Map<string, Set<string>>();
  const push = (personId: string, logId: string) => {
    const log = logById.get(logId);
    if (!log) return;
    const set = seen.get(personId) || new Set<string>();
    if (set.has(logId)) return;
    set.add(logId);
    seen.set(personId, set);
    (result[personId] ||= []).push(log);
  };

  for (const r of linkRows || []) push(r.profile_id, r.flight_log_id);
  for (const l of ownedLogs || []) {
    if (!ownedWithAnyPilot.has(l.id)) push(l.user_id, l.id);
  }

  return result;
}

