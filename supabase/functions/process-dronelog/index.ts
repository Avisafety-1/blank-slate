import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dronelogKey = Deno.env.get("DRONELOG_AVISAFE_KEY");
    if (!dronelogKey) {
      return new Response(
        JSON.stringify({ error: "DroneLog API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse multipart form data from the client
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Forward file to DroneLog API
    const dronelogForm = new FormData();
    dronelogForm.append("file", file);
    dronelogForm.append(
      "fields",
      "OSD.latitude,OSD.longitude,OSD.altitude,OSD.height,OSD.flyTimeMilliseconds,OSD.speed,BATTERY.chargeLevel"
    );

    const dronelogResponse = await fetch(
      "https://dronelogapi.com/api/v1/logs/upload",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dronelogKey}`,
        },
        body: dronelogForm,
      }
    );

    if (!dronelogResponse.ok) {
      const errText = await dronelogResponse.text();
      console.error("DroneLog API error:", dronelogResponse.status, errText);
      return new Response(
        JSON.stringify({
          error: "DroneLog API error",
          details: errText,
          status: dronelogResponse.status,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse CSV response
    const csvText = await dronelogResponse.text();
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      return new Response(
        JSON.stringify({ error: "Empty or invalid CSV response from DroneLog" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const headers = lines[0].split(",").map((h) => h.trim());
    const latIdx = headers.indexOf("OSD.latitude");
    const lonIdx = headers.indexOf("OSD.longitude");
    const altIdx = headers.indexOf("OSD.altitude");
    const heightIdx = headers.indexOf("OSD.height");
    const timeIdx = headers.indexOf("OSD.flyTimeMilliseconds");
    const speedIdx = headers.indexOf("OSD.speed");
    const batteryIdx = headers.indexOf("BATTERY.chargeLevel");

    const positions: Array<{
      lat: number;
      lng: number;
      alt: number;
      height: number;
      timestamp: string;
    }> = [];
    let maxSpeed = 0;
    let minBattery = 100;
    let maxFlyTimeMs = 0;
    const batteryReadings: number[] = [];
    const warnings: Array<{ type: string; message: string; value?: number }> = [];

    // Sample every Nth row to keep position array manageable (max ~500 points)
    const sampleRate = Math.max(1, Math.floor((lines.length - 1) / 500));

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      const lat = parseFloat(cols[latIdx]);
      const lon = parseFloat(cols[lonIdx]);
      const alt = parseFloat(cols[altIdx]);
      const height = parseFloat(cols[heightIdx]);
      const flyTimeMs = parseFloat(cols[timeIdx]);
      const speed = parseFloat(cols[speedIdx]);
      const battery = parseFloat(cols[batteryIdx]);

      if (!isNaN(speed) && speed > maxSpeed) maxSpeed = speed;
      if (!isNaN(battery)) {
        if (battery < minBattery) minBattery = battery;
        batteryReadings.push(battery);
      }
      if (!isNaN(flyTimeMs) && flyTimeMs > maxFlyTimeMs) maxFlyTimeMs = flyTimeMs;

      // Sample positions
      if ((i - 1) % sampleRate === 0 && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
        positions.push({
          lat,
          lng: lon,
          alt: isNaN(alt) ? 0 : alt,
          height: isNaN(height) ? 0 : height,
          timestamp: new Date(flyTimeMs).toISOString(),
        });
      }
    }

    const durationMinutes = Math.round(maxFlyTimeMs / 60000);

    // Detect warnings
    if (minBattery < 20) {
      warnings.push({
        type: "low_battery",
        message: `Batterinivå gikk ned til ${minBattery}%`,
        value: minBattery,
      });
    }

    // Check for sudden altitude changes (>50m in consecutive samples)
    for (let i = 1; i < positions.length; i++) {
      const altDiff = Math.abs(positions[i].height - positions[i - 1].height);
      if (altDiff > 50) {
        warnings.push({
          type: "altitude_anomaly",
          message: `Plutselig høydeendring på ${altDiff.toFixed(0)}m registrert`,
          value: altDiff,
        });
        break; // Only report first occurrence
      }
    }

    const startPos = positions.length > 0 ? positions[0] : null;
    const endPos = positions.length > 0 ? positions[positions.length - 1] : null;

    const result = {
      positions,
      durationMinutes,
      durationMs: maxFlyTimeMs,
      maxSpeed: Math.round(maxSpeed * 10) / 10,
      minBattery,
      batteryReadings:
        batteryReadings.length > 100
          ? batteryReadings.filter(
              (_, i) =>
                i % Math.floor(batteryReadings.length / 100) === 0
            )
          : batteryReadings,
      startPosition: startPos,
      endPosition: endPos,
      totalRows: lines.length - 1,
      sampledPositions: positions.length,
      warnings,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-dronelog error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
