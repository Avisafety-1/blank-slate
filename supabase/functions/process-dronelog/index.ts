import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DRONELOG_BASE = "https://dronelogapi.com/api/v1";

// Correct field names per DroneLog API /fields endpoint
const FIELDS = "OSD.latitude,OSD.longitude,OSD.altitude [m],OSD.height [m],OSD.flyTime [ms],OSD.hSpeed [m/s],BATTERY.chargeLevel [%]";

/**
 * Find a header index using flexible matching:
 * 1. Exact match
 * 2. Case-insensitive exact match
 * 3. Partial match (header starts with the base field name before any bracket)
 */
function findHeaderIndex(headers: string[], target: string): number {
  // 1. Exact match
  const exact = headers.indexOf(target);
  if (exact !== -1) return exact;

  // 2. Case-insensitive
  const targetLower = target.toLowerCase();
  const ciIdx = headers.findIndex((h) => h.toLowerCase() === targetLower);
  if (ciIdx !== -1) return ciIdx;

  // 3. Partial: extract base name (e.g. "OSD.flyTime" from "OSD.flyTime [ms]")
  const baseName = target.replace(/\s*\[.*\]$/, "").toLowerCase();
  const partialIdx = headers.findIndex((h) => h.toLowerCase().replace(/\s*\[.*\]$/, "") === baseName);
  if (partialIdx !== -1) return partialIdx;

  // 4. Legacy name mapping (old names → new base names)
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

function parseCsvToResult(csvText: string) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("Empty or invalid CSV response from DroneLog");
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  console.log("CSV headers received:", JSON.stringify(headers));
  console.log("First data row:", lines[1]);

  const latIdx = findHeaderIndex(headers, "OSD.latitude");
  const lonIdx = findHeaderIndex(headers, "OSD.longitude");
  const altIdx = findHeaderIndex(headers, "OSD.altitude [m]");
  const heightIdx = findHeaderIndex(headers, "OSD.height [m]");
  const timeIdx = findHeaderIndex(headers, "OSD.flyTime [ms]");
  const speedIdx = findHeaderIndex(headers, "OSD.hSpeed [m/s]");
  const batteryIdx = findHeaderIndex(headers, "BATTERY.chargeLevel [%]");

  console.log("Column indices — lat:", latIdx, "lon:", lonIdx, "alt:", altIdx, "height:", heightIdx, "time:", timeIdx, "speed:", speedIdx, "battery:", batteryIdx);

  const positions: Array<{ lat: number; lng: number; alt: number; height: number; timestamp: string }> = [];
  let maxSpeed = 0;
  let minBattery = 100;
  let maxFlyTimeMs = 0;
  const batteryReadings: number[] = [];
  const warnings: Array<{ type: string; message: string; value?: number }> = [];

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
    if (!isNaN(battery)) {
      if (battery < minBattery) minBattery = battery;
      batteryReadings.push(battery);
    }
    if (!isNaN(flyTimeMs) && flyTimeMs > maxFlyTimeMs) maxFlyTimeMs = flyTimeMs;

    if ((i - 1) % sampleRate === 0 && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
      positions.push({
        lat,
        lng: lon,
        alt: isNaN(alt) ? 0 : alt,
        height: isNaN(height) ? 0 : height,
        timestamp: !isNaN(flyTimeMs) ? `PT${Math.round(flyTimeMs / 1000)}S` : `PT${Math.round((i - 1) / 10)}S`,
      });
    }
  }

  let durationMinutes = Math.round(maxFlyTimeMs / 60000);

  // Fallback: estimate from row count if flyTime column was missing (DJI logs ~10Hz)
  if (maxFlyTimeMs === 0 && lines.length > 10) {
    const estimatedSeconds = (lines.length - 1) / 10;
    durationMinutes = Math.round(estimatedSeconds / 60);
    console.log("flyTime column empty/missing, estimated duration from row count:", durationMinutes, "min (" + (lines.length - 1) + " rows @ 10Hz)");
  }

  if (minBattery < 20) {
    warnings.push({ type: "low_battery", message: `Batterinivå gikk ned til ${minBattery}%`, value: minBattery });
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
  };
}

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

      // DJI Login
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
        console.log("DJI login response status:", res.status, "body:", JSON.stringify(data));
        if (!res.ok) {
          const errMsg = res.status === 500
            ? "DroneLog API serverfeil. Sjekk at DJI-legitimasjonen er korrekt, eller prøv igjen senere."
            : (data.message || "DJI login failed");
          return new Response(JSON.stringify({ error: errMsg, details: data, status: res.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // DJI List Logs
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

      // DJI Process Log by URL
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

    // ── File upload (existing functionality) ──
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Read file into bytes for manual multipart construction
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const fileName = file.name || "flight.txt";
    const boundary = "----DronLogBoundary" + Date.now();
    const fieldList = FIELDS.split(",").map(f => f.trim());

    // Build multipart body manually to ensure fields[] works with Laravel
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

    console.log("Upload: manual multipart, fields:", fieldList, "file:", fileName, "size:", fileBytes.length);

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
