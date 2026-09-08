// dji-sync-now
// User-triggered "Sync nå": enqueues new logs for the calling user (same dedupe
// logic as the nightly cron) and immediately processes a couple of them.
//
// The frontend calls this repeatedly (round 1 with enqueue=true) until
// remaining === 0, a rate limit is hit, or the per-press cap is reached.
//
// Auth: JWT only — the caller can only sync their own DJI account.
//
// Body: { enqueue?: boolean, limit?: number }
// Returns: { ok, jobs_added, processed, done, failed, unsupported, duplicate,
//            rate_limited, remaining, error? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { processJob, type SyncJob } from "../_shared/dji-sync-job.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Two logs per call keeps each invocation well inside the edge runtime budget.
const JOBS_PER_CALL = 2;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startMs = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await serviceClient.auth.getUser(token);
    const userId = userData?.user?.id;
    if (authErr || !userId) return json({ error: "Unauthorized" }, 401);

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    const wantEnqueue = body?.enqueue !== false;
    const limit = Math.min(Math.max(Number(body?.limit) || JOBS_PER_CALL, 1), 3);

    let jobs_added = 0;
    let enqueue_error: string | null = null;

    // Step 1 — refresh the queue from DJI (only on the first round).
    if (wantEnqueue) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/dji-sync-enqueue`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey,
          },
          body: JSON.stringify({ userId }),
        });
        const data = await res.json().catch(() => ({}));
        jobs_added = Number(data?.jobs_added ?? 0);
        const perUserErr = data?.per_user?.[0]?.error;
        if (!res.ok) enqueue_error = data?.error || `enqueue ${res.status}`;
        else if (perUserErr) enqueue_error = perUserErr;
      } catch (e) {
        enqueue_error = String(e);
      }
    }

    // Step 2 — process a couple of this user's queued jobs right now.
    const { data: jobs, error: claimErr } = await serviceClient
      .rpc("claim_dji_sync_jobs_for_user", { _user_id: userId, _limit: limit });
    if (claimErr) return json({ ok: false, jobs_added, error: claimErr.message }, 500);

    const claimed: SyncJob[] = (jobs || []) as any;
    const results: Array<{ job_id: string; status: string; error?: string }> = [];
    for (const job of claimed) {
      try {
        const r = await processJob(serviceClient, job);
        results.push({ job_id: job.id, ...r });
      } catch (e) {
        console.error(`[dji-sync-now] processJob crashed for ${job.id}:`, e);
        results.push({ job_id: job.id, status: "crash", error: String(e) });
      }
    }

    // Remaining work still waiting for this user.
    const { count } = await serviceClient
      .from("dji_sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "queued")
      .lt("attempts", 5);

    const rate_limited = results.some((r) => r.status === "rate_limited");

    return json({
      ok: true,
      jobs_added,
      enqueue_error,
      processed: claimed.length,
      done: results.filter((r) => r.status === "done").length,
      duplicate: results.filter((r) => r.status === "duplicate").length,
      failed: results.filter((r) => r.status === "failed").length,
      retry: results.filter((r) => r.status === "retry").length,
      unsupported: results.filter((r) => r.status === "unsupported").length,
      rate_limited,
      remaining: count ?? 0,
      elapsed_ms: Date.now() - startMs,
      results,
    });
  } catch (e) {
    console.error("[dji-sync-now] fatal:", e);
    return json({ ok: false, error: "Internal", details: String(e) }, 500);
  }
});
