// ardupilot-sync-worker
// Claims up to BATCH_SIZE jobs from ardupilot_parse_jobs, downloads each file
// from Storage, calls the Fly.io ArduPilot parser, normalizes the result, and
// inserts a row into pending_dji_logs (source_file_type='ardupilot') so it
// shows up in the existing "ventende flylogger fra auto-sync" UI.
//
// Auth: cron secret ONLY. Never invoked directly from the browser.
//
// Storage retention: we do NOT delete the source file here. A separate
// cleanup job can remove old objects from flight-logs once we trust the
// queue pipeline end-to-end.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { hasValidCronSecret } from "../_shared/cron.ts";
import {
  callArdupilotParser,
  extractBinBytes,
  normalizeToUnified,
  sanitizeResult,
} from "../_shared/ardupilot-normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BATCH_SIZE = 2;
const MAX_ATTEMPTS = 3;

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
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  attempts: number;
}

async function processJob(service: any, job: Job) {
  const t0 = Date.now();
  const step: Record<string, number> = {};

  try {
    // 1. Download from storage
    const dlStart = Date.now();
    const { data: fileBlob, error: dlErr } = await service.storage
      .from(job.storage_bucket).download(job.storage_path);
    if (dlErr || !fileBlob) throw new Error(`download failed: ${dlErr?.message ?? "no blob"}`);
    const fileBytes = new Uint8Array(await fileBlob.arrayBuffer());
    step.download_ms = Date.now() - dlStart;

    // 2. Unzip if needed
    const unzipStart = Date.now();
    const fileName = job.original_filename ?? job.storage_path.split("/").pop() ?? "flight.bin";
    const binBytes = await extractBinBytes(fileBytes, fileName);
    step.unzip_ms = Date.now() - unzipStart;

    // 3. Call Fly.io parser
    const parserStart = Date.now();
    const rawData = await callArdupilotParser(binBytes);
    step.parser_ms = Date.now() - parserStart;

    // 4. Normalize
    const normStart = Date.now();
    const parsed = sanitizeResult(normalizeToUnified(rawData));
    step.normalize_ms = Date.now() - normStart;

    // 5. Insert pending_dji_logs row (source='ardupilot')
    const insStart = Date.now();
    // Use storage_path as synthetic dji_log_id (unique per file in company)
    const syntheticLogId = `ardu:${job.storage_path}`;
    const { data: pendingRow, error: insErr } = await service
      .from("pending_dji_logs")
      .insert({
        company_id: job.company_id,
        user_id: job.user_id,
        dji_log_id: syntheticLogId,
        aircraft_name: parsed.aircraftName ?? null,
        aircraft_sn: parsed.aircraftSN ?? null,
        flight_date: parsed.startTime ?? null,
        duration_seconds: Math.round(parsed.totalTimeSeconds ?? 0),
        max_height_m: parsed.maxAltitude ?? null,
        total_distance_m: parsed.totalDistance ?? null,
        parsed_result: parsed as any,
        status: "pending",
        source_file_type: "ardupilot",
      })
      .select("id").maybeSingle();
    step.insert_pending_ms = Date.now() - insStart;

    let pendingId: string | null = pendingRow?.id ?? null;
    if (insErr) {
      if ((insErr as any).code === "23505") {
        // Duplicate -> look it up so we still link the job
        const { data: existing } = await service
          .from("pending_dji_logs").select("id")
          .eq("company_id", job.company_id).eq("dji_log_id", syntheticLogId).maybeSingle();
        pendingId = existing?.id ?? null;
      } else {
        throw insErr;
      }
    }

    const total_ms = Date.now() - t0;
    await service.from("ardupilot_parse_jobs").update({
      status: "done",
      last_error: null,
      last_error_at: null,
      locked_until: null,
      pending_log_id: pendingId,
      step_durations: { ...step, total_ms },
    }).eq("id", job.id);

    console.log(`[ardu-worker] job ${job.id} done in ${total_ms}ms`, step);
    return { status: "done", total_ms };
  } catch (err: any) {
    const total_ms = Date.now() - t0;
    const msg = err?.message ?? String(err);
    const failed = job.attempts >= MAX_ATTEMPTS;
    await service.from("ardupilot_parse_jobs").update({
      status: failed ? "failed" : "queued",
      last_error: msg.slice(0, 800),
      last_error_at: new Date().toISOString(),
      scheduled_at: failed ? new Date().toISOString() : new Date(Date.now() + 60_000).toISOString(),
      locked_until: null,
      step_durations: { ...step, total_ms },
    }).eq("id", job.id);
    console.error(`[ardu-worker] job ${job.id} ${failed ? "failed" : "retry"}: ${msg}`);
    return { status: failed ? "failed" : "retry", total_ms, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!hasValidCronSecret(req)) return json({ error: "Unauthorized" }, 401);

  const startMs = Date.now();
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: jobs, error } = await service.rpc("claim_ardupilot_parse_jobs", { _limit: BATCH_SIZE });
    if (error) return json({ error: error.message }, 500);
    const claimed: Job[] = (jobs || []) as any;
    if (claimed.length === 0) {
      return json({ ok: true, processed: 0, elapsed_ms: Date.now() - startMs });
    }

    const results = [];
    for (const job of claimed) {
      try {
        results.push({ job_id: job.id, ...(await processJob(service, job)) });
      } catch (e) {
        console.error(`[ardu-worker] processJob crashed for ${job.id}:`, e);
        results.push({ job_id: job.id, status: "crash", error: String(e) });
      }
    }
    return json({
      ok: true,
      processed: claimed.length,
      done: results.filter((r) => r.status === "done").length,
      failed: results.filter((r) => r.status === "failed").length,
      retry: results.filter((r) => r.status === "retry").length,
      elapsed_ms: Date.now() - startMs,
      results,
    });
  } catch (e) {
    console.error("[ardu-worker] fatal:", e);
    return json({ error: "Internal", details: String(e) }, 500);
  }
});
