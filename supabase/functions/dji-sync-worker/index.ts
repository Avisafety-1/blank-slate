// dji-sync-worker
// Claims up to BATCH_SIZE jobs from dji_sync_jobs, downloads + parses each,
// and writes results into pending_dji_logs. Runs every few minutes via pg_cron
// during the sync window.
//
// Auth: cron secret ONLY. No user-facing entrypoint.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { hasValidCronSecret } from "../_shared/cron.ts";
import {
  DRONELOG_BASE,
  downloadLogBytes,
  uploadAndParse,
  matchDroneAndBattery,
} from "../_shared/dji-parser.ts";
import { resolveDronelogKey } from "../_shared/dronelog-auth.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Start small. Bump to 3/5 once we've validated step_durations on >100 jobs.
const BATCH_SIZE = 2;
const MAX_ATTEMPTS = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Job {
  id: string;
  company_id: string;
  user_id: string;
  dji_log_id: string;
  download_url: string | null;
  payload: any;
  attempts: number;
}

async function processJob(serviceClient: any, job: Job): Promise<{ status: string; total_ms: number; error?: string }> {
  const t0 = Date.now();
  const step_durations: Record<string, number> = {};

  try {
    // Resolve dronelog key for this user (personal -> company -> global)
    const { data: company } = await serviceClient
      .from("companies").select("id, dronelog_api_key").eq("id", job.company_id).maybeSingle();
    if (!company) throw new Error("company not found");
    const resolvedKey = await resolveDronelogKey(serviceClient, {
      userId: job.user_id,
      companyId: job.company_id,
    });
    const dronelogKey = resolvedKey?.key;
    if (!dronelogKey) throw new Error("no dronelog key");


    const accountId = job.payload?.dronelog_account_id;
    const fileUrl = job.download_url
      || (accountId ? `${DRONELOG_BASE}/logs/${accountId}/${job.dji_log_id}/download` : null);
    if (!fileUrl) throw new Error("no download url and no accountId in payload");

    // 1. Download
    const dlStart = Date.now();
    let bytes: Uint8Array;
    try {
      bytes = await downloadLogBytes(dronelogKey, fileUrl);
    } catch (dlErr: any) {
      step_durations.download_ms = Date.now() - dlStart;
      // 429 → re-queue without burning an attempt
      if (dlErr?.status === 429 || /429|rate/i.test(dlErr?.message ?? "")) {
        await serviceClient.from("dji_sync_jobs").update({
          status: "queued",
          attempts: Math.max(0, job.attempts - 1),
          scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          locked_until: null,
          last_error: "rate limited (429) on download",
          last_error_at: new Date().toISOString(),
          step_durations: { ...step_durations, total_ms: Date.now() - t0 },
        }).eq("id", job.id);
        return { status: "rate_limited", total_ms: Date.now() - t0, error: dlErr.message };
      }
      throw dlErr;
    }
    step_durations.download_ms = Date.now() - dlStart;

    // 2. Upload + parse via DroneLog
    const upStart = Date.now();
    const parsed = await uploadAndParse(dronelogKey, bytes, ".txt", job.dji_log_id);
    step_durations.parse_ms = Date.now() - upStart;

    // [DIAG] Hardware identifiers — informational only, no matching logic uses these yet
    console.log(`[DIAG] log ${job.dji_log_id} identifiers —`,
      "aircraftName:", (parsed as any).aircraftName || "(none)",
      "| aircraftSN:", (parsed as any).aircraftSN || "(none)",
      "| fcSN:", (parsed as any).fcSN || "(none)",
      "| rcSN:", (parsed as any).rcSN || "(none)",
      "| cameraSN:", (parsed as any).cameraSN || "(none)",
      "| gimbalSN:", (parsed as any).gimbalSN || "(none)",
      "| SERIAL.aircraftSN:", (parsed as any).serialAircraftSN || "(none)");

    // 3. Match drone + battery
    const matchStart = Date.now();
    const { matchedDroneId, matchedBatteryId, snMismatchSuggestion } =
      await matchDroneAndBattery(serviceClient, job.company_id, parsed);
    step_durations.match_ms = Date.now() - matchStart;

    // 4. Check duplicate import
    let alreadyImported = false;
    let existingFlightLogId: string | null = null;
    if (parsed.sha256Hash) {
      const { data: existingFlight } = await serviceClient
        .from("flight_logs").select("id")
        .eq("company_id", job.company_id).eq("dronelog_sha256", parsed.sha256Hash)
        .maybeSingle();
      if (existingFlight) { alreadyImported = true; existingFlightLogId = existingFlight.id; }
    }

    // 5. Insert pending row
    const insStart = Date.now();
    const { error: insErr } = await serviceClient.from("pending_dji_logs").insert({
      company_id: job.company_id,
      user_id: job.user_id,
      dji_log_id: job.dji_log_id,
      aircraft_name: parsed.aircraftName || job.payload?.aircraft_name_hint || null,
      aircraft_sn: parsed.aircraftSN || null,
      flight_date: parsed.startTime || job.payload?.log_date || null,
      duration_seconds: Math.round(parsed.durationSeconds),
      max_height_m: parsed.maxAltitude || null,
      total_distance_m: parsed.totalDistance || null,
      parsed_result: parsed as any,
      matched_drone_id: matchedDroneId,
      matched_battery_id: matchedBatteryId,
      sn_mismatch_suggestion: snMismatchSuggestion,
      status: alreadyImported ? "approved" : "pending",
      processed_flight_log_id: existingFlightLogId,
    });
    step_durations.insert_ms = Date.now() - insStart;

    if (insErr && (insErr as any).code !== "23505") throw insErr;

    const total_ms = Date.now() - t0;
    await serviceClient.from("dji_sync_jobs").update({
      status: "done",
      last_error: null,
      last_error_at: null,
      locked_until: null,
      step_durations: { ...step_durations, total_ms },
    }).eq("id", job.id);

    return { status: "done", total_ms };
  } catch (err: any) {
    const total_ms = Date.now() - t0;
    const msg = err?.message ?? String(err);

    // Detect unsupported format (no aircraft from list AND parse failed)
    const aircraftHint = (job.payload?.aircraft_name_hint || "").toString().trim();
    const isUnsupported = !aircraftHint && /upload failed|empty csv|invalid|unsupported/i.test(msg);

    if (isUnsupported) {
      await serviceClient.from("dji_sync_jobs").update({
        status: "unsupported",
        last_error: msg,
        last_error_at: new Date().toISOString(),
        locked_until: null,
        step_durations: { ...step_durations, total_ms },
      }).eq("id", job.id);

      // Mirror to pending_dji_logs so it shows up correctly in legacy UI
      await serviceClient.from("pending_dji_logs").insert({
        company_id: job.company_id,
        user_id: job.user_id,
        dji_log_id: job.dji_log_id,
        aircraft_name: aircraftHint || null,
        flight_date: job.payload?.log_date || null,
        duration_seconds: job.payload?.list_duration ?? null,
        status: "unsupported",
        error_code: "unsupported_format",
        error_message: "Loggen kan ikke parses automatisk fra DJI Cloud. Last opp .txt manuelt fra dronen.",
        last_error_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error && (error as any).code !== "23505") {
          console.error(`[worker] pending_dji_logs insert (unsupported) failed:`, error.message);
        }
      });

      return { status: "unsupported", total_ms, error: msg };
    }

    const failed = job.attempts >= MAX_ATTEMPTS;
    await serviceClient.from("dji_sync_jobs").update({
      status: failed ? "failed" : "queued",
      last_error: msg.slice(0, 800),
      last_error_at: new Date().toISOString(),
      scheduled_at: failed ? new Date().toISOString() : new Date(Date.now() + 2 * 60_000).toISOString(),
      locked_until: null,
      step_durations: { ...step_durations, total_ms },
    }).eq("id", job.id);

    return { status: failed ? "failed" : "retry", total_ms, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!hasValidCronSecret(req)) return json({ error: "Unauthorized" }, 401);

  const startMs = Date.now();
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: jobs, error } = await serviceClient.rpc("claim_dji_sync_jobs", { _limit: BATCH_SIZE });
    if (error) return json({ error: error.message }, 500);
    const claimed: Job[] = (jobs || []) as any;
    if (claimed.length === 0) return json({ ok: true, processed: 0, elapsed_ms: Date.now() - startMs });

    const results = [];
    for (const job of claimed) {
      try {
        const r = await processJob(serviceClient, job);
        results.push({ job_id: job.id, ...r });
      } catch (e) {
        console.error(`[worker] processJob crashed for ${job.id}:`, e);
        results.push({ job_id: job.id, status: "crash", error: String(e) });
      }
    }
    return json({
      ok: true,
      processed: claimed.length,
      done: results.filter((r) => r.status === "done").length,
      failed: results.filter((r) => r.status === "failed").length,
      retry: results.filter((r) => r.status === "retry").length,
      unsupported: results.filter((r) => r.status === "unsupported").length,
      rate_limited: results.filter((r) => r.status === "rate_limited").length,
      elapsed_ms: Date.now() - startMs,
      results,
    });
  } catch (e) {
    console.error("[dji-sync-worker] fatal:", e);
    return json({ error: "Internal", details: String(e) }, 500);
  }
});
