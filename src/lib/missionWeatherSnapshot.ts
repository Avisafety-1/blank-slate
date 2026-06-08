import { supabase } from "@/integrations/supabase/client";

/**
 * Bygger weather_data_snapshot for et oppdrag.
 *
 * Regel:
 *  - flightDate > 24t gammel  → { unavailable: true, reason: 'historical' }
 *  - koordinater mangler      → { unavailable: true, reason: 'no_location' }
 *  - ellers                   → henter live vær fra drone-weather edge function
 *  - feil/timeout under henting → { unavailable: true, reason: 'fetch_failed' }
 *
 * Form matcher det DroneWeatherPanel forventer (top-level `current`, `warnings`,
 * `drone_flight_recommendation`) og det auto-complete-missions skriver
 * (`unavailable: true, reason: 'historical'`).
 */
export type MissionWeatherSnapshotSource =
  | "flight_log_import"
  | "flight_timer"
  | "status_dropdown"
  | "add_dialog"
  | "auto_complete";

export interface BuildMissionWeatherSnapshotArgs {
  flightDate: Date;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  source: MissionWeatherSnapshotSource;
  /** Default 24t. */
  historicalThresholdHours?: number;
  /** Default 8000 ms. */
  fetchTimeoutMs?: number;
}

const TWENTYFOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function buildMissionWeatherSnapshot({
  flightDate,
  latitude,
  longitude,
  source,
  historicalThresholdHours,
  fetchTimeoutMs = 8000,
}: BuildMissionWeatherSnapshotArgs): Promise<Record<string, any>> {
  const thresholdMs = (historicalThresholdHours ?? 24) * 60 * 60 * 1000 || TWENTYFOUR_HOURS_MS;
  const capturedAt = new Date().toISOString();

  // Historisk oppdrag – ikke hent nåværende vær
  if (Date.now() - flightDate.getTime() > thresholdMs) {
    return {
      captured_at: capturedAt,
      unavailable: true,
      reason: "historical",
      source,
    };
  }

  // Uten koordinater kan vi ikke hente vær
  if (latitude == null || longitude == null) {
    return {
      captured_at: capturedAt,
      unavailable: true,
      reason: "no_location",
      source,
    };
  }

  try {
    const invokePromise = supabase.functions.invoke("drone-weather", {
      body: { lat: latitude, lon: longitude },
    });
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error("timeout") }), fetchTimeoutMs)
    );
    const { data: weatherData } = (await Promise.race([invokePromise, timeoutPromise])) as any;

    if (weatherData && !weatherData.error) {
      return {
        captured_at: capturedAt,
        current: weatherData.current,
        warnings: weatherData.warnings || [],
        drone_flight_recommendation: weatherData.drone_flight_recommendation,
        source,
      };
    }
  } catch (err) {
    console.warn("[missionWeatherSnapshot] fetch failed:", err);
  }

  return {
    captured_at: capturedAt,
    unavailable: true,
    reason: "fetch_failed",
    source,
  };
}
