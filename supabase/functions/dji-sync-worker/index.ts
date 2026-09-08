// dji-sync-worker
// Claims up to BATCH_SIZE jobs from dji_sync_jobs, downloads + parses each,
// and writes results into pending_dji_logs. Runs every few minutes via pg_cron
// during the sync window.
//
// Auth: cron secret ONLY. No user-facing entrypoint.
// The per-job logic lives in ../_shared/dji-sync-job.ts and is shared with
// dji-sync-now (the user-triggered "Sync nå" button).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { hasValidCronSecret } from "../_shared/cron.ts";
import { processJob, type SyncJob } from "../_shared/dji-sync-job.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Start small. Bump to 3/5 once we've validated step_durations on >100 jobs.
const BATCH_SIZE = 2;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    const claimed: SyncJob[] = (jobs || []) as any;
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
      duplicate: results.filter((r) => r.status === "duplicate").length,
      rate_limited: results.filter((r) => r.status === "rate_limited").length,
      elapsed_ms: Date.now() - startMs,
      results,
    });
  } catch (e) {
    console.error("[dji-sync-worker] fatal:", e);
    return json({ error: "Internal", details: String(e) }, 500);
  }
});
