// dji-sync-enqueue
// Login + list logs per user, INSERT new ones into dji_sync_jobs.
// Heavy download/parse work happens in dji-sync-worker.
//
// Body:
//   {}                 → cron / full sweep (max 20 users, oldest last_sync_at first)
//   { userId: "..." }  → enqueue for one specific user
//
// Auth: cron secret OR JWT (caller must own userId).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { hasValidCronSecret } from "../_shared/cron.ts";
import {
  DRONELOG_BASE,
  TIMEOUTS,
  withTimeout,
  decryptPassword,
  normalizeDateToISO,
} from "../_shared/dji-parser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const MAX_USERS_PER_RUN = 20;
const STAGGER_MS = 500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface CredRow {
  user_id: string;
  dji_email: string;
  dji_password_encrypted: string;
  dji_account_id: string | null;
  last_sync_at: string | null;
  company_id: string | null;
}

async function enqueueForUser(
  serviceClient: any,
  cred: CredRow,
): Promise<{ user_id: string; jobs_added: number; skipped: number; error?: string }> {
  // Resolve company: prefer the company pinned on the credential (set when the user
  // saved their DJI login). Fall back to profile.company_id only if not yet pinned.
  // This prevents superadmins who have switched active company from causing logs
  // to be assigned to the wrong company during a cron run.
  let resolvedCompanyId = cred.company_id;
  if (!resolvedCompanyId) {
    const { data: profile } = await serviceClient
      .from("profiles").select("company_id").eq("id", cred.user_id).maybeSingle();
    resolvedCompanyId = profile?.company_id || null;
    if (resolvedCompanyId) {
      // Backfill so future runs are stable
      await serviceClient.from("dji_credentials")
        .update({ company_id: resolvedCompanyId })
        .eq("user_id", cred.user_id);
    }
  }
  if (!resolvedCompanyId) return { user_id: cred.user_id, jobs_added: 0, skipped: 0, error: "no company pinned" };

  const { data: company } = await serviceClient
    .from("companies")
    .select("id, navn, dronelog_api_key, dji_sync_from_date, dji_flightlog_enabled")
    .eq("id", resolvedCompanyId).maybeSingle();
  if (!company || !company.dji_flightlog_enabled) {
    return { user_id: cred.user_id, jobs_added: 0, skipped: 0, error: "dji not enabled" };
  }
  const dronelogKey = company.dronelog_api_key || Deno.env.get("DRONELOG_AVISAFE_KEY");
  if (!dronelogKey) return { user_id: cred.user_id, jobs_added: 0, skipped: 0, error: "no dronelog key" };

  // Login
  let accountId = cred.dji_account_id;
  try {
    const password = await decryptPassword(cred.dji_password_encrypted);
    const t = withTimeout(TIMEOUTS.login);
    let loginRes: Response;
    try {
      loginRes = await fetch(`${DRONELOG_BASE}/accounts/dji`, {
        method: "POST",
        headers: { Authorization: `Bearer ${dronelogKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: cred.dji_email, password }),
        signal: t.signal,
      });
    } finally { t.clear(); }
    if (!loginRes.ok) {
      const errBody = await loginRes.text().catch(() => "");
      return { user_id: cred.user_id, jobs_added: 0, skipped: 0, error: `login ${loginRes.status}: ${errBody.slice(0, 120)}` };
    }
    const loginData = await loginRes.json();
    accountId = loginData.result?.djiAccountId || loginData.result?.id || loginData.result?.accountId || accountId;
  } catch (e) {
    return { user_id: cred.user_id, jobs_added: 0, skipped: 0, error: `login exception: ${(e as Error).message}` };
  }
  if (!accountId) return { user_id: cred.user_id, jobs_added: 0, skipped: 0, error: "no accountId" };

  // List logs (cap at 200)
  let logs: any[] = [];
  try {
    const t = withTimeout(TIMEOUTS.list);
    let listRes: Response;
    try {
      listRes = await fetch(`${DRONELOG_BASE}/logs/${accountId}?limit=200`, {
        headers: { Authorization: `Bearer ${dronelogKey}`, Accept: "application/json" },
        signal: t.signal,
      });
    } finally { t.clear(); }
    if (!listRes.ok) {
      const txt = await listRes.text().catch(() => "");
      return { user_id: cred.user_id, jobs_added: 0, skipped: 0, error: `list ${listRes.status}: ${txt.slice(0, 120)}` };
    }
    const listData = await listRes.json();
    logs = listData.result?.logs || listData.result || [];
  } catch (e) {
    return { user_id: cred.user_id, jobs_added: 0, skipped: 0, error: `list exception: ${(e as Error).message}` };
  }
  if (!Array.isArray(logs)) logs = [];

  const syncFromDate = company.dji_sync_from_date ? new Date(company.dji_sync_from_date) : null;
  let jobs_added = 0;
  let skipped = 0;

  for (const log of logs) {
    const logId = log.id || log.logId;
    if (!logId) { skipped++; continue; }
    if (syncFromDate && log.date) {
      const d = new Date(log.date);
      if (d < syncFromDate) { skipped++; continue; }
    }
    const dji_log_id = String(logId);

    // Skip if already in pending_dji_logs (legacy) or dji_sync_jobs (new)
    const { data: existingPending } = await serviceClient
      .from("pending_dji_logs").select("id")
      .eq("company_id", company.id).eq("dji_log_id", dji_log_id).maybeSingle();
    if (existingPending) { skipped++; continue; }

    const { data: existingJob } = await serviceClient
      .from("dji_sync_jobs").select("id")
      .eq("company_id", company.id)
      .eq("user_id", cred.user_id)
      .eq("dji_log_id", dji_log_id).maybeSingle();
    if (existingJob) { skipped++; continue; }

    const { error: insErr } = await serviceClient.from("dji_sync_jobs").insert({
      company_id: company.id,
      user_id: cred.user_id,
      dji_log_id,
      download_url: log.downloadUrl || null,
      payload: {
        dronelog_account_id: accountId,
        aircraft_name_hint: log.aircraft || null,
        log_date: normalizeDateToISO(log.date),
        list_duration: log.duration ?? null,
      },
    });
    if (insErr) {
      if ((insErr as any).code === "23505") { skipped++; continue; }
      console.error(`[enqueue] insert failed for ${dji_log_id}:`, insErr.message);
      skipped++;
    } else {
      jobs_added++;
    }
  }

  await serviceClient
    .from("dji_credentials").update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", cred.user_id);

  return { user_id: cred.user_id, jobs_added, skipped };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startMs = Date.now();
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let userId: string | null = null;
    try {
      const body = await req.json();
      userId = body?.userId || null;
    } catch { /* no body */ }

    const cronOk = hasValidCronSecret(req);
    if (!cronOk) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
      const callerId = claims.claims.sub as string;
      if (userId && userId !== callerId) return json({ error: "Forbidden" }, 403);
      if (!userId) userId = callerId; // self-sync
    }

    // Resolve credentials list
    let credsQuery = serviceClient
      .from("dji_credentials")
      .select("user_id, dji_email, dji_password_encrypted, dji_account_id, last_sync_at, company_id");
    if (userId) credsQuery = credsQuery.eq("user_id", userId);
    else credsQuery = credsQuery.eq("auto_sync_enabled", true)
      .order("last_sync_at", { ascending: true, nullsFirst: true })
      .limit(MAX_USERS_PER_RUN);

    const { data: creds, error: credsErr } = await credsQuery;
    if (credsErr) return json({ error: credsErr.message }, 500);
    const credList: CredRow[] = (creds || []) as any;
    if (credList.length === 0) {
      return json({ ok: true, users_processed: 0, jobs_added: 0, skipped: 0, elapsed_ms: Date.now() - startMs });
    }

    const results: Array<Awaited<ReturnType<typeof enqueueForUser>>> = [];
    let totalAdded = 0, totalSkipped = 0;
    for (let i = 0; i < credList.length; i++) {
      const r = await enqueueForUser(serviceClient, credList[i]);
      results.push(r);
      totalAdded += r.jobs_added;
      totalSkipped += r.skipped;
      if (i + 1 < credList.length) await new Promise((res) => setTimeout(res, STAGGER_MS));
    }

    return json({
      ok: true,
      users_processed: credList.length,
      jobs_added: totalAdded,
      skipped: totalSkipped,
      elapsed_ms: Date.now() - startMs,
      per_user: results,
    });
  } catch (e) {
    console.error("[dji-sync-enqueue] fatal:", e);
    return json({ error: "Internal", details: String(e) }, 500);
  }
});
