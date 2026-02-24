import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DRONELOG_BASE = "https://dronelogapi.com/api/v1";

// Expanded field list including date/time, drone info, battery details, GPS and errors
const FIELDS = [
  "OSD.latitude","OSD.longitude","OSD.altitude [m]","OSD.height [m]",
  "OSD.flyTime [ms]","OSD.hSpeed [m/s]","OSD.gpsNum","OSD.flycState",
  "BATTERY.chargeLevel [%]","BATTERY.temperature [°C]","BATTERY.totalVoltage [V]","BATTERY.current [A]","BATTERY.loopNum",
  "BATTERY.fullCapacity [mAh]","BATTERY.currentCapacity [mAh]","BATTERY.life [%]","BATTERY.status",
  "CUSTOM.dateTime","CUSTOM.date [UTC]","CUSTOM.updateTime [UTC]",
  "DETAILS.startTime","DETAILS.aircraftName","DETAILS.aircraftSN","DETAILS.aircraftSerial","DETAILS.droneType",
  "DETAILS.batterySN","DETAILS.totalTime [s]","DETAILS.totalDistance [m]","DETAILS.maxAltitude [m]","DETAILS.maxHSpeed [m/s]","DETAILS.maxVSpeed [m/s]","DETAILS.maxDistance [m]",
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

  // New indices
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

  console.log("Column indices — lat:", latIdx, "lon:", lonIdx, "alt:", altIdx, "height:", heightIdx,
    "time:", timeIdx, "speed:", speedIdx, "battery:", batteryIdx, "gpsNum:", gpsNumIdx,
    "flycState:", flycStateIdx, "battTemp:", battTempIdx, "dateTime:", dateTimeIdx);

  // Extract DETAILS metadata from first data row
  const firstRow = lines[1].split(",").map((c) => c.trim());
  const startTime = detStartTimeIdx >= 0 ? firstRow[detStartTimeIdx] : "";
  const aircraftName = detAircraftNameIdx >= 0 ? firstRow[detAircraftNameIdx] : "";
  const rawAircraftSN = detAircraftSNIdx >= 0 ? firstRow[detAircraftSNIdx] : "";
  const aircraftSerial = detAircraftSerialIdx >= 0 ? firstRow[detAircraftSerialIdx] : "";
  const aircraftSN = rawAircraftSN || aircraftSerial; // fallback
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

  // CUSTOM date/time UTC
  const customDateUtc = customDateUtcIdx >= 0 ? firstRow[customDateUtcIdx] : "";
  const customTimeUtc = customTimeUtcIdx >= 0 ? firstRow[customTimeUtcIdx] : "";

  // Determine flight start dateTime — prioritized fallback chain
  let flightStartTime = startTime || "";
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
  let minBattery = batteryIdx >= 0 ? 100 : -1; // -1 means no battery data
  let maxFlyTimeMs = 0;
  let maxBattTemp = -999;
  let minBattVolt = 999;
  let minGpsSats = 99;
  const batteryReadings: number[] = [];
  const warnings: Array<{ type: string; message: string; value?: number }> = [];
  const flycStatesSet = new Set<string>();
  const appWarnings = new Set<string>();

  const sampleRate = Math.max(1, Math.floor((lines.length - 1) / 500));

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const lat = latIdx >= 0 ? parseFloat(cols[latIdx]) : NaN;
    const lon = lonIdx >= 0 ? parseFloat(cols[lonIdx]) : NaN;
    const alt = altIdx >= 0 ? parseFloat(cols[altIdx]) : 0;
    const height = heightIdx >= 0 ? parseFloat(cols[heightIdx]) : 0;
    const flyTimeMs = timeIdx >= 0 ? parseFloat(cols[timeIdx]) : NaN;
    const speed = speedIdx >= 0 ? parseFloat(cols[speedIdx]) : NaN;
    const battery = batteryIdx >= 0 ? parseFloat(cols[batteryIdx]) : NaN;

    // New field parsing
    const gpsSats = gpsNumIdx >= 0 ? parseInt(cols[gpsNumIdx]) : NaN;
    const battTemp = battTempIdx >= 0 ? parseFloat(cols[battTempIdx]) : NaN;
    const battVolt = battVoltIdx >= 0 ? parseFloat(cols[battVoltIdx]) : NaN;
    const flycState = flycStateIdx >= 0 ? cols[flycStateIdx] : "";
    const appWarn = appWarnIdx >= 0 ? cols[appWarnIdx] : "";

    if (!isNaN(speed) && speed > maxSpeed) maxSpeed = speed;
    if (!isNaN(battery)) {
      if (battery < minBattery) minBattery = battery;
      batteryReadings.push(battery);
    }
    if (!isNaN(flyTimeMs) && flyTimeMs > maxFlyTimeMs) maxFlyTimeMs = flyTimeMs;
    if (!isNaN(battTemp) && battTemp > maxBattTemp) maxBattTemp = battTemp;
    if (!isNaN(battVolt) && battVolt > 0 && battVolt < minBattVolt) minBattVolt = battVolt;
    if (!isNaN(gpsSats) && gpsSats < minGpsSats) minGpsSats = gpsSats;

    if (flycState && FLYC_WARNING_STATES.has(flycState.toLowerCase())) {
      flycStatesSet.add(flycState);
    }
    if (appWarn && appWarn.length > 0 && appWarn !== "0" && appWarn.toLowerCase() !== "none") {
      appWarnings.add(appWarn);
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

  // ── Generate warnings ──
  if (minBattery < 20) {
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
    // New fields
    startTime: flightStartTime || null,
    aircraftName: aircraftName || null,
    aircraftSN: aircraftSN || null,
    aircraftSerial: aircraftSerial || null,
    droneType: droneType || null,
    totalDistance: !isNaN(totalDistance) ? Math.round(totalDistance) : null,
    maxAltitude: !isNaN(detailsMaxAlt) ? Math.round(detailsMaxAlt * 10) / 10 : null,
    detailsMaxSpeed: !isNaN(detailsMaxSpeed) ? Math.round(detailsMaxSpeed * 10) / 10 : null,
    batteryTemperature: maxBattTemp > -999 ? Math.round(maxBattTemp * 10) / 10 : null,
    batteryMinVoltage: minBattVolt < 999 ? Math.round(minBattVolt * 100) / 100 : null,
    batteryCycles: !isNaN(batteryCycles) ? batteryCycles : null,
    minGpsSatellites: minGpsSats < 99 ? minGpsSats : null,
    // New extended fields
    batterySN: batterySN || null,
    batteryHealth: !isNaN(batteryLife) ? Math.round(batteryLife * 10) / 10 : null,
    batteryFullCapacity: !isNaN(batteryFullCap) ? Math.round(batteryFullCap) : null,
    batteryCurrentCapacity: !isNaN(batteryCurrCap) ? Math.round(batteryCurrCap) : null,
    batteryStatus: batteryStatus || null,
    maxDistance: !isNaN(maxDistance) ? Math.round(maxDistance) : null,
    maxVSpeed: !isNaN(detailsMaxVSpeed) ? Math.round(detailsMaxVSpeed * 10) / 10 : null,
    totalTimeSeconds: !isNaN(detailsTotalTime) ? Math.round(detailsTotalTime) : null,
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

    const dronelogKey = Deno.env.get("DRONELOG_AVISAFE_KEY");
    if (!dronelogKey) {
      return new Response(JSON.stringify({ error: "DroneLog API key not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
          const errMsg = res.status === 500
            ? "DroneLog API serverfeil. Sjekk at DJI-legitimasjonen er korrekt, eller prøv igjen senere."
            : (data.message || "DJI login failed");
          return new Response(JSON.stringify({ error: errMsg, details: data, status: res.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "dji-list-logs") {
        const { accountId, page = 1, limit = 20 } = body;
        if (!accountId) {
          return new Response(JSON.stringify({ error: "accountId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const res = await fetch(`${DRONELOG_BASE}/logs/${accountId}?page=${page}&limit=${limit}`, {
          headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/json" },
        });
        const data = await res.json();
        if (!res.ok) {
          return new Response(JSON.stringify({ error: data.message || "Failed to list logs", details: data }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "dji-process-log") {
        const { url } = body;
        if (!url) {
          return new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const res = await fetch(`${DRONELOG_BASE}/logs`, {
          method: "POST",
          headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ url, fields: FIELDS.split(",") }),
        });
        if (!res.ok) {
          const errText = await res.text();
          return new Response(JSON.stringify({ error: "DroneLog API error", details: errText }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const csvText = await res.text();
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
      console.error("DroneLog API error:", dronelogResponse.status, errText);
      return new Response(JSON.stringify({ error: "DroneLog API error", details: errText, status: dronelogResponse.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const csvText = await dronelogResponse.text();
    const result = parseCsvToResult(csvText);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("process-dronelog error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
