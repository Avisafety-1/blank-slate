import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DRONELOG_BASE = "https://dronelogapi.com/api/v1";

const FIELDS = [
  "OSD.latitude","OSD.longitude","OSD.altitude [m]","OSD.height [m]",
  "OSD.flyTime [ms]","OSD.hSpeed [m/s]","OSD.gpsNum","OSD.flycState",
  "OSD.goHomeStatus",
  "BATTERY.chargeLevel [%]","BATTERY.temperature [°C]","BATTERY.totalVoltage [V]","BATTERY.current [A]","BATTERY.loopNum",
  "BATTERY.fullCapacity [mAh]","BATTERY.currentCapacity [mAh]","BATTERY.life [%]","BATTERY.status",
  "BATTERY.cellVoltage1 [V]","BATTERY.cellVoltage2 [V]","BATTERY.cellVoltage3 [V]",
  "BATTERY.cellVoltage4 [V]","BATTERY.cellVoltage5 [V]","BATTERY.cellVoltage6 [V]",
  // API-native cell deviation fields (supports up to 14 cells)
  "BATTERY.cellVoltageDeviation [V]","BATTERY.isCellVoltageDeviationHigh","BATTERY.maxCellVoltageDeviation [V]",
  "BATTERY.goHomeStatus",
  "CUSTOM.dateTime","CUSTOM.date [UTC]","CUSTOM.updateTime [UTC]",
  "DETAILS.startTime","DETAILS.aircraftName","DETAILS.aircraftSN","DETAILS.aircraftSerial","DETAILS.droneType",
  "DETAILS.batterySN","DETAILS.batterySerial","DETAILS.totalTime [s]","DETAILS.totalDistance [m]","DETAILS.maxAltitude [m]","DETAILS.maxHSpeed [m/s]","DETAILS.maxVSpeed [m/s]","DETAILS.maxDistance [m]",
  "DETAILS.sha256Hash","DETAILS.guid",
  "HOME.goHomeStatus",
  "APP.warn",
].join(",");

// ── Date normalisation ──

function normalizeDateToISO(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && /^\d{4}-\d{2}/.test(s)) return iso.toISOString();
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[\sT]+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i
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

// ── CSV parser ──

function findHeaderIndex(headers: string[], target: string): number {
  const exact = headers.indexOf(target);
  if (exact !== -1) return exact;
  const targetLower = target.toLowerCase();
  const ciIdx = headers.findIndex((h) => h.toLowerCase() === targetLower);
  if (ciIdx !== -1) return ciIdx;
  const baseName = target.replace(/\s*\[.*\]$/, "").toLowerCase();
  return headers.findIndex((h) => h.toLowerCase().replace(/\s*\[.*\]$/, "") === baseName);
}

function parseCsvMinimal(csvText: string) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("Empty CSV");

  const headers = lines[0].split(",").map((h) => h.trim());
  const firstRow = lines[1].split(",").map((c) => c.trim());

  const get = (field: string) => {
    const idx = findHeaderIndex(headers, field);
    return idx >= 0 ? firstRow[idx] : "";
  };
  const getNum = (field: string) => {
    const v = parseFloat(get(field));
    return isNaN(v) ? null : v;
  };

  const aircraftSN = get("DETAILS.aircraftSN") || get("DETAILS.aircraftSerial");
  const batterySN = (get("DETAILS.batterySN") || get("DETAILS.batterySerial")).replace(/^"|"$/g, "").trim();
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

  const positions: Array<{ lat: number; lng: number; alt: number; height: number; timestamp: string }> = [];
  const latIdx = findHeaderIndex(headers, "OSD.latitude");
  const lonIdx = findHeaderIndex(headers, "OSD.longitude");
  const altIdx = findHeaderIndex(headers, "OSD.altitude [m]");
  const heightIdx = findHeaderIndex(headers, "OSD.height [m]");
  const timeIdx = findHeaderIndex(headers, "OSD.flyTime [ms]");
  const speedIdx = findHeaderIndex(headers, "OSD.hSpeed [m/s]");
  const batteryIdx = findHeaderIndex(headers, "BATTERY.chargeLevel [%]");
  const dateTimeIdx = findHeaderIndex(headers, "CUSTOM.dateTime");

  let maxSpeed = 0;
  let minBattery = batteryIdx >= 0 ? 100 : -1;
  let maxFlyTimeMs = 0;
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

    if (!isNaN(speed) && speed > maxSpeed) maxSpeed = speed;
    if (!isNaN(battery) && battery < minBattery) minBattery = battery;
    if (!isNaN(flyTimeMs) && flyTimeMs > maxFlyTimeMs) maxFlyTimeMs = flyTimeMs;

    if ((i - 1) % sampleRate === 0 && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
      const ts = dateTimeIdx >= 0 && cols[dateTimeIdx] ? cols[dateTimeIdx] :
        (!isNaN(flyTimeMs) ? `PT${Math.round(flyTimeMs / 1000)}S` : `PT${Math.round((i - 1) / 10)}S`);
      positions.push({ lat, lng: lon, alt: isNaN(alt) ? 0 : alt, height: isNaN(height) ? 0 : height, timestamp: ts });
    }
  }

  const startPos = positions.length > 0 ? positions[0] : null;
  const endPos = positions.length > 0 ? positions[positions.length - 1] : null;

  return {
    aircraftSN,
    batterySN,
    sha256Hash,
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

// ── Upload helper ──

async function uploadAndParse(dronelogKey: string, fileBytes: Uint8Array, ext: string, logId: string): Promise<ReturnType<typeof parseCsvMinimal>> {
  const fieldList = FIELDS.split(",").map(f => f.trim());
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

  const uploadRes = await fetch(`${DRONELOG_BASE}/logs/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": `multipart/form-data; boundary=${boundary}`, Accept: "application/json" },
    body: uploadBody,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    if (ext === ".zip" && uploadRes.status === 500) {
      console.log(`[dji-process-single] ZIP upload got 500, trying ZIP->TXT fallback for ${logId}`);
      const zip = await JSZip.loadAsync(fileBytes);
      const txtEntry = Object.values(zip.files).find((f: any) => !f.dir && f.name.toLowerCase().endsWith(".txt"));
      if (txtEntry) {
        const txtBytes = await (txtEntry as any).async("uint8array");
        return uploadAndParse(dronelogKey, txtBytes, ".txt", logId);
      }
    }
    throw new Error(`DroneLog upload failed (${uploadRes.status}): ${errText.slice(0, 300)}`);
  }

  const csvText = await uploadRes.text();
  return parseCsvMinimal(csvText);
}

// ── Decrypt DJI password ──

async function decryptPassword(encryptedB64: string): Promise<string> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const raw = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(serviceKey.slice(0, 32)), "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ── Main handler: process a single pending DJI log on demand ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: { user }, error: authErr } = await serviceClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { pending_log_id } = await req.json();
    if (!pending_log_id) {
      return new Response(JSON.stringify({ error: "Missing pending_log_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch the pending log
    const { data: pendingLog, error: plErr } = await serviceClient
      .from("pending_dji_logs")
      .select("*")
      .eq("id", pending_log_id)
      .maybeSingle();

    if (plErr || !pendingLog) {
      return new Response(JSON.stringify({ error: "Pending log not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If already parsed, return existing result
    if (pendingLog.parsed_result) {
      return new Response(JSON.stringify({ success: true, parsed_result: pendingLog.parsed_result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get user's DJI credentials
    const { data: cred } = await serviceClient
      .from("dji_credentials")
      .select("dji_email, dji_password_encrypted, dji_account_id")
      .eq("user_id", pendingLog.user_id)
      .maybeSingle();

    if (!cred) {
      return new Response(JSON.stringify({ error: "No DJI credentials found for this user" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get company's DroneLog API key
    const { data: company } = await serviceClient
      .from("companies")
      .select("dronelog_api_key")
      .eq("id", pendingLog.company_id)
      .maybeSingle();

    const dronelogKey = company?.dronelog_api_key || Deno.env.get("DRONELOG_AVISAFE_KEY");
    if (!dronelogKey) {
      return new Response(JSON.stringify({ error: "No DroneLog API key configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Login to DJI
    const password = await decryptPassword(cred.dji_password_encrypted);
    const loginRes = await fetch(`${DRONELOG_BASE}/accounts/dji`, {
      method: "POST",
      headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: cred.dji_email, password }),
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      return new Response(JSON.stringify({ error: `DJI login failed (${loginRes.status})`, upstreamStatus: loginRes.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const loginData = await loginRes.json();
    const accountId = loginData.result?.djiAccountId || loginData.result?.id || loginData.result?.accountId || cred.dji_account_id;

    if (!accountId) {
      return new Response(JSON.stringify({ error: "Could not determine DJI account ID" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Download the log file
    const logId = pendingLog.dji_log_id;
    const downloadUrl = `${DRONELOG_BASE}/logs/${accountId}/${logId}/download`;
    const fileRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/octet-stream" },
      redirect: "follow",
    });

    if (!fileRes.ok) {
      const errText = await fileRes.text();
      return new Response(JSON.stringify({ error: `Download failed (${fileRes.status})`, upstreamStatus: fileRes.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const buffer = await fileRes.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B;
    const ext = isZip ? ".zip" : ".txt";

    console.log(`[dji-process-single] Processing log ${logId} (${bytes.length} bytes, ${ext})`);

    const parsed = await uploadAndParse(dronelogKey, bytes, ext, logId);

    // Auto-match drone by serial
    let matchedDroneId: string | null = null;
    if (parsed.aircraftSN) {
      const { data: drones } = await serviceClient
        .from("drones")
        .select("id, serienummer, internal_serial")
        .eq("company_id", pendingLog.company_id);

      if (drones) {
        const snLower = parsed.aircraftSN.toLowerCase();
        const match = drones.find(d =>
          d.serienummer.toLowerCase() === snLower ||
          (d.internal_serial && d.internal_serial.toLowerCase() === snLower)
        );
        if (match) matchedDroneId = match.id;
      }
    }

    // Auto-match battery
    let matchedBatteryId: string | null = null;
    if (parsed.batterySN) {
      const { data: batteries } = await serviceClient
        .from("equipment")
        .select("id, serienummer, internal_serial")
        .eq("company_id", pendingLog.company_id)
        .eq("type", "Batteri");

      if (batteries) {
        const bsnLower = parsed.batterySN.toLowerCase();
        const match = batteries.find(b =>
          b.serienummer.toLowerCase() === bsnLower ||
          (b.internal_serial && b.internal_serial.toLowerCase() === bsnLower)
        );
        if (match) matchedBatteryId = match.id;
      }
    }

    // Update the pending log with parsed result
    await serviceClient
      .from("pending_dji_logs")
      .update({
        parsed_result: parsed as any,
        aircraft_sn: parsed.aircraftSN || null,
        aircraft_name: parsed.aircraftName || pendingLog.aircraft_name,
        flight_date: parsed.startTime || pendingLog.flight_date,
        duration_seconds: Math.round(parsed.durationSeconds),
        matched_drone_id: matchedDroneId,
        matched_battery_id: matchedBatteryId,
        max_height_m: parsed.maxAltitude || null,
        total_distance_m: parsed.totalDistance || null,
      })
      .eq("id", pending_log_id);

    // Check if SHA-256 already exists in flight_logs
    if (parsed.sha256Hash) {
      const { data: existingFlight } = await serviceClient
        .from("flight_logs")
        .select("id")
        .eq("company_id", pendingLog.company_id)
        .eq("dronelog_sha256", parsed.sha256Hash)
        .maybeSingle();

      if (existingFlight) {
        // Mark as already imported
        await serviceClient
          .from("pending_dji_logs")
          .update({ status: "approved", processed_flight_log_id: existingFlight.id })
          .eq("id", pending_log_id);

        return new Response(JSON.stringify({
          success: true,
          already_imported: true,
          existing_flight_log_id: existingFlight.id,
          parsed_result: parsed,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      parsed_result: parsed,
      matched_drone_id: matchedDroneId,
      matched_battery_id: matchedBatteryId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[dji-process-single] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
