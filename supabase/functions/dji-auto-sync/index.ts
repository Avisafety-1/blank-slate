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
  "BATTERY.goHomeStatus",
  "CUSTOM.dateTime","CUSTOM.date [UTC]","CUSTOM.updateTime [UTC]",
  "DETAILS.startTime","DETAILS.aircraftName","DETAILS.aircraftSN","DETAILS.aircraftSerial","DETAILS.droneType",
  "DETAILS.batterySN","DETAILS.batterySerial","DETAILS.totalTime [s]","DETAILS.totalDistance [m]","DETAILS.maxAltitude [m]","DETAILS.maxHSpeed [m/s]","DETAILS.maxVSpeed [m/s]","DETAILS.maxDistance [m]",
  "DETAILS.sha256Hash","DETAILS.guid",
  "HOME.goHomeStatus",
  "APP.warn",
].join(",");

// ── Minimal CSV parser (same logic as process-dronelog) ──

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

  // Aircraft serial
  const aircraftSN = get("DETAILS.aircraftSN") || get("DETAILS.aircraftSerial");
  const batterySN = (get("DETAILS.batterySN") || get("DETAILS.batterySerial")).replace(/^"|"$/g, "").trim();
  const sha256Hash = get("DETAILS.sha256Hash");
  const totalTimeSec = getNum("DETAILS.totalTime [s]");
  const durationMinutes = totalTimeSec ? Math.round(totalTimeSec / 60) : Math.round((lines.length - 1) / 600);

  // Start time
  let startTime = get("DETAILS.startTime");
  if (startTime) {
    const testParsed = new Date(startTime.replace(/Z$/, '').replace('T', ' '));
    if (!isNaN(testParsed.getTime())) {
      // Convert to ISO format for PostgreSQL compatibility
      startTime = testParsed.toISOString();
    } else {
      const dtMatch = startTime.match(
        /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*T?\s*(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?/i
      );
      if (dtMatch) {
        const [, month, day, year, hours, mins, secs, , ampm] = dtMatch;
        let h = parseInt(hours);
        if (ampm?.toUpperCase() === 'PM' && h < 12) h += 12;
        if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0;
        startTime = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(h).padStart(2,'0')}:${mins}:${secs}Z`;
      } else {
        startTime = "";
      }
    }
  }
  if (!startTime) {
    const customDate = get("CUSTOM.date [UTC]");
    const customTime = get("CUSTOM.updateTime [UTC]");
    if (customDate) startTime = customTime ? `${customDate}T${customTime}Z` : `${customDate}T00:00:00Z`;
  }
  if (!startTime) startTime = get("CUSTOM.dateTime");

  // Build full parsed_result (same shape as process-dronelog output for compatibility)
  // We store the full CSV result so the user can review/approve it later
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

// ── Upload helper (same as process-dronelog) ──

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
    // ZIP->TXT fallback for upstream 500
    if (ext === ".zip" && uploadRes.status === 500) {
      console.log(`[dji-auto-sync] ZIP upload got 500, trying ZIP->TXT fallback for ${logId}`);
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

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startMs = Date.now();
  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Find companies with auto-sync enabled
    const { data: companies, error: compErr } = await serviceClient
      .from("companies")
      .select("id, navn, dronelog_api_key, dji_sync_from_date")
      .eq("dji_auto_sync_enabled", true)
      .eq("aktiv", true)
      .eq("dji_flightlog_enabled", true);

    if (compErr) throw compErr;
    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies with auto-sync enabled", synced: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[dji-auto-sync] Found ${companies.length} companies with auto-sync enabled`);

    let totalSynced = 0;
    let totalErrors = 0;
    const results: Array<{ company: string; synced: number; errors: number; details?: string }> = [];

    for (const company of companies) {
      const dronelogKey = company.dronelog_api_key || Deno.env.get("DRONELOG_AVISAFE_KEY");
      if (!dronelogKey) {
        console.log(`[dji-auto-sync] Skipping ${company.navn}: no DroneLog API key`);
        results.push({ company: company.navn, synced: 0, errors: 0, details: "No API key" });
        continue;
      }

      // Find users with DJI credentials in this company
      const { data: profiles } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("company_id", company.id);

      if (!profiles || profiles.length === 0) {
        results.push({ company: company.navn, synced: 0, errors: 0, details: "No users" });
        continue;
      }

      const profileIds = profiles.map(p => p.id);

      const { data: credentials } = await serviceClient
        .from("dji_credentials")
        .select("user_id, dji_email, dji_password_encrypted, dji_account_id, last_sync_at")
        .in("user_id", profileIds);

      if (!credentials || credentials.length === 0) {
        results.push({ company: company.navn, synced: 0, errors: 0, details: "No DJI credentials" });
        continue;
      }

      console.log(`[dji-auto-sync] ${company.navn}: ${credentials.length} users with DJI credentials`);

      let companySynced = 0;
      let companyErrors = 0;

      // Get company drones for auto-matching
      const { data: drones } = await serviceClient
        .from("drones")
        .select("id, serienummer, internal_serial, modell")
        .eq("company_id", company.id);

      // Get company batteries for auto-matching
      const { data: batteries } = await serviceClient
        .from("equipment")
        .select("id, serienummer, internal_serial, type")
        .eq("company_id", company.id)
        .eq("type", "Batteri");

      for (const cred of credentials) {
        try {
          // Decrypt and login
          const password = await decryptPassword(cred.dji_password_encrypted);

          const loginRes = await fetch(`${DRONELOG_BASE}/accounts/dji`, {
            method: "POST",
            headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ email: cred.dji_email, password }),
          });

          if (!loginRes.ok) {
            const loginErr = await loginRes.text();
            console.error(`[dji-auto-sync] Login failed for ${cred.dji_email}: ${loginRes.status}`);
            // If credentials are invalid, skip (don't delete - could be temporary)
            if (loginRes.status === 429) {
              console.log(`[dji-auto-sync] Rate limited, stopping sync for this company`);
              companyErrors++;
              break;
            }
            companyErrors++;
            continue;
          }

          const loginData = await loginRes.json();
          const accountId = loginData.result?.djiAccountId || loginData.result?.id || loginData.result?.accountId || cred.dji_account_id;

          if (!accountId) {
            console.error(`[dji-auto-sync] No accountId for ${cred.dji_email}`);
            companyErrors++;
            continue;
          }

          // List logs
          const listRes = await fetch(`${DRONELOG_BASE}/logs/${accountId}?limit=50`, {
            headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/json" },
          });

          if (!listRes.ok) {
            console.error(`[dji-auto-sync] List logs failed: ${listRes.status}`);
            if (listRes.status === 429) break;
            companyErrors++;
            continue;
          }

          const listData = await listRes.json();
          const logs = listData.result?.logs || listData.result || [];

          if (!Array.isArray(logs) || logs.length === 0) {
            console.log(`[dji-auto-sync] No logs found for ${cred.dji_email}`);
            continue;
          }

          console.log(`[dji-auto-sync] Found ${logs.length} logs for ${cred.dji_email}`);

          // Filter by sync_from_date if set
          const syncFromDate = company.dji_sync_from_date ? new Date(company.dji_sync_from_date) : null;

          for (const log of logs) {
            const logId = log.id || log.logId;
            if (!logId) continue;

            // Check date filter
            if (syncFromDate && log.date) {
              const logDate = new Date(log.date);
              if (logDate < syncFromDate) {
                continue;
              }
            }

            // Check if already in pending_dji_logs
            const { data: existing } = await serviceClient
              .from("pending_dji_logs")
              .select("id")
              .eq("company_id", company.id)
              .eq("dji_log_id", String(logId))
              .maybeSingle();

            if (existing) continue;

            // Check if already in flight_logs by sha256 (we'll need to process first to get sha256)
            // For now, we use logId as dedup key in pending_dji_logs

            try {
              // Download the log file
              const downloadUrl = log.url || log.downloadUrl || `${DRONELOG_BASE}/logs/${accountId}/${logId}/download`;
              const fileRes = await fetch(downloadUrl, {
                headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/octet-stream" },
                redirect: "follow",
              });

              if (!fileRes.ok) {
                if (fileRes.status === 429) {
                  console.log(`[dji-auto-sync] Rate limited during download, stopping`);
                  break;
                }
                console.error(`[dji-auto-sync] Download failed for log ${logId}: ${fileRes.status}`);
                companyErrors++;
                continue;
              }

              const buffer = await fileRes.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B;
              const ext = isZip ? ".zip" : ".txt";

              console.log(`[dji-auto-sync] Processing log ${logId} (${bytes.length} bytes, ${ext})`);

              const parsed = await uploadAndParse(dronelogKey, bytes, ext, logId);

              // Auto-match drone by serial number
              let matchedDroneId: string | null = null;
              if (parsed.aircraftSN && drones) {
                const snLower = parsed.aircraftSN.toLowerCase();
                const match = drones.find(d =>
                  d.serienummer.toLowerCase() === snLower ||
                  (d.internal_serial && d.internal_serial.toLowerCase() === snLower)
                );
                if (match) matchedDroneId = match.id;
              }

              // Auto-match battery
              let matchedBatteryId: string | null = null;
              if (parsed.batterySN && batteries) {
                const bsnLower = parsed.batterySN.toLowerCase();
                const match = batteries.find(b =>
                  b.serienummer.toLowerCase() === bsnLower ||
                  (b.internal_serial && b.internal_serial.toLowerCase() === bsnLower)
                );
                if (match) matchedBatteryId = match.id;
              }

              // Insert into pending_dji_logs
              const { error: insertErr } = await serviceClient
                .from("pending_dji_logs")
                .insert({
                  company_id: company.id,
                  user_id: cred.user_id,
                  dji_log_id: String(logId),
                  aircraft_sn: parsed.aircraftSN || null,
                  flight_date: parsed.startTime || (log.date ? new Date(log.date).toISOString() : null),
                  duration_seconds: Math.round(parsed.durationSeconds),
                  parsed_result: parsed as any,
                  matched_drone_id: matchedDroneId,
                  matched_battery_id: matchedBatteryId,
                  status: "pending",
                });

              if (insertErr) {
                // Unique constraint violation = already exists, skip
                if (insertErr.code === "23505") continue;
                console.error(`[dji-auto-sync] Insert error for log ${logId}:`, insertErr);
                companyErrors++;
                continue;
              }

              companySynced++;
              console.log(`[dji-auto-sync] Synced log ${logId} (drone: ${matchedDroneId || 'unmatched'})`);

            } catch (logErr) {
              console.error(`[dji-auto-sync] Error processing log ${logId}:`, logErr);
              companyErrors++;

              // Insert with error status
              await serviceClient.from("pending_dji_logs").upsert({
                company_id: company.id,
                user_id: cred.user_id,
                dji_log_id: String(logId),
                status: "error",
                error_message: String(logErr).slice(0, 500),
              }, { onConflict: "company_id,dji_log_id" }).catch(() => {});
            }

            // Rate limit ourselves: small delay between logs
            await new Promise(r => setTimeout(r, 500));
          }

          // Update last_sync_at
          await serviceClient
            .from("dji_credentials")
            .update({ last_sync_at: new Date().toISOString() })
            .eq("user_id", cred.user_id);

        } catch (credErr) {
          console.error(`[dji-auto-sync] Error for user ${cred.dji_email}:`, credErr);
          companyErrors++;
        }
      }

      totalSynced += companySynced;
      totalErrors += companyErrors;
      results.push({ company: company.navn, synced: companySynced, errors: companyErrors });
    }

    const elapsed = Date.now() - startMs;
    console.log(`[dji-auto-sync] Done in ${elapsed}ms: ${totalSynced} synced, ${totalErrors} errors`);

    return new Response(JSON.stringify({
      success: true,
      synced: totalSynced,
      errors: totalErrors,
      elapsed_ms: elapsed,
      companies: results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[dji-auto-sync] Fatal error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
