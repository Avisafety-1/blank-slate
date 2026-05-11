// dji-auto-sync (LEGACY WRAPPER)
//
// Heavy sync logic (login + list + per-log download/parse) has been moved to:
//   - dji-sync-enqueue  → adds new logs to dji_sync_jobs
//   - dji-sync-worker   → drains the queue with hard timeouts and retries
//
// This endpoint exists only for backward compatibility with old cron jobs,
// frontends, and manual sync buttons. It forwards every call to the queue.
//
// Body (unchanged):
//   {}                                 → enqueue for all auto-sync users (cron)
//   { userId, companyId? }             → enqueue for one user
//
// Auth (unchanged): cron secret OR JWT (caller must own userId).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Forward auth + cron secret unchanged so dji-sync-enqueue can apply
  // exactly the same authorization rules as before.
  const fwdHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: req.headers.get("Authorization") ?? `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) fwdHeaders["x-cron-secret"] = cronSecret;

  // Only userId is meaningful for the new queue. companyId is ignored
  // (the queue resolves company from the user's profile).
  const fwdBody = body?.userId ? { userId: body.userId } : {};

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/dji-sync-enqueue`, {
      method: "POST",
      headers: fwdHeaders,
      body: JSON.stringify(fwdBody),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return json({
      ok: res.ok,
      legacy_endpoint: true,
      forwarded_to: "dji-sync-enqueue",
      status: res.status,
      ...data,
    }, res.ok ? 200 : res.status);
  } catch (e) {
    console.error("[dji-auto-sync wrapper] forward failed:", e);
    return json({ ok: false, legacy_endpoint: true, error: String(e) }, 502);
  }
});
