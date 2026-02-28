import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DRONELOG_BASE = "https://dronelogapi.com/api/v1";

// Expanded field list including new fields for dedup, RTH, cell deviation
const FIELDS = [
  "OSD.latitude","OSD.longitude","OSD.altitude [m]","OSD.height [m]",
  "OSD.flyTime [ms]","OSD.hSpeed [m/s]","OSD.gpsNum","OSD.flycState",
  "OSD.goHomeStatus",
  "BATTERY.chargeLevel [%]","BATTERY.temperature [°C]","BATTERY.totalVoltage [V]","BATTERY.current [A]","BATTERY.loopNum",
  "BATTERY.fullCapacity [mAh]","BATTERY.currentCapacity [mAh]","BATTERY.life [%]","BATTERY.status",
  "BATTERY.cellVoltageDeviation [V]","BATTERY.isVoltageLow",
  "BATTERY.goHomeStatus",
  "CUSTOM.dateTime","CUSTOM.date [UTC]","CUSTOM.updateTime [UTC]",
  "DETAILS.startTime","DETAILS.aircraftName","DETAILS.aircraftSN","DETAILS.aircraftSerial","DETAILS.droneType",
  "DETAILS.batterySN","DETAILS.totalTime [s]","DETAILS.totalDistance [m]","DETAILS.maxAltitude [m]","DETAILS.maxHSpeed [m/s]","DETAILS.maxVSpeed [m/s]","DETAILS.maxDistance [m]",
  "DETAILS.sha256Hash","DETAILS.guid",
  "HOME.goHomeStatus",
  "APP.warn",
].join(",");

/**
 * Find a header index using flexible matching.
 */
function findHeaderIndex(headers: string[], target: string): number {
  const exact = headers.indexOf(target);
  if (exact !== -1) return exact;

  const targetLower = target.toLowerCase();
  const ciIdx = headers.findIndex((h) => h.toLowerCase() === targetLower);
  if (ciIdx !== -1) return ciIdx;

  const baseName = target.replace(/\s*\[.*\]$/, "").toLowerCase();
  const partialIdx = headers.findIndex((h) => h.toLowerCase().replace(/\s*\[.*\]$/, "") === baseName);
  if (partialIdx !== -1) return partialIdx;

  const legacyMap: Record<string, string> = {
    "osd.flytimemilliseconds": "osd.flytime",
    "osd.speed": "osd.hspeed",
    "battery.chargelevel": "battery.chargelevel",
  };
  const mapped = legacyMap[targetLower];
  if (mapped) {
    const mappedIdx = headers.findIndex((h) => h.toLowerCase().replace(/\s*\[.*\]$/, "") === mapped);
    if (mappedIdx !== -1) return mappedIdx;
  }

  return -1;
}

// Notable flycState values that indicate issues
const FLYC_WARNING_STATES = new Set([
  "gohome","autolanding","atti","gps_atti","landing","failsafe",
  "gohome_avoid","motor_lock","not_enough_force","low_voltage_landing",
]);

// RTH-related goHomeStatus values
const RTH_ACTIVE_STATES = new Set([
  "goinghome","gohome","autogoinghome","lowbatterygoinghome",
  "rc_disconnect_goinghome","smart_goinghome",
]);

interface FlightEvent {
  type: string;
  message: string;
  t_offset_ms: number | null;
  raw_field: string;
  raw_value: string;
}

function parseCsvToResult(csvText: string) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("Empty or invalid CSV response from DroneLog");
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  console.log("CSV headers received:", JSON.stringify(headers));

  // Core indices
  const latIdx = findHeaderIndex(headers, "OSD.latitude");
  const lonIdx = findHeaderIndex(headers, "OSD.longitude");
  const altIdx = findHeaderIndex(headers, "OSD.altitude [m]");
  const heightIdx = findHeaderIndex(headers, "OSD.height [m]");
  const timeIdx = findHeaderIndex(headers, "OSD.flyTime [ms]");
  const speedIdx = findHeaderIndex(headers, "OSD.hSpeed [m/s]");
  const batteryIdx = findHeaderIndex(headers, "BATTERY.chargeLevel [%]");

  // Extended indices
  const gpsNumIdx = findHeaderIndex(headers, "OSD.gpsNum");
  const flycStateIdx = findHeaderIndex(headers, "OSD.flycState");
  const battTempIdx = findHeaderIndex(headers, "BATTERY.temperature [°C]");
  const battVoltIdx = findHeaderIndex(headers, "BATTERY.totalVoltage [V]");
  const battCurrentIdx = findHeaderIndex(headers, "BATTERY.current [A]");
  const battLoopIdx = findHeaderIndex(headers, "BATTERY.loopNum");
  const dateTimeIdx = findHeaderIndex(headers, "CUSTOM.dateTime");
  const customDateUtcIdx = findHeaderIndex(headers, "CUSTOM.date [UTC]");
  const customTimeUtcIdx = findHeaderIndex(headers, "CUSTOM.updateTime [UTC]");
  const appWarnIdx = findHeaderIndex(headers, "APP.warn");

  // Battery extended
  const battFullCapIdx = findHeaderIndex(headers, "BATTERY.fullCapacity [mAh]");
  const battCurrCapIdx = findHeaderIndex(headers, "BATTERY.currentCapacity [mAh]");
  const battLifeIdx = findHeaderIndex(headers, "BATTERY.life [%]");
  const battStatusIdx = findHeaderIndex(headers, "BATTERY.status");
  const battCellDevIdx = findHeaderIndex(headers, "BATTERY.cellVoltageDeviation [V]");
  const battIsLowIdx = findHeaderIndex(headers, "BATTERY.isVoltageLow");

  // RTH indices
  const osdGoHomeIdx = findHeaderIndex(headers, "OSD.goHomeStatus");
  const homeGoHomeIdx = findHeaderIndex(headers, "HOME.goHomeStatus");
  const battGoHomeIdx = findHeaderIndex(headers, "BATTERY.goHomeStatus");

  // DETAILS indices (metadata – same value every row, read from row 1)
  const detStartTimeIdx = findHeaderIndex(headers, "DETAILS.startTime");
  const detAircraftNameIdx = findHeaderIndex(headers, "DETAILS.aircraftName");
  const detAircraftSNIdx = findHeaderIndex(headers, "DETAILS.aircraftSN");
  const detAircraftSerialIdx = findHeaderIndex(headers, "DETAILS.aircraftSerial");
  const detDroneTypeIdx = findHeaderIndex(headers, "DETAILS.droneType");
  const detBatterySNIdx = findHeaderIndex(headers, "DETAILS.batterySN");
  const detTotalTimeIdx = findHeaderIndex(headers, "DETAILS.totalTime [s]");
  const detTotalDistIdx = findHeaderIndex(headers, "DETAILS.totalDistance [m]");
  const detMaxDistIdx = findHeaderIndex(headers, "DETAILS.maxDistance [m]");
  const detMaxAltIdx = findHeaderIndex(headers, "DETAILS.maxAltitude [m]");
  const detMaxHSpeedIdx = findHeaderIndex(headers, "DETAILS.maxHSpeed [m/s]");
  const detMaxVSpeedIdx = findHeaderIndex(headers, "DETAILS.maxVSpeed [m/s]");
  const detSha256Idx = findHeaderIndex(headers, "DETAILS.sha256Hash");
  const detGuidIdx = findHeaderIndex(headers, "DETAILS.guid");

  console.log("Column indices — lat:", latIdx, "lon:", lonIdx, "alt:", altIdx, "height:", heightIdx,
    "time:", timeIdx, "speed:", speedIdx, "battery:", batteryIdx, "gpsNum:", gpsNumIdx,
    "flycState:", flycStateIdx, "battTemp:", battTempIdx, "dateTime:", dateTimeIdx,
    "sha256:", detSha256Idx, "guid:", detGuidIdx, "osdGoHome:", osdGoHomeIdx);

  // Extract DETAILS metadata from first data row
  const firstRow = lines[1].split(",").map((c) => c.trim());
  const startTime = detStartTimeIdx >= 0 ? firstRow[detStartTimeIdx] : "";
  const aircraftName = detAircraftNameIdx >= 0 ? firstRow[detAircraftNameIdx] : "";
  const rawAircraftSN = detAircraftSNIdx >= 0 ? firstRow[detAircraftSNIdx] : "";
  const aircraftSerial = detAircraftSerialIdx >= 0 ? firstRow[detAircraftSerialIdx] : "";
  const aircraftSN = rawAircraftSN || aircraftSerial;
  const droneType = detDroneTypeIdx >= 0 ? firstRow[detDroneTypeIdx] : "";
  const totalDistance = detTotalDistIdx >= 0 ? parseFloat(firstRow[detTotalDistIdx]) : NaN;
  const maxDistance = detMaxDistIdx >= 0 ? parseFloat(firstRow[detMaxDistIdx]) : NaN;
  const detailsMaxAlt = detMaxAltIdx >= 0 ? parseFloat(firstRow[detMaxAltIdx]) : NaN;
  const detailsMaxSpeed = detMaxHSpeedIdx >= 0 ? parseFloat(firstRow[detMaxHSpeedIdx]) : NaN;
  const detailsMaxVSpeed = detMaxVSpeedIdx >= 0 ? parseFloat(firstRow[detMaxVSpeedIdx]) : NaN;
  const detailsTotalTime = detTotalTimeIdx >= 0 ? parseFloat(firstRow[detTotalTimeIdx]) : NaN;
  const batteryCycles = battLoopIdx >= 0 ? parseInt(firstRow[battLoopIdx]) : NaN;
  const batterySN = detBatterySNIdx >= 0 ? firstRow[detBatterySNIdx] : "";
  const batteryFullCap = battFullCapIdx >= 0 ? parseFloat(firstRow[battFullCapIdx]) : NaN;
  const batteryCurrCap = battCurrCapIdx >= 0 ? parseFloat(firstRow[battCurrCapIdx]) : NaN;
  const batteryLife = battLifeIdx >= 0 ? parseFloat(firstRow[battLifeIdx]) : NaN;
  const batteryStatus = battStatusIdx >= 0 ? firstRow[battStatusIdx] : "";
  const sha256Hash = detSha256Idx >= 0 ? firstRow[detSha256Idx] : "";
  const guid = detGuidIdx >= 0 ? firstRow[detGuidIdx] : "";

  // CUSTOM date/time UTC
  const customDateUtc = customDateUtcIdx >= 0 ? firstRow[customDateUtcIdx] : "";
  const customTimeUtc = customTimeUtcIdx >= 0 ? firstRow[customTimeUtcIdx] : "";

  // Determine flight start dateTime — prioritized fallback chain
  let flightStartTime = startTime || "";

  // Normaliser DETAILS.startTime som kan ha format "5/5/2023T11:36:03.86 AMZ"
  if (flightStartTime) {
    const testParsed = new Date(flightStartTime.replace(/Z$/, '').replace('T', ' '));
    if (isNaN(testParsed.getTime())) {
      const dtMatch = flightStartTime.match(
        /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*T?\s*(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i
      );
      if (dtMatch) {
        const [, month, day, year, hours, mins, secs, , ampm] = dtMatch;
        let h = parseInt(hours);
        if (ampm?.toUpperCase() === 'PM' && h < 12) h += 12;
        if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0;
        flightStartTime = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(h).padStart(2,'0')}:${mins}:${secs}Z`;
        console.log("Normalised startTime:", flightStartTime);
      } else {
        console.log("Could not parse startTime, clearing for fallback:", flightStartTime);
        flightStartTime = "";
      }
    }
  }

  // Fallback 1: CUSTOM.date [UTC] + CUSTOM.updateTime [UTC]
  if (!flightStartTime && customDateUtc) {
    flightStartTime = customTimeUtc
      ? `${customDateUtc}T${customTimeUtc}Z`
      : `${customDateUtc}T00:00:00Z`;
  }
  // Fallback 2: CUSTOM.dateTime
  if (!flightStartTime && dateTimeIdx >= 0 && firstRow[dateTimeIdx]) {
    flightStartTime = firstRow[dateTimeIdx];
  }

  console.log("startTime chain:", { startTime, customDateUtc, customTimeUtc, dateTime: dateTimeIdx >= 0 ? firstRow[dateTimeIdx] : "N/A", resolved: flightStartTime });

  const positions: Array<{ lat: number; lng: number; alt: number; height: number; timestamp: string }> = [];
  let maxSpeed = 0;
  let minBattery = batteryIdx >= 0 ? 100 : -1;
  let maxFlyTimeMs = 0;
  let maxBattTemp = -999;
  let minBattTemp = 999;
  let minBattVolt = 999;
  let maxBattCellDev = 0;
  let minGpsSats = 99;
  let maxGpsSats = 0;
  const batteryReadings: number[] = [];
  const warnings: Array<{ type: string; message: string; value?: number }> = [];
  const flycStatesSet = new Set<string>();
  const appWarnings = new Set<string>();
  const events: FlightEvent[] = [];
  let rthTriggered = false;

  // State tracking for event detection
  let prevAppWarn = "";
  let prevGoHomeStatus = "";
  let prevBattIsLow = "";

  const sampleRate = Math.max(1, Math.floor((lines.length - 1) / 500));

  // Track last timestamp for end_time_utc
  let lastTimestamp = "";

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const lat = latIdx >= 0 ? parseFloat(cols[latIdx]) : NaN;
    const lon = lonIdx >= 0 ? parseFloat(cols[lonIdx]) : NaN;
    const alt = altIdx >= 0 ? parseFloat(cols[altIdx]) : 0;
    const height = heightIdx >= 0 ? parseFloat(cols[heightIdx]) : 0;
    const flyTimeMs = timeIdx >= 0 ? parseFloat(cols[timeIdx]) : NaN;
    const speed = speedIdx >= 0 ? parseFloat(cols[speedIdx]) : NaN;
    const battery = batteryIdx >= 0 ? parseFloat(cols[batteryIdx]) : NaN;

    // Extended field parsing
    const gpsSats = gpsNumIdx >= 0 ? parseInt(cols[gpsNumIdx]) : NaN;
    const battTemp = battTempIdx >= 0 ? parseFloat(cols[battTempIdx]) : NaN;
    const battVolt = battVoltIdx >= 0 ? parseFloat(cols[battVoltIdx]) : NaN;
    const battCellDev = battCellDevIdx >= 0 ? parseFloat(cols[battCellDevIdx]) : NaN;
    const flycState = flycStateIdx >= 0 ? cols[flycStateIdx] : "";
    const appWarn = appWarnIdx >= 0 ? cols[appWarnIdx] : "";
    const battIsLow = battIsLowIdx >= 0 ? cols[battIsLowIdx] : "";

    // RTH status from multiple sources
    const osdGoHome = osdGoHomeIdx >= 0 ? cols[osdGoHomeIdx] : "";
    const homeGoHome = homeGoHomeIdx >= 0 ? cols[homeGoHomeIdx] : "";
    const battGoHome = battGoHomeIdx >= 0 ? cols[battGoHomeIdx] : "";
    const currentGoHome = osdGoHome || homeGoHome || battGoHome;

    // Track last custom timestamp for end_time
    if (customTimeUtcIdx >= 0 && cols[customTimeUtcIdx]) {
      lastTimestamp = cols[customTimeUtcIdx];
    }

    if (!isNaN(speed) && speed > maxSpeed) maxSpeed = speed;
    if (!isNaN(battery)) {
      if (battery < minBattery) minBattery = battery;
      batteryReadings.push(battery);
    }
    if (!isNaN(flyTimeMs) && flyTimeMs > maxFlyTimeMs) maxFlyTimeMs = flyTimeMs;
    if (!isNaN(battTemp)) {
      if (battTemp > maxBattTemp) maxBattTemp = battTemp;
      if (battTemp < minBattTemp) minBattTemp = battTemp;
    }
    if (!isNaN(battVolt) && battVolt > 0 && battVolt < minBattVolt) minBattVolt = battVolt;
    if (!isNaN(battCellDev) && battCellDev > maxBattCellDev) maxBattCellDev = battCellDev;
    if (!isNaN(gpsSats)) {
      if (gpsSats < minGpsSats) minGpsSats = gpsSats;
      if (gpsSats > maxGpsSats) maxGpsSats = gpsSats;
    }

    if (flycState && FLYC_WARNING_STATES.has(flycState.toLowerCase())) {
      flycStatesSet.add(flycState);
    }

    // ── Event detection ──
    const offsetMs = !isNaN(flyTimeMs) ? Math.round(flyTimeMs) : null;

    // APP.warn change
    if (appWarn && appWarn !== "0" && appWarn.toLowerCase() !== "none" && appWarn !== prevAppWarn) {
      appWarnings.add(appWarn);
      events.push({ type: "APP_WARNING", message: appWarn, t_offset_ms: offsetMs, raw_field: "APP.warn", raw_value: appWarn });
    }
    prevAppWarn = appWarn;

    // RTH detection
    if (currentGoHome && currentGoHome.toLowerCase() !== prevGoHomeStatus.toLowerCase()) {
      const lower = currentGoHome.toLowerCase();
      if (RTH_ACTIVE_STATES.has(lower)) {
        rthTriggered = true;
        events.push({ type: "RTH", message: `Return to Home: ${currentGoHome}`, t_offset_ms: offsetMs, raw_field: "goHomeStatus", raw_value: currentGoHome });
      }
    }
    prevGoHomeStatus = currentGoHome;

    // Low battery voltage event
    if (battIsLow && battIsLow.toLowerCase() === "true" && prevBattIsLow.toLowerCase() !== "true") {
      events.push({ type: "LOW_BATTERY", message: "Battery voltage low detected", t_offset_ms: offsetMs, raw_field: "BATTERY.isVoltageLow", raw_value: battIsLow });
    }
    prevBattIsLow = battIsLow;

    // Also detect RTH from flycState
    if (flycState && (flycState.toLowerCase() === "gohome" || flycState.toLowerCase() === "gohome_avoid")) {
      rthTriggered = true;
    }

    if ((i - 1) % sampleRate === 0 && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
      const ts = dateTimeIdx >= 0 && cols[dateTimeIdx] ? cols[dateTimeIdx] :
        (!isNaN(flyTimeMs) ? `PT${Math.round(flyTimeMs / 1000)}S` : `PT${Math.round((i - 1) / 10)}S`);
      positions.push({ lat, lng: lon, alt: isNaN(alt) ? 0 : alt, height: isNaN(height) ? 0 : height, timestamp: ts });
    }
  }

  let durationMinutes = Math.round(maxFlyTimeMs / 60000);
  if (maxFlyTimeMs === 0 && lines.length > 10) {
    const estimatedSeconds = (lines.length - 1) / 10;
    durationMinutes = Math.round(estimatedSeconds / 60);
    console.log("flyTime column empty/missing, estimated duration from row count:", durationMinutes, "min");
  }

  // Compute end_time_utc
  let endTimeUtc: string | null = null;
  if (flightStartTime && durationMinutes > 0) {
    try {
      const startD = new Date(flightStartTime);
      if (!isNaN(startD.getTime())) {
        const endD = new Date(startD.getTime() + (maxFlyTimeMs || durationMinutes * 60000));
        endTimeUtc = endD.toISOString();
      }
    } catch { /* ignore */ }
  }

  // ── Generate warnings ──
  if (minBattery >= 0 && minBattery < 20) {
    warnings.push({ type: "low_battery", message: `Batterinivå gikk ned til ${minBattery}%`, value: minBattery });
  }
  if (maxBattTemp > 50) {
    warnings.push({ type: "high_battery_temp", message: `Batteritemperatur nådde ${maxBattTemp.toFixed(1)}°C`, value: maxBattTemp });
  }
  if (minGpsSats < 6 && minGpsSats >= 0) {
    warnings.push({ type: "low_gps", message: `Lavt antall GPS-satellitter: ${minGpsSats}`, value: minGpsSats });
  }
  if (flycStatesSet.size > 0) {
    warnings.push({ type: "flyc_state", message: `Flygkontrolltilstander: ${Array.from(flycStatesSet).join(", ")}` });
  }
  if (appWarnings.size > 0) {
    const warnList = Array.from(appWarnings).slice(0, 5);
    warnings.push({ type: "app_warning", message: `App-advarsler: ${warnList.join("; ")}` });
  }
  if (maxBattCellDev > 0.3) {
    warnings.push({ type: "cell_deviation", message: `Høy celleavvik: ${maxBattCellDev.toFixed(3)}V`, value: maxBattCellDev });
  }

  for (let i = 1; i < positions.length; i++) {
    const altDiff = Math.abs(positions[i].height - positions[i - 1].height);
    if (altDiff > 50) {
      warnings.push({ type: "altitude_anomaly", message: `Plutselig høydeendring på ${altDiff.toFixed(0)}m registrert`, value: altDiff });
      break;
    }
  }

  const startPos = positions.length > 0 ? positions[0] : null;
  const endPos = positions.length > 0 ? positions[positions.length - 1] : null;

  return {
    positions,
    durationMinutes,
    durationMs: maxFlyTimeMs,
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    minBattery,
    batteryReadings: batteryReadings.length > 100
      ? batteryReadings.filter((_, i) => i % Math.floor(batteryReadings.length / 100) === 0)
      : batteryReadings,
    startPosition: startPos,
    endPosition: endPos,
    totalRows: lines.length - 1,
    sampledPositions: positions.length,
    warnings,
    // Metadata
    startTime: flightStartTime || null,
    endTimeUtc: endTimeUtc,
    aircraftName: aircraftName || null,
    aircraftSN: aircraftSN || null,
    aircraftSerial: aircraftSerial || null,
    droneType: droneType || null,
    totalDistance: !isNaN(totalDistance) ? Math.round(totalDistance) : null,
    maxAltitude: !isNaN(detailsMaxAlt) ? Math.round(detailsMaxAlt * 10) / 10 : null,
    detailsMaxSpeed: !isNaN(detailsMaxSpeed) ? Math.round(detailsMaxSpeed * 10) / 10 : null,
    batteryTemperature: maxBattTemp > -999 ? Math.round(maxBattTemp * 10) / 10 : null,
    batteryTempMin: minBattTemp < 999 ? Math.round(minBattTemp * 10) / 10 : null,
    batteryMinVoltage: minBattVolt < 999 ? Math.round(minBattVolt * 100) / 100 : null,
    batteryCycles: !isNaN(batteryCycles) ? batteryCycles : null,
    minGpsSatellites: minGpsSats < 99 ? minGpsSats : null,
    maxGpsSatellites: maxGpsSats > 0 ? maxGpsSats : null,
    // Battery extended
    batterySN: batterySN || null,
    batteryHealth: !isNaN(batteryLife) ? Math.round(batteryLife * 10) / 10 : null,
    batteryFullCapacity: !isNaN(batteryFullCap) ? Math.round(batteryFullCap) : null,
    batteryCurrentCapacity: !isNaN(batteryCurrCap) ? Math.round(batteryCurrCap) : null,
    batteryStatus: batteryStatus || null,
    batteryCellDeviationMax: maxBattCellDev > 0 ? Math.round(maxBattCellDev * 1000) / 1000 : null,
    maxDistance: !isNaN(maxDistance) ? Math.round(maxDistance) : null,
    maxVSpeed: !isNaN(detailsMaxVSpeed) ? Math.round(detailsMaxVSpeed * 10) / 10 : null,
    totalTimeSeconds: !isNaN(detailsTotalTime) ? Math.round(detailsTotalTime) : null,
    // New dedup & event fields
    sha256Hash: sha256Hash || null,
    guid: guid || null,
    rthTriggered,
    events,
  };
}

// ── HTTP handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check
  if (req.method === "GET") {
    try {
      const dronelogKey = Deno.env.get("DRONELOG_AVISAFE_KEY");
      if (!dronelogKey) {
        return new Response(JSON.stringify({ ok: false, error: "DRONELOG_AVISAFE_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const res = await fetch(`${DRONELOG_BASE}/fields`, {
        headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
      });
      const body = await res.text();
      if (!res.ok) {
        return new Response(JSON.stringify({ ok: false, status: res.status, error: body.substring(0, 500) }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      let data;
      try { data = JSON.parse(body); } catch { data = body.substring(0, 500); }
      return new Response(JSON.stringify({ ok: true, fields: typeof data === "object" && data.result ? data.result : data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const globalKey = Deno.env.get("DRONELOG_AVISAFE_KEY");

    // Look up per-company key
    let dronelogKey = globalKey;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", authUser.id)
        .single();

      if (profile?.company_id) {
        const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: company } = await serviceClient
          .from("companies")
          .select("dronelog_api_key")
          .eq("id", profile.company_id)
          .single();

        if (company?.dronelog_api_key) {
          dronelogKey = company.dronelog_api_key;
          console.log("Using per-company DroneLog key for company:", profile.company_id);
        }
      }
    } catch (err) {
      console.log("Could not look up company key, using global:", err);
    }

    if (!dronelogKey) {
      return new Response(JSON.stringify({ error: "DroneLog API key not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const keyFingerprint = dronelogKey.substring(0, 6) + "…";
    console.log(`[process-dronelog] key=${keyFingerprint}`);

    const contentType = req.headers.get("content-type") || "";

    // ── JSON actions (DJI login, list logs, process log) ──
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { action } = body;

      if (action === "dji-login") {
        const { email, password } = body;
        if (!email || !password) {
          return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const res = await fetch(`${DRONELOG_BASE}/accounts/dji`, {
          method: "POST",
          headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({ message: "Invalid response from DroneLog" }));
        if (!res.ok) {
          console.error(`[process-dronelog] dji-login key=${keyFingerprint} upstream=${res.status}`);
          const retryAfter = res.headers.get("Retry-After") || null;
          if (res.status === 429) {
            return new Response(JSON.stringify({ error: "Too many requests", details: data, upstreamStatus: 429, retryAfter, remaining: data?.remaining ?? null }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          if (res.status === 401 || res.status === 403) {
            return new Response(JSON.stringify({ error: "Ugyldig eller utløpt API-nøkkel", details: data, upstreamStatus: res.status }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const errMsg = res.status === 500
            ? "DroneLog API serverfeil. Sjekk at DJI-legitimasjonen er korrekt, eller prøv igjen senere."
            : (data.message || "DJI login failed");
          return new Response(JSON.stringify({ error: errMsg, details: data, upstreamStatus: res.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "dji-list-logs") {
        const { accountId, limit = 20, createdAfterId } = body;
        if (!accountId) {
          return new Response(JSON.stringify({ error: "accountId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        let qs = `limit=${limit}`;
        if (createdAfterId) qs += `&createdAfterId=${createdAfterId}`;
        const res = await fetch(`${DRONELOG_BASE}/logs/${accountId}?${qs}`, {
          headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/json" },
        });
        const data = await res.json();
        console.log(`[process-dronelog] dji-list-logs key=${keyFingerprint} upstream=${res.status}`);
        if (!res.ok) {
          if (res.status === 429) {
            const retryAfter = res.headers.get("Retry-After") || null;
            return new Response(JSON.stringify({ error: "Too many requests", details: data, upstreamStatus: 429, retryAfter, remaining: data?.remaining ?? null }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ error: data.message || "Failed to list logs", details: data, upstreamStatus: res.status }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "dji-process-log") {
        const { accountId, logId, downloadUrl } = body;
        if (!accountId || !logId) {
          return new Response(JSON.stringify({ error: "accountId and logId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const fieldList = FIELDS.split(",").map(f => f.trim());
        let csvText: string | null = null;

        // Helper: handle 429/500 responses uniformly
        const handleUpstreamError = (res: Response, errText: string, context: string) => {
          console.error(`[process-dronelog] ${context} failed: ${res.status} ${errText.slice(0, 300)}`);
          if (res.status === 429) {
            const retryAfter = res.headers.get("Retry-After") || null;
            return new Response(JSON.stringify({ error: "Too many requests", upstreamStatus: 429, retryAfter, remaining: null }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ error: `DroneLog API error (${context})`, details: errText.slice(0, 500), upstreamStatus: res.status, isUpstream500: res.status === 500 }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        };

        // Helper: upload raw bytes via multipart /logs/upload
        const uploadRawBytes = async (fileBytes: Uint8Array, ext: string): Promise<Response | string> => {
          const fileName = `dji_${logId}${ext}`;
          const boundary = "----DronLogBoundary" + Date.now();
          const parts: string[] = [];
          for (const field of fieldList) {
            parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="fields[]"\r\n\r\n${field}\r\n`);
          }
          parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
          const enc = new TextEncoder();
          const prefixBytes = enc.encode(parts.join(""));
          const suffixBytes = enc.encode(`\r\n--${boundary}--\r\n`);
          const uploadBody = new Uint8Array(prefixBytes.length + fileBytes.length + suffixBytes.length);
          uploadBody.set(prefixBytes, 0);
          uploadBody.set(fileBytes, prefixBytes.length);
          uploadBody.set(suffixBytes, prefixBytes.length + fileBytes.length);
          console.log(`[process-dronelog] uploading ${fileName} (${fileBytes.length} bytes) via /logs/upload`);
          const uploadRes = await fetch(`${DRONELOG_BASE}/logs/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": `multipart/form-data; boundary=${boundary}`, Accept: "application/json" },
            body: uploadBody,
          });
          if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            return handleUpstreamError(uploadRes, errText, "upload");
          }
          return await uploadRes.text();
        };

        // ── Download file from DJI Cloud, then upload via /logs/upload ──
        const logUrl = downloadUrl || `${DRONELOG_BASE}/logs/${accountId}/${logId}/download`;
        console.log(`[process-dronelog] downloading file from ${logUrl.slice(0, 120)}`);

        const fileRes = await fetch(logUrl, {
          headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/octet-stream" },
          redirect: "follow",
        });

        if (!fileRes.ok) {
          const dlErr = await fileRes.text();
          console.error(`[process-dronelog] download failed: ${fileRes.status} ${dlErr.slice(0, 300)}`);
          return handleUpstreamError(fileRes, dlErr, "download");
        }

        const buffer = await fileRes.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B;
        const ext = isZip ? ".zip" : ".txt";
        console.log(`[process-dronelog] downloaded ${bytes.length} bytes (${ext}), uploading via /logs/upload`);

        const uploadResult = await uploadRawBytes(bytes, ext);
        if (uploadResult instanceof Response) {
          return uploadResult; // error response
        }
        csvText = uploadResult;

        if (!csvText) {
          return new Response(JSON.stringify({ error: "Could not retrieve or process DJI log" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        console.log(`[process-dronelog] CSV response length: ${csvText.length}`);
        const result = parseCsvToResult(csvText);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── File upload ──
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const fileName = file.name || "flight.txt";
    const boundary = "----DronLogBoundary" + Date.now();
    const fieldList = FIELDS.split(",").map(f => f.trim());

    const parts: string[] = [];
    for (const field of fieldList) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="fields[]"\r\n\r\n${field}\r\n`);
    }
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`);

    const textEncoder = new TextEncoder();
    const prefixBytes = textEncoder.encode(parts.join(""));
    const suffixBytes = textEncoder.encode(`\r\n--${boundary}--\r\n`);

    const uploadBody = new Uint8Array(prefixBytes.length + fileBytes.length + suffixBytes.length);
    uploadBody.set(prefixBytes, 0);
    uploadBody.set(fileBytes, prefixBytes.length);
    uploadBody.set(suffixBytes, prefixBytes.length + fileBytes.length);

    console.log("Upload: manual multipart, fields:", fieldList.length, "file:", fileName, "size:", fileBytes.length);

    const dronelogResponse = await fetch(`${DRONELOG_BASE}/logs/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dronelogKey}`,
        Accept: "application/json",
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: uploadBody,
    });

    if (!dronelogResponse.ok) {
      const errText = await dronelogResponse.text();
      console.error(`[process-dronelog] file-upload key=${keyFingerprint} upstream=${dronelogResponse.status}`);
      if (dronelogResponse.status === 429) {
        const retryAfter = dronelogResponse.headers.get("Retry-After") || null;
        return new Response(JSON.stringify({ error: "Too many requests", upstreamStatus: 429, retryAfter }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "DroneLog API error", details: errText, upstreamStatus: dronelogResponse.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const csvText = await dronelogResponse.text();
    const result = parseCsvToResult(csvText);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("process-dronelog error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
