// Shared ArduPilot helpers used by:
//   - process-ardupilot (synchronous debug/fallback path)
//   - ardupilot-enqueue (validation + storage helpers — not used here yet)
//   - ardupilot-sync-worker (queue-driven async parsing)
//
// Wraps the Fly.io ArduPilot parser and normalizes its raw output to the
// unified DroneLogResult shape consumed by pending_dji_logs + the frontend.

export interface ParserCallOptions {
  parserUrl?: string;
  parserSecret?: string;
  timeoutMs?: number;
}

/** Extract the .bin payload from either a raw .bin file or a .zip archive. */
export async function extractBinBytes(
  fileBytes: Uint8Array,
  fileName: string,
): Promise<Uint8Array> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".bin")) return fileBytes;
  if (!lower.endsWith(".zip")) {
    throw new Error("Ugyldig filtype. Bruk .bin eller .zip med .bin-fil.");
  }
  const { default: JSZip } = await import("npm:jszip@3.10.1");
  const zip = await JSZip.loadAsync(fileBytes);
  const binEntry = Object.keys(zip.files).find(
    (n) => n.toLowerCase().endsWith(".bin") && !n.startsWith("__MACOSX"),
  );
  if (!binEntry) throw new Error("Ingen .bin-fil funnet i ZIP-arkivet");
  return await zip.files[binEntry].async("uint8array");
}

/** Call the external Fly.io ArduPilot parser and return raw JSON. */
export async function callArdupilotParser(
  binBytes: Uint8Array,
  opts: ParserCallOptions = {},
): Promise<any> {
  const parserUrl = opts.parserUrl ?? Deno.env.get("ARDUPILOT_PARSER_URL");
  const parserSecret = opts.parserSecret ?? Deno.env.get("ARDUPILOT_PARSER_SECRET");
  if (!parserUrl) {
    throw new Error("ArduPilot parser ikke konfigurert (ARDUPILOT_PARSER_URL mangler).");
  }

  // Buffer the file before constructing FormData (Edge Function constraint).
  const fd = new FormData();
  fd.append("file", new Blob([binBytes as BlobPart]), "flight.bin");

  const headers: Record<string, string> = {};
  if (parserSecret) headers["X-Parser-Secret"] = parserSecret;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 240_000);
  let res: Response;
  try {
    res = await fetch(`${parserUrl}/parse`, {
      method: "POST",
      headers,
      body: fd,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown parser error");
    const err = new Error(`Parser-feil ${res.status}: ${errText.slice(0, 400)}`);
    (err as any).status = res.status;
    throw err;
  }
  return await res.json();
}

/* ────────────────────────────────────────────────────────── */
/*  Normalize raw ArduPilot parser output → DroneLogResult   */
/* ────────────────────────────────────────────────────────── */

export function normalizeToUnified(raw: any) {
  const gps: any[] = raw.gps || [];
  const battery: any[] = raw.battery || [];
  const attitude: any[] = raw.attitude || [];
  const modes: any[] = raw.modes || [];
  const messages: any[] = raw.messages || [];
  const ctun: any[] = raw.ctun || [];
  const vibeData: any[] = raw.vibe || [];
  const errData: any[] = raw.errors || [];
  const evData: any[] = raw.events || [];
  const rcin: any[] = raw.rcin || [];
  const vehicleType: string = raw.vehicle_type || "ArduPilot";
  const firmwareVersion: string | null = raw.firmware_version || null;
  const startUtc: string | null = raw.start_utc || null;
  const endUtc: string | null = raw.end_utc || null;

  const batt0 = battery.filter((b) => (b.instance || 0) === 0);
  const batt1 = battery.filter((b) => (b.instance || 0) === 1);
  const isDualBattery = batt1.length > 0;
  const primaryBatt = batt0.length > 0 ? batt0 : battery;

  // Sample positions (~2500 max)
  const sampleRate = Math.max(1, Math.floor(gps.length / 2500));
  const positions: Array<Record<string, any>> = [];

  for (let i = 0; i < gps.length; i++) {
    if (i % sampleRate !== 0 && i !== gps.length - 1) continue;
    const p = gps[i];
    if (!p.lat || !p.lng || (p.lat === 0 && p.lng === 0)) continue;

    const att = interpolateAttitude(attitude, p.time_ms);
    const battReading = interpolateBattery(primaryBatt, p.time_ms);
    const rc = interpolateRcin(rcin, p.time_ms);

    const pos: Record<string, any> = {
      lat: p.lat,
      lng: p.lng,
      alt: p.alt || 0,
      height: p.alt || 0,
      timestamp: `PT${Math.round(p.time_ms / 1000)}S`,
      speed: p.spd || 0,
      pitch: att?.pitch || 0,
      roll: att?.roll || 0,
      yaw: att?.yaw || 0,
      gpsNum: p.nSat || 0,
    };

    if (battReading) {
      if (battReading.volt != null) pos.voltage = battReading.volt;
      if (battReading.curr != null) pos.current = battReading.curr;
      if (battReading.temp != null) pos.temp = battReading.temp;
      if (battReading.remaining != null && battReading.remaining >= 0 && battReading.remaining <= 100) {
        pos.battery = battReading.remaining;
      }
    }
    if (rc) {
      pos.rcAileron = rc.c1;
      pos.rcElevator = rc.c2;
      pos.rcThrottle = rc.c3;
      pos.rcRudder = rc.c4;
    }
    positions.push(pos);
  }

  const firstTime = gps.length > 0 ? gps[0].time_ms : 0;
  const lastTime = gps.length > 0 ? gps[gps.length - 1].time_ms : 0;
  const durationMs = lastTime - firstTime;
  const durationMinutes = Number.isFinite(durationMs) ? Math.round(durationMs / 60000) : 0;
  const totalTimeSeconds = Number.isFinite(durationMs) ? Math.round(durationMs / 1000) : 0;

  let maxSpeed = 0;
  let maxAltitude = 0;
  let totalDist = 0;
  let maxDist = 0;

  for (let i = 0; i < gps.length; i++) {
    if (gps[i].spd > maxSpeed) maxSpeed = gps[i].spd;
    if (gps[i].alt > maxAltitude) maxAltitude = gps[i].alt;
    if (i > 0 && gps[0].lat && gps[0].lng) {
      const d = haversine(gps[i].lat, gps[i].lng, gps[i - 1].lat, gps[i - 1].lng);
      totalDist += d;
      const fromHome = haversine(gps[i].lat, gps[i].lng, gps[0].lat, gps[0].lng);
      if (fromHome > maxDist) maxDist = fromHome;
    }
  }

  let maxVSpeed = 0;
  for (const c of ctun) {
    const vs = Math.abs(c.crt || 0);
    if (vs > maxVSpeed) maxVSpeed = vs;
  }

  const validBatteryReadings = primaryBatt
    .map((b: any) => b.remaining)
    .filter((r: any): r is number => r != null && r >= 0 && r <= 100);

  // Use -1 sentinel when no valid % readings (e.g. BATT_CAPACITY not configured)
  // so client-side `minBattery >= 0` guard skips false low_battery alerts.
  const minBattery = validBatteryReadings.length > 0 ? Math.min(...validBatteryReadings) : -1;

  let minVoltage = 999;
  let maxCurrent = 0;
  let maxBatteryTemp: number | null = null;
  for (const b of primaryBatt) {
    if (b.volt < minVoltage) minVoltage = b.volt;
    if (b.curr && b.curr > maxCurrent) maxCurrent = b.curr;
    if (b.temp != null) {
      if (maxBatteryTemp === null || b.temp > maxBatteryTemp) maxBatteryTemp = b.temp;
    }
  }

  let batt1MinVoltage: number | null = null;
  let batt1TempMax: number | null = null;
  if (isDualBattery) {
    let v1Min = 999;
    for (const b of batt1) {
      if (b.volt < v1Min) v1Min = b.volt;
      if (b.temp != null) {
        if (batt1TempMax === null || b.temp > batt1TempMax) batt1TempMax = b.temp;
      }
    }
    batt1MinVoltage = v1Min < 999 ? Math.round(v1Min * 100) / 100 : null;
  }

  let minGpsSats = 99;
  let maxGpsSats = 0;
  for (const p of gps) {
    if (p.nSat !== undefined) {
      if (p.nSat < minGpsSats) minGpsSats = p.nSat;
      if (p.nSat > maxGpsSats) maxGpsSats = p.nSat;
    }
  }

  const events: any[] = [];
  let lastMode = "";
  for (const m of modes) {
    if (m.mode === lastMode) continue;
    lastMode = m.mode;
    events.push({
      type: "mode_change",
      message: `Modus: ${m.mode}`,
      t_offset_ms: m.time_ms - firstTime,
      raw_field: "MODE",
      raw_value: m.mode,
    });
  }
  for (const e of errData) {
    events.push({
      type: "error",
      message: `Feil: ${e.subsys_name} (kode ${e.ecode})`,
      t_offset_ms: e.time_ms - firstTime,
      raw_field: "ERR",
      raw_value: `${e.subsys_name}:${e.ecode}`,
    });
  }
  const importantEvIds = new Set([10, 11, 15, 17, 18, 44]);
  for (const e of evData) {
    if (!importantEvIds.has(e.id)) continue;
    events.push({
      type: e.id === 10 || e.id === 15 ? "arm" : e.id === 11 ? "disarm" : "event",
      message: e.name,
      t_offset_ms: e.time_ms - firstTime,
      raw_field: "EV",
      raw_value: e.name,
    });
  }
  const seenMessages = new Set<string>();
  for (const msg of messages) {
    if (seenMessages.has(msg.text)) continue;
    seenMessages.add(msg.text);
    events.push({
      type: "message",
      message: msg.text,
      t_offset_ms: msg.time_ms - firstTime,
      raw_field: "MSG",
      raw_value: msg.text,
    });
  }

  const rthTriggered = modes.some((m: any) =>
    ["rtl", "smartrtl", "smart_rtl", "land", "brake", "auto_rtl"].includes(String(m.mode).toLowerCase()),
  );

  const warnings: any[] = [];
  if (minBattery > 0 && minBattery < 20) {
    warnings.push({ type: "low_battery", message: `Lavt batterinivå: ${minBattery}%`, value: minBattery });
  }
  if (rthTriggered) {
    warnings.push({ type: "rth", message: "RTL/Land modus aktivert under flyging" });
  }
  if (vibeData.length > 0) {
    const maxVibe = Math.max(...vibeData.map((v: any) => Math.max(v.vibe_x, v.vibe_y, v.vibe_z)));
    const totalClips = vibeData.reduce((sum: number, v: any) => sum + v.clip0 + v.clip1 + v.clip2, 0);
    if (maxVibe > 60) warnings.push({ type: "high_vibration", message: `Høy vibrasjon registrert: ${Math.round(maxVibe)} m/s²`, value: Math.round(maxVibe) });
    if (totalClips > 0) warnings.push({ type: "imu_clipping", message: `IMU clipping registrert (${totalClips} hendelser)`, value: totalClips });
  }
  const failsafeErrors = errData.filter((e: any) => e.subsys_name?.startsWith?.("FAILSAFE_"));
  for (const f of failsafeErrors) {
    warnings.push({ type: "failsafe", message: `Failsafe utløst: ${f.subsys_name}` });
  }

  const startPosition = positions.length > 0
    ? { lat: positions[0].lat, lng: positions[0].lng } : null;
  const endPosition = positions.length > 0
    ? { lat: positions[positions.length - 1].lat, lng: positions[positions.length - 1].lng } : null;

  const aircraftName = firmwareVersion || vehicleType;

  return {
    positions,
    durationMinutes,
    durationMs,
    durationSeconds: totalTimeSeconds,
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    minBattery,
    batteryReadings: validBatteryReadings,
    startPosition,
    endPosition,
    totalRows: gps.length,
    sampledPositions: positions.length,
    warnings,
    startTime: startUtc,
    endTimeUtc: endUtc,
    aircraftName,
    aircraftSN: null,
    aircraftSerial: null,
    droneType: null,
    totalDistance: totalDist > 0 ? Math.round(totalDist) : null,
    maxAltitude: maxAltitude > 0 ? Math.round(maxAltitude * 10) / 10 : null,
    detailsMaxSpeed: maxSpeed > 0 ? Math.round(maxSpeed * 10) / 10 : null,
    batteryTemperature: maxBatteryTemp,
    batteryTempMin: null,
    batteryMinVoltage: minVoltage < 999 ? Math.round(minVoltage * 100) / 100 : null,
    batteryCycles: null,
    minGpsSatellites: minGpsSats < 99 ? minGpsSats : null,
    maxGpsSatellites: maxGpsSats > 0 ? maxGpsSats : null,
    batterySN: null,
    batteryHealth: null,
    batteryFullCapacity: null,
    batteryCurrentCapacity: null,
    batteryStatus: null,
    batteryCellDeviationMax: null,
    maxDistance: maxDist > 0 ? Math.round(maxDist) : null,
    maxVSpeed: maxVSpeed > 0 ? Math.round(maxVSpeed * 10) / 10 : null,
    totalTimeSeconds,
    sha256Hash: null,
    guid: null,
    rthTriggered,
    events,
    isDualBattery,
    battery1Cycles: null,
    battery2Cycles: null,
    battery1MinVoltage: minVoltage < 999 ? Math.round(minVoltage * 100) / 100 : null,
    battery2MinVoltage: batt1MinVoltage,
    battery1TempMax: maxBatteryTemp,
    battery2TempMax: batt1TempMax,
    battery1FullCapacity: null,
    battery2FullCapacity: null,
    battery1CellDeviationMax: null,
    battery2CellDeviationMax: null,
    source: "ardupilot",
  };
}

export function sanitizeResult(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) return null;
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(sanitizeResult);
  if (typeof obj === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = sanitizeResult(v);
    return out;
  }
  return obj;
}

function interpolateAttitude(attitude: any[], timeMs: number) {
  if (attitude.length === 0) return null;
  let lo = 0, hi = attitude.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (attitude[mid].time_ms < timeMs) lo = mid + 1; else hi = mid;
  }
  const c = attitude[lo];
  return { pitch: c.pitch, roll: c.roll, yaw: c.yaw };
}

function interpolateBattery(battery: any[], timeMs: number) {
  if (battery.length === 0) return null;
  let lo = 0, hi = battery.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (battery[mid].time_ms < timeMs) lo = mid + 1; else hi = mid;
  }
  return battery[lo];
}

function interpolateRcin(rcin: any[], timeMs: number) {
  if (rcin.length === 0) return null;
  let lo = 0, hi = rcin.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rcin[mid].time_ms < timeMs) lo = mid + 1; else hi = mid;
  }
  return rcin[lo];
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
