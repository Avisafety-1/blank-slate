// dronelog-provision-keys
// Proactively mint a personal DroneLog API key for every user with stored DJI
// credentials that does not have one yet. This avoids falling back to shared
// company/global keys (and their shared rate limit) on first interactive login.
//
// Auth: cron secret only (no user-facing path).
// Body: { limit?: number }  → max users per run (default 10, max 50)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { hasValidCronSecret } from "../_shared/cron.ts";
import { provisionUserKey } from "../_shared/dronelog-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const PAUSE_MS = 750;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!hasValidCronSecret(req)) return json({ error: "Unauthorized" }, 401);

  const startMs = Date.now();
  const masterKey = Deno.env.get("DRONELOG_AVISAFE_KEY");
  if (!masterKey) return json({ error: "DRONELOG_AVISAFE_KEY missing" }, 500);

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let limit = DEFAULT_LIMIT;
    try {
      const body = await req.json();
      const n = Number(body?.limit);
      if (Number.isFinite(n) && n > 0) limit = Math.min(Math.floor(n), MAX_LIMIT);
    } catch { /* no body */ }

    // Candidates: stored DJI credentials without a legacy key.
    const { data: creds, error: credsErr } = await serviceClient
      .from("dji_credentials")
      .select("user_id, dji_email, company_id, dronelog_api_key_encrypted")
      .is("dronelog_api_key_encrypted", null)
      .limit(500);
    if (credsErr) return json({ error: credsErr.message }, 500);

    const candidates = (creds || []) as Array<{
      user_id: string;
      dji_email: string | null;
      company_id: string | null;
    }>;
    if (candidates.length === 0) {
      return json({ ok: true, provisioned: 0, remaining: 0, elapsed_ms: Date.now() - startMs });
    }

    // Exclude users that already have a standalone personal key.
    const { data: existing, error: existErr } = await serviceClient
      .from("user_dronelog_keys")
      .select("user_id")
      .in("user_id", candidates.map((c) => c.user_id));
    if (existErr) return json({ error: existErr.message }, 500);
    const have = new Set((existing || []).map((r: any) => r.user_id));

    const pending = candidates.filter((c) => !have.has(c.user_id));
    if (pending.length === 0) {
      return json({ ok: true, provisioned: 0, remaining: 0, elapsed_ms: Date.now() - startMs });
    }

    // Company names for readable key labels.
    const companyIds = [...new Set(pending.map((p) => p.company_id).filter(Boolean))] as string[];
    const companyNames = new Map<string, string>();
    if (companyIds.length > 0) {
      const { data: companies } = await serviceClient
        .from("companies")
        .select("id, navn")
        .in("id", companyIds);
      for (const c of (companies || []) as any[]) companyNames.set(c.id, c.navn);
    }

    const batch = pending.slice(0, limit);
    let provisioned = 0;
    let stoppedReason: string | null = null;

    for (const cred of batch) {
      const companyName = (cred.company_id && companyNames.get(cred.company_id)) || "Avisafe";
      const result = await provisionUserKey(serviceClient, {
        userId: cred.user_id,
        masterKey,
        name: `${companyName} – ${cred.dji_email ?? cred.user_id}`,
      });

      if (result.key) {
        provisioned++;
        console.log(`[provision-keys] ok user=${cred.user_id} company=${companyName}`);
      } else {
        console.warn(
          `[provision-keys] failed user=${cred.user_id} company=${companyName} status=${result.status} reason=${result.error}`,
        );
        if (result.status === 429 || result.error === "master_key_invalid") {
          stoppedReason = result.error === "master_key_invalid" ? "master_key_invalid" : "rate_limited";
          break;
        }
      }

      await sleep(PAUSE_MS);
    }

    return json({
      ok: true,
      provisioned,
      attempted: batch.length,
      remaining: Math.max(0, pending.length - provisioned),
      stopped: stoppedReason,
      elapsed_ms: Date.now() - startMs,
    });
  } catch (e) {
    console.error("[provision-keys] fatal:", e);
    return json({ error: "Internal", details: String(e) }, 500);
  }
});
