// Shared DJI log parsing + matching helpers.
// Used by dji-sync-enqueue and dji-sync-worker.

import JSZip from "npm:jszip@3.10.1";

export const DRONELOG_BASE = "https://dronelogapi.com/api/v1";

export const FIELDS = [
  "OSD.latitude","OSD.longitude","OSD.altitude [m]","OSD.height [m]",
  "OSD.flyTime [ms]","OSD.hSpeed [m/s]","OSD.gpsNum","OSD.flycState",
  "OSD.goHomeStatus",
  "OSD.vSpeed [m/s]","OSD.pitch [°]","OSD.roll [°]","OSD.directionYaw [°]",
  "OSD.xSpeed [m/s]","OSD.ySpeed [m/s]","OSD.groundOrSky","OSD.gpsLevel",
  "OSD.isMotorUp","OSD.flycCommand","OSD.isGPSUsed","OSD.isVisionUsed",
  "BATTERY.chargeLevel [%]","BATTERY.temperature [°C]","BATTERY.totalVoltage [V]","BATTERY.current [A]","BATTERY.loopNum",
  "BATTERY.fullCapacity [mAh]","BATTERY.currentCapacity [mAh]","BATTERY.life [%]","BATTERY.status",
  "BATTERY.cellVoltage1 [V]","BATTERY.cellVoltage2 [V]","BATTERY.cellVoltage3 [V]",
  "BATTERY.cellVoltage4 [V]","BATTERY.cellVoltage5 [V]","BATTERY.cellVoltage6 [V]",
  "BATTERY.cellVoltageDeviation [V]","BATTERY.isCellVoltageDeviationHigh","BATTERY.maxCellVoltageDeviation [V]",
  "BATTERY.goHomeStatus",
  "RC.aileron","RC.elevator","RC.rudder","RC.throttle",
  "GIMBAL.pitch [°]","GIMBAL.roll [°]","GIMBAL.yaw [°]",
  "CALC.distance2D [m]","CALC.distance3D [m]","CALC.currentElevation [m]",
  "HOME.latitude","HOME.longitude","HOME.maxAllowedHeight [m]","HOME.goHomeStatus",
  "WEATHER.temperature [°C]","WEATHER.windDirection [°]","WEATHER.windSpeed [m/s]",
  "CUSTOM.dateTime","CUSTOM.date [UTC]","CUSTOM.updateTime [UTC]",
  "DETAILS.startTime","DETAILS.aircraftName","DETAILS.aircraftSN","DETAILS.aircraftSerial","DETAILS.droneType",
  "DETAILS.batterySN","DETAILS.batterySerial","DETAILS.totalTime [s]","DETAILS.totalDistance [m]","DETAILS.maxAltitude [m]","DETAILS.maxHSpeed [m/s]","DETAILS.maxVSpeed [m/s]","DETAILS.maxDistance [m]",
  "DETAILS.sha256Hash","DETAILS.guid",
  // Hardware identifiers (collected for future drone identification — not used for matching yet)
  "DETAILS.fcSN","DETAILS.rcSN","DETAILS.cameraSN","DETAILS.gimbalSN","SERIAL.aircraftSN","SERIAL.battery","SERIAL.battery2",
  "APP.warn",
].join(",");

// Hard timeouts (ms) — keep these conservative.
export const TIMEOUTS = {
  login: 12_000,
  list: 15_000,
  download: 20_000,
  upload: 30_000,
};

export function withTimeout(ms: number, signal?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error(`timeout after ${ms}ms`)), ms);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(signal.reason));
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

export function normalizeDateToISO(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && /^\d{4}-\d{2}/.test(s)) return iso.toISOString();
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[\sT]+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i,
  );
  if (m) {
    const [, month, day, year, hours, mins, secs, , ampm] = m;
    let h = parseInt(hours);
    if (ampm?.toUpperCase() === "PM" && h < 12) h += 12;
    if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
    const d = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), h, parseInt(mins), parseInt(secs)));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback.toISOString();
  return null;
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

const stripQuotes = (v: string) => (v ?? "").replace(/^"+|"+$/g, "").trim();

function findHeaderIndex(headers: string[], target: string): number {
  const exact = headers.indexOf(target);
  if (exact !== -1) return exact;
  const ciIdx = headers.findIndex((h) => h.toLowerCase() === target.toLowerCase());
  if (ciIdx !== -1) return ciIdx;
  const baseName = target.replace(/\s*\[.*\]$/, "").toLowerCase();
  return headers.findIndex((h) => h.toLowerCase().replace(/\s*\[.*\]$/, "") === baseName);
}

/**
 * Picks the most complete battery serial. `SERIAL.battery` is the newer field and
 * often carries the full 20-char SN, while `DETAILS.batterySerial`/`batterySN` is
 * the older, sometimes truncated 16-char variant. Never downgrade to a shorter SN.
 */
export function pickBatterySn(serialField: string, detailsField: string): string {
  const a = (serialField || "").trim();
  const b = (detailsField || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a.length >= b.length) return a;
  return b;
}

export function parseCsvMinimal(csvText: string) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("Empty CSV");
  const headers = parseCsvRow(lines[0]);
  const firstRow = parseCsvRow(lines[1]);
  const get = (field: string) => {
    const idx = findHeaderIndex(headers, field);
    return idx >= 0 ? stripQuotes(firstRow[idx] ?? "") : "";
  };
  const getNum = (field: string) => {
    const v = parseFloat(get(field));
    return isNaN(v) ? null : v;
  };
  const aircraftSN = get("DETAILS.aircraftSN") || get("DETAILS.aircraftSerial");
  const batterySN = pickBatterySn(get("SERIAL.battery"), get("DETAILS.batterySN") || get("DETAILS.batterySerial"));
  const battery2SN = get("SERIAL.battery2").trim() || null;
  const sha256Hash = get("DETAILS.sha256Hash");
  const totalTimeSec = getNum("DETAILS.totalTime [s]");
  const durationMinutes = totalTimeSec ? Math.round(totalTimeSec / 60) : Math.round((lines.length - 1) / 600);
  let startTime = normalizeDateToISO(get("DETAILS.startTime"));
  if (!startTime) {
    const customDate = get("CUSTOM.date [UTC]");
    const customTime = get("CUSTOM.updateTime [UTC]");
    if (customDate) {
      const combined = customTime ? `${customDate} ${customTime}` : `${customDate} 00:00:00`;
      startTime = normalizeDateToISO(combined);
    }
  }
  if (!startTime) startTime = normalizeDateToISO(get("CUSTOM.dateTime"));

  const positions: Array<Record<string, any>> = [];
  const idx = (n: string) => findHeaderIndex(headers, n);
  const latIdx = idx("OSD.latitude"), lonIdx = idx("OSD.longitude"),
    altIdx = idx("OSD.altitude [m]"), heightIdx = idx("OSD.height [m]"),
    timeIdx = idx("OSD.flyTime [ms]"), speedIdx = idx("OSD.hSpeed [m/s]"),
    batteryIdx = idx("BATTERY.chargeLevel [%]"), dateTimeIdx = idx("CUSTOM.dateTime"),
    vSpeedIdx = idx("OSD.vSpeed [m/s]"), pitchIdx = idx("OSD.pitch [°]"),
    rollIdx = idx("OSD.roll [°]"), yawIdx = idx("OSD.directionYaw [°]"),
    groundOrSkyIdx = idx("OSD.groundOrSky"), gpsLevelIdx = idx("OSD.gpsLevel"),
    gpsNumIdx = idx("OSD.gpsNum"), flycStateIdx = idx("OSD.flycState"),
    battVoltIdx = idx("BATTERY.totalVoltage [V]"), battCurrentIdx = idx("BATTERY.current [A]"),
    battTempIdx = idx("BATTERY.temperature [°C]"),
    rcAileronIdx = idx("RC.aileron"), rcElevatorIdx = idx("RC.elevator"),
    rcRudderIdx = idx("RC.rudder"), rcThrottleIdx = idx("RC.throttle"),
    gimbalPitchIdx = idx("GIMBAL.pitch [°]"), gimbalRollIdx = idx("GIMBAL.roll [°]"),
    gimbalYawIdx = idx("GIMBAL.yaw [°]"),
    dist2DIdx = idx("CALC.distance2D [m]"), dist3DIdx = idx("CALC.distance3D [m]"),
    elevationIdx = idx("CALC.currentElevation [m]"),
    weatherWindSpeedIdx = idx("WEATHER.windSpeed [m/s]"),
    weatherWindDirIdx = idx("WEATHER.windDirection [°]");

  let maxSpeed = 0;
  let minBattery = batteryIdx >= 0 ? 100 : -1;
  let maxFlyTimeMs = 0;
  const sampleRate = Math.max(1, Math.floor((lines.length - 1) / 500));

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const lat = latIdx >= 0 ? parseFloat(cols[latIdx]) : NaN;
    const lon = lonIdx >= 0 ? parseFloat(cols[lonIdx]) : NaN;
    const alt = altIdx >= 0 ? parseFloat(cols[altIdx]) : 0;
    const height = heightIdx >= 0 ? parseFloat(cols[heightIdx]) : 0;
    const flyTimeMs = timeIdx >= 0 ? parseFloat(cols[timeIdx]) : NaN;
    const speed = speedIdx >= 0 ? parseFloat(cols[speedIdx]) : NaN;
    const battery = batteryIdx >= 0 ? parseFloat(cols[batteryIdx]) : NaN;

    if (!isNaN(speed) && speed > maxSpeed) maxSpeed = speed;
    if (!isNaN(battery) && battery < minBattery) minBattery = battery;
    if (!isNaN(flyTimeMs) && flyTimeMs > maxFlyTimeMs) maxFlyTimeMs = flyTimeMs;

    if ((i - 1) % sampleRate === 0 && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
      const ts = dateTimeIdx >= 0 && cols[dateTimeIdx] ? cols[dateTimeIdx]
        : (!isNaN(flyTimeMs) ? `PT${Math.round(flyTimeMs / 1000)}S` : `PT${Math.round((i - 1) / 10)}S`);
      const point: Record<string, any> = { lat, lng: lon, alt: isNaN(alt) ? 0 : alt, height: isNaN(height) ? 0 : height, timestamp: ts };
      const pf = (j: number) => { const v = j >= 0 ? parseFloat(cols[j]) : NaN; return isNaN(v) ? undefined : Math.round(v * 100) / 100; };
      const pi = (j: number) => { const v = j >= 0 ? parseInt(cols[j]) : NaN; return isNaN(v) ? undefined : v; };
      const ps = (j: number) => j >= 0 && cols[j] ? cols[j] : undefined;
      if (pf(speedIdx) !== undefined) point.speed = pf(speedIdx);
      if (pf(vSpeedIdx) !== undefined) point.vSpeed = pf(vSpeedIdx);
      if (pf(batteryIdx) !== undefined) point.battery = pf(batteryIdx);
      if (pf(battVoltIdx) !== undefined) point.voltage = pf(battVoltIdx);
      if (pf(battCurrentIdx) !== undefined) point.current = pf(battCurrentIdx);
      if (pf(battTempIdx) !== undefined) point.temp = pf(battTempIdx);
      if (pi(gpsNumIdx) !== undefined) point.gpsNum = pi(gpsNumIdx);
      if (pi(gpsLevelIdx) !== undefined) point.gpsLevel = pi(gpsLevelIdx);
      if (pf(pitchIdx) !== undefined) point.pitch = pf(pitchIdx);
      if (pf(rollIdx) !== undefined) point.roll = pf(rollIdx);
      if (pf(yawIdx) !== undefined) point.yaw = pf(yawIdx);
      if (pi(rcAileronIdx) !== undefined) point.rcAileron = pi(rcAileronIdx);
      if (pi(rcElevatorIdx) !== undefined) point.rcElevator = pi(rcElevatorIdx);
      if (pi(rcRudderIdx) !== undefined) point.rcRudder = pi(rcRudderIdx);
      if (pi(rcThrottleIdx) !== undefined) point.rcThrottle = pi(rcThrottleIdx);
      if (pf(gimbalPitchIdx) !== undefined) point.gimbalPitch = pf(gimbalPitchIdx);
      if (pf(gimbalRollIdx) !== undefined) point.gimbalRoll = pf(gimbalRollIdx);
      if (pf(gimbalYawIdx) !== undefined) point.gimbalYaw = pf(gimbalYawIdx);
      if (pf(dist2DIdx) !== undefined) point.dist2D = pf(dist2DIdx);
      if (pf(dist3DIdx) !== undefined) point.dist3D = pf(dist3DIdx);
      if (pf(elevationIdx) !== undefined) point.elevation = pf(elevationIdx);
      if (ps(flycStateIdx)) point.flycState = ps(flycStateIdx);
      if (ps(groundOrSkyIdx)) point.groundOrSky = ps(groundOrSkyIdx);
      if (pf(weatherWindSpeedIdx) !== undefined) point.windSpeed = pf(weatherWindSpeedIdx);
      if (pf(weatherWindDirIdx) !== undefined) point.windDir = pf(weatherWindDirIdx);
      positions.push(point);
    }
  }

  const startPos = positions.length > 0 ? positions[0] : null;
  const endPos = positions.length > 0 ? positions[positions.length - 1] : null;

  return {
    aircraftSN, batterySN, battery2SN, sha256Hash,
    // Hardware identifiers (informational only — no matching logic uses these yet)
    fcSN: get("DETAILS.fcSN") || null,
    rcSN: get("DETAILS.rcSN") || null,
    cameraSN: get("DETAILS.cameraSN") || null,
    gimbalSN: get("DETAILS.gimbalSN") || null,
    serialAircraftSN: get("SERIAL.aircraftSN") || null,
    durationMinutes,
    durationSeconds: totalTimeSec ?? durationMinutes * 60,
    startTime: startTime || null,
    aircraftName: get("DETAILS.aircraftName") || null,
    droneType: get("DETAILS.droneType") || null,
    totalDistance: getNum("DETAILS.totalDistance [m]"),
    maxAltitude: getNum("DETAILS.maxAltitude [m]"),
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    minBattery,
    maxDistance: getNum("DETAILS.maxDistance [m]"),
    startPosition: startPos,
    endPosition: endPos,
    positions,
    totalRows: lines.length - 1,
  };
}

export async function uploadAndParse(
  dronelogKey: string, fileBytes: Uint8Array, ext: string, logId: string,
): Promise<ReturnType<typeof parseCsvMinimal>> {
  const fieldList = FIELDS.split(",").map((f) => f.trim());
  const fileName = `dji_${logId}${ext}`;
  const boundary = "----DronLogBoundary" + Date.now();
  const parts: string[] = [];
  for (const field of fieldList) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="fields[]"\r\n\r\n${field}\r\n`);
  }
  const fileMime = ext === ".zip" ? "application/zip" : ext === ".txt" ? "text/plain" : "application/octet-stream";
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${fileMime}\r\n\r\n`);
  const enc = new TextEncoder();
  const prefixBytes = enc.encode(parts.join(""));
  const suffixBytes = enc.encode(`\r\n--${boundary}--\r\n`);
  const uploadBody = new Uint8Array(prefixBytes.length + fileBytes.length + suffixBytes.length);
  uploadBody.set(prefixBytes, 0);
  uploadBody.set(fileBytes, prefixBytes.length);
  uploadBody.set(suffixBytes, prefixBytes.length + fileBytes.length);

  const t = withTimeout(TIMEOUTS.upload);
  let uploadRes: Response;
  try {
    uploadRes = await fetch(`${DRONELOG_BASE}/logs/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": `multipart/form-data; boundary=${boundary}`, Accept: "application/json" },
      body: uploadBody,
      signal: t.signal,
    });
  } finally { t.clear(); }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    if (ext === ".zip" && uploadRes.status === 500) {
      const zip = await JSZip.loadAsync(fileBytes);
      const txtEntry = Object.values(zip.files).find((f: any) => !f.dir && f.name.toLowerCase().endsWith(".txt"));
      if (txtEntry) {
        const txtBytes = await (txtEntry as any).async("uint8array");
        try {
          return await uploadAndParse(dronelogKey, txtBytes, ".txt", logId);
        } catch {
          const freshZip = new JSZip();
          freshZip.file((txtEntry as any).name.split("/").pop() || `dji_${logId}.txt`, txtBytes);
          const zipBytes = await freshZip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
          return uploadAndParse(dronelogKey, zipBytes, ".zip", logId);
        }
      }
    }
    throw new Error(`DroneLog upload failed (${uploadRes.status}): ${errText.slice(0, 300)}`);
  }
  const csvText = await uploadRes.text();
  return parseCsvMinimal(csvText);
}

export async function downloadLogBytes(
  dronelogKey: string, fileUrl: string,
): Promise<Uint8Array> {
  const t = withTimeout(TIMEOUTS.download);
  let dl: Response;
  try {
    dl = await fetch(fileUrl, { headers: { Authorization: `Bearer ${dronelogKey}` }, signal: t.signal });
  } finally { t.clear(); }
  if (!dl.ok) {
    const errText = await dl.text().catch(() => "");
    const err: any = new Error(`DJI Cloud download failed (${dl.status}): ${errText.slice(0, 300)}`);
    err.status = dl.status;
    throw err;
  }
  return new Uint8Array(await dl.arrayBuffer());
}

export async function decryptPassword(encryptedB64: string): Promise<string> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const raw = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(serviceKey.slice(0, 32)), "AES-GCM", false, ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, ciphertext);
  return new TextDecoder().decode(decrypted);
}

function snMatches(stored: string | null | undefined, parsed: string): boolean {
  if (!stored) return false;
  const s = stored.toLowerCase().trim();
  const p = parsed.toLowerCase().trim();
  if (!s || !p) return false;
  if (s === p) return true;
  if (s.length >= 12 && p.startsWith(s)) return true;
  if (p.length >= 12 && s.startsWith(p)) return true;
  return false;
}

async function getSearchCompanyIds(serviceClient: any, companyId: string): Promise<string[]> {
  const ids = new Set<string>([companyId]);
  const { data: own } = await serviceClient
    .from("companies").select("parent_company_id").eq("id", companyId).maybeSingle();
  if (own?.parent_company_id) ids.add(own.parent_company_id);
  return Array.from(ids);
}

/** True when the drone's stored name (DJI Fly nickname) appears in the log's aircraft name. */
function djiNameMatches(storedName: string | null | undefined, logName: string | null | undefined): boolean {
  const st = (storedName || "").trim().toLowerCase();
  const lg = (logName || "").trim().toLowerCase();
  if (!st || !lg || st.length < 2) return false;
  if (st === lg) return true;
  const escaped = st.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`).test(lg);
}

export async function matchDroneAndBattery(
  serviceClient: any, companyId: string, parsed: ReturnType<typeof parseCsvMinimal>,
) {
  let matchedDroneId: string | null = null;
  let matchedBatteryId: string | null = null;
  let snMismatchSuggestion: any = null;
  const searchIds = await getSearchCompanyIds(serviceClient, companyId);

  if (parsed.aircraftSN) {
    const { data: drones } = await serviceClient
      .from("drones").select("id, serienummer, internal_serial, dji_aircraft_name, company_id").in("company_id", searchIds);
    if (drones) {
      const snCandidates = drones.filter((d: any) =>
        snMatches(d.serienummer, parsed.aircraftSN!) || snMatches(d.internal_serial, parsed.aircraftSN!));
      const logName = (parsed as any).aircraftName as string | null | undefined;
      // Several drones can share a truncated 16-char DJI SN — the drone name (from DJI Fly)
      // breaks the tie when it is stored on the drone card.
      const nameCandidates = logName
        ? snCandidates.filter((d: any) => djiNameMatches(d.dji_aircraft_name, logName))
        : [];
      const pool = nameCandidates.length > 0 ? nameCandidates : snCandidates;
      const ownMatch = pool.find((d: any) => d.company_id === companyId);
      const anyMatch = ownMatch || pool[0];
      if (anyMatch) {
        // Auto-learn: store the log's aircraft name when the SN match is unambiguous.
        if (logName && snCandidates.length === 1 && !((anyMatch.dji_aircraft_name || "").trim())) {
          await serviceClient.from("drones").update({ dji_aircraft_name: logName }).eq("id", anyMatch.id);
        }
        matchedDroneId = anyMatch.id;
        const storedSn = (anyMatch.serienummer || "").trim();
        const parsedSn = parsed.aircraftSN.trim();
        if (storedSn && parsedSn && storedSn !== parsedSn) {
          snMismatchSuggestion = { drone_id: anyMatch.id, current_sn: storedSn, suggested_sn: parsedSn, type: "drone" };
        }
      }
    }
  }
  if (parsed.batterySN) {
    const { data: batteries } = await serviceClient
      .from("equipment").select("id, serienummer, internal_serial, company_id")
      .in("company_id", searchIds).ilike("type", "batteri");
    if (batteries) {
      const ownMatch = batteries.find((b: any) =>
        b.company_id === companyId &&
        (snMatches(b.serienummer, parsed.batterySN!) || snMatches(b.internal_serial, parsed.batterySN!)));
      const anyMatch = ownMatch || batteries.find((b: any) =>
        snMatches(b.serienummer, parsed.batterySN!) || snMatches(b.internal_serial, parsed.batterySN!));
      if (anyMatch) matchedBatteryId = anyMatch.id;
    }
  }
  return { matchedDroneId, matchedBatteryId, snMismatchSuggestion };
}
