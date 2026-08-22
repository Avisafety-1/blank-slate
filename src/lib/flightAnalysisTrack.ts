import { supabase } from "@/integrations/supabase/client";

/**
 * Builds the data payload for FlightAnalysisDialog from a flight_logs row.
 * Used by mission cards, mission detail dialog and the drone logbook so that
 * "Analyser" always shows the same level of detail.
 */

export const FLIGHT_ANALYSIS_COLUMNS =
  "id, flight_date, flight_track, flight_duration_minutes, departure_location, landing_location, " +
  "source, entry_source, drone_model, aircraft_serial, log_identifiers, dronelog_sha256, dronelog_warnings, " +
  "start_time_utc, end_time_utc, total_distance_m, max_distance_m, max_height_m, max_horiz_speed_ms, " +
  "max_vert_speed_ms, rth_triggered, battery_sn, battery_cycles, battery_health_pct, " +
  "battery_full_capacity_mah, battery_voltage_min_v, battery_cell_deviation_max_v, " +
  "battery_temp_min_c, battery_temp_max_c, gps_sat_min, gps_sat_max, " +
  "drone_id, mission_id, user_id, company_id";

export interface FlightLogContext {
  flightLogId?: string | null;
  companyId?: string | null;
  droneId?: string | null;
  droneName?: string | null;
  droneModelName?: string | null;
  pilotProfileId?: string | null;
  pilotName?: string | null;
  missionId?: string | null;
  missionName?: string | null;
}

/** Resolves drone / pilot / mission names for the "logged on" section. */
export async function loadFlightLogContext(log: any): Promise<FlightLogContext> {
  const ctx: FlightLogContext = {
    flightLogId: log?.id ?? null,
    companyId: log?.company_id ?? null,
    droneId: log?.drone_id ?? null,
    missionId: log?.mission_id ?? null,
  };

  const tasks: Promise<any>[] = [];

  if (log?.drone_id) {
    tasks.push(
      (supabase as any)
        .from("drones")
        .select("id, navn, modell")
        .eq("id", log.drone_id)
        .maybeSingle()
        .then(({ data }: any) => {
          ctx.droneName = data?.navn ?? null;
          ctx.droneModelName = data?.modell ?? null;
        })
    );
  }

  if (log?.mission_id) {
    tasks.push(
      (supabase as any)
        .from("missions")
        .select("id, title")
        .eq("id", log.mission_id)
        .maybeSingle()
        .then(({ data }: any) => {
          ctx.missionName = data?.title ?? null;
        })
    );
  }

  tasks.push(
    (supabase as any)
      .from("flight_log_personnel")
      .select("profile_id")
      .eq("flight_log_id", log?.id)
      .limit(1)
      .then(async ({ data }: any) => {
        const profileId = data?.[0]?.profile_id ?? log?.user_id ?? null;
        ctx.pilotProfileId = profileId;
        if (profileId) {
          const { data: p } = await (supabase as any)
            .from("profiles")
            .select("id, full_name")
            .eq("id", profileId)
            .maybeSingle();
          ctx.pilotName = p?.full_name ?? null;
        }
      })
  );

  await Promise.all(tasks);
  return ctx;
}


const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? null : n;
};

/** Derived metrics computed from the sampled telemetry points. */
function deriveFromPositions(positions: any[]) {
  let maxWindMs: number | null = null;
  let maxMslM: number | null = null;
  let speedSum = 0;
  let speedCount = 0;
  const modes = new Set<string>();
  let lastMode: string | null = null;
  let modeChanges = 0;

  for (const p of positions) {
    const w = num(p?.windSpeed);
    if (w != null && (maxWindMs == null || w > maxWindMs)) maxWindMs = w;
    const alt = num(p?.alt);
    if (alt != null && (maxMslM == null || alt > maxMslM)) maxMslM = alt;
    const s = num(p?.speed);
    if (s != null) { speedSum += s; speedCount++; }
    const mode = typeof p?.flycState === "string" && p.flycState ? p.flycState : null;
    if (mode) {
      modes.add(mode);
      if (lastMode && mode !== lastMode) modeChanges++;
      lastMode = mode;
    }
  }

  return {
    avgSpeedMs: speedCount > 0 ? Math.round((speedSum / speedCount) * 10) / 10 : null,
    maxWindMs: maxWindMs != null ? Math.round(maxWindMs * 10) / 10 : null,
    maxMslM: maxMslM != null ? Math.round(maxMslM) : null,
    modeChanges: modes.size > 1 ? modeChanges : null,
  };
}

export function buildFlightAnalysisTrack(log: any, events: any[] = [], context?: FlightLogContext) {
  const positions = log?.flight_track?.positions || [];
  const identifiers = (log?.log_identifiers as any) || {};
  const derived = deriveFromPositions(positions);

  const warnings = log?.dronelog_warnings;
  const warningCount = Array.isArray(warnings)
    ? warnings.length
    : Array.isArray(warnings?.warnings)
      ? warnings.warnings.length
      : null;

  return {
    positions,
    events,
    batterySummary: {
      cycles: log?.battery_cycles ?? null,
      healthPct: num(log?.battery_health_pct),
      fullCapacityMah: log?.battery_full_capacity_mah ?? null,
      voltageMinV: num(log?.battery_voltage_min_v),
      tempMaxC: num(log?.battery_temp_max_c),
      cellDeviationV: num(log?.battery_cell_deviation_max_v),
    },
    summary: {
      durationMinutes: log?.flight_duration_minutes ?? null,
      maxSpeedMs: num(log?.max_horiz_speed_ms),
      minBatteryPct: log?.min_battery_pct ?? null,
      minBatteryV: num(log?.battery_voltage_min_v),
      totalRows: positions.length || null,
      totalDistanceM: num(log?.total_distance_m),
      maxAltitudeM: num(log?.max_height_m),
      minGpsSat: log?.gps_sat_min ?? null,
      maxGpsSat: log?.gps_sat_max ?? null,
      batteryTempMaxC: num(log?.battery_temp_max_c),
      batteryTempMinC: num(log?.battery_temp_min_c),
      batteryVoltageMinV: num(log?.battery_voltage_min_v),
      maxDistanceM: num(log?.max_distance_m),
      maxVSpeedMs: num(log?.max_vert_speed_ms),
      batteryCellDeviationV: num(log?.battery_cell_deviation_max_v),
      rthTriggered: log?.rth_triggered ?? false,
      source: log?.source ?? null,

      // Derived from telemetry
      avgSpeedMs: derived.avgSpeedMs,
      maxWindMs: derived.maxWindMs,
      maxMslM: derived.maxMslM,
      modeChanges: derived.modeChanges,
      warningCount,

      // Identifiers / log metadata
      droneModel: log?.drone_model ?? identifiers.droneType ?? null,
      aircraftName: identifiers.aircraftName ?? null,
      aircraftSerial: log?.aircraft_serial ?? null,
      fcSerial: identifiers.fcSN ?? null,
      rcSerial: identifiers.rcSN ?? null,
      cameraSerial: identifiers.cameraSN ?? null,
      gimbalSerial: identifiers.gimbalSN ?? null,
      batterySn: log?.battery_sn ?? null,
      batteryCycles: log?.battery_cycles ?? null,
      batteryHealthPct: num(log?.battery_health_pct),
      batteryFullCapacityMah: log?.battery_full_capacity_mah ?? null,
      entrySource: log?.entry_source ?? null,
      startTimeUtc: log?.start_time_utc ?? null,
      endTimeUtc: log?.end_time_utc ?? null,
      sha256: log?.dronelog_sha256 ?? null,
      logGuid: identifiers.guid ?? null,

      // "Logged on" context (drone / pilot / mission)
      flightLogId: log?.id ?? null,
      flightDate: log?.flight_date ?? null,
      companyId: log?.company_id ?? null,
      droneId: context?.droneId ?? log?.drone_id ?? null,
      droneName: context?.droneName ?? null,
      droneModelName: context?.droneModelName ?? null,
      pilotProfileId: context?.pilotProfileId ?? log?.user_id ?? null,
      pilotName: context?.pilotName ?? null,
      missionId: context?.missionId ?? log?.mission_id ?? null,
      missionName: context?.missionName ?? null,
    },
  };
}

/** Loads flight events for a log and returns the ready-to-use analysis payload. */
export async function loadFlightAnalysisTrack(log: any) {
  const [{ data: evRows }, context] = await Promise.all([
    supabase
      .from("flight_events" as any)
      .select("t_offset_ms, type, message")
      .eq("flight_log_id", log.id)
      .order("t_offset_ms", { ascending: true }),
    loadFlightLogContext(log).catch(() => ({} as FlightLogContext)),
  ]);
  return buildFlightAnalysisTrack(log, (evRows as any[]) || [], context);
}
