// ardupilot-enqueue
// Frontend uploads the .bin/.zip to Supabase Storage at
//   flight-logs/{company_id}/ardupilot/{user_id}/{ts}-{random}-{filename}
// and then POSTs { storage_path, original_filename?, file_size_bytes?, content_type? } here.
//
// This function:
//   - Authenticates the caller via JWT
//   - Resolves company_id from the user's profile (NOT trusted from client)
//   - Verifies the storage path starts with a company the user can write to
//   - Verifies the object exists in the flight-logs bucket
//   - Inserts a row into ardupilot_parse_jobs (status='queued')
//   - Fire-and-forget triggers ardupilot-sync-worker (non-blocking)
//
// Returns: { ok: true, job_id, status }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => null) as
      | { storage_path?: string; original_filename?: string; file_size_bytes?: number; content_type?: string }
      | null;
    if (!body?.storage_path || typeof body.storage_path !== "string") {
      return json({ error: "storage_path required" }, 400);
    }
    const storagePath = body.storage_path.trim();
    if (storagePath.length === 0 || storagePath.length > 1024) {
      return json({ error: "invalid storage_path" }, 400);
    }
    if (storagePath.includes("..")) return json({ error: "invalid storage_path" }, 400);

    const lower = storagePath.toLowerCase();
    if (!lower.endsWith(".bin") && !lower.endsWith(".zip")) {
      return json({ error: "Only .bin or .zip are supported" }, 400);
    }

    const service = createClient(supabaseUrl, serviceKey);

    // Resolve company server-side
    const { data: profile, error: profileErr } = await service
      .from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    if (profileErr || !profile?.company_id) {
      return json({ error: "No company on profile" }, 400);
    }
    const companyId = profile.company_id as string;

    // The path's first folder MUST be a company visible to the user
    const firstSeg = storagePath.split("/")[0];
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(firstSeg)) return json({ error: "storage_path must start with company_id" }, 400);

    const { data: visible, error: visErr } = await service.rpc(
      "get_user_visible_company_ids",
      { _user_id: user.id },
    );
    if (visErr) return json({ error: visErr.message }, 500);
    const visibleIds: string[] = (visible as any[])?.map(String) || [];
    if (!visibleIds.includes(firstSeg)) {
      return json({ error: "Forbidden: path not in your company tree" }, 403);
    }
    // Force company_id to the path's company (matches RLS upload check)
    const pathCompanyId = firstSeg;

    // Verify object exists
    const { data: signed, error: signErr } = await service.storage
      .from("flight-logs").createSignedUrl(storagePath, 60);
    if (signErr || !signed?.signedUrl) {
      return json({ error: `File not found in storage: ${storagePath}` }, 404);
    }

    // Synthetic dji_log_id used by the worker when it later inserts into pending_dji_logs
    const syntheticLogId = `ardu:${storagePath}`;

    // Idempotency: same storage_path -> return existing job
    const { data: existing } = await service
      .from("ardupilot_parse_jobs").select("id, status")
      .eq("storage_path", storagePath).eq("company_id", pathCompanyId).maybeSingle();
    if (existing?.id) {
      // Try fire-and-forget worker anyway (no await)
      triggerWorker(supabaseUrl);
      return json({ ok: true, job_id: existing.id, status: existing.status, existed: true, synthetic_log_id: syntheticLogId });
    }

    const { data: inserted, error: insErr } = await service
      .from("ardupilot_parse_jobs")
      .insert({
        company_id: pathCompanyId,
        user_id: user.id,
        storage_bucket: "flight-logs",
        storage_path: storagePath,
        original_filename: body.original_filename ?? null,
        file_size_bytes: body.file_size_bytes ?? null,
        content_type: body.content_type ?? null,
        status: "queued",
      })
      .select("id, status").single();
    if (insErr) return json({ error: insErr.message }, 500);

    triggerWorker(supabaseUrl);

    return json({ ok: true, job_id: inserted.id, status: inserted.status, synthetic_log_id: syntheticLogId });
  } catch (e) {
    console.error("[ardupilot-enqueue] fatal:", e);
    return json({ error: "Internal", details: String(e) }, 500);
  }
});

function triggerWorker(supabaseUrl: string) {
  // Fire-and-forget. Not awaited, errors logged only.
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  if (!cronSecret) {
    console.warn("[ardupilot-enqueue] CRON_SHARED_SECRET missing — cannot trigger worker immediately; cron will pick it up.");
    return;
  }
  fetch(`${supabaseUrl}/functions/v1/ardupilot-sync-worker`, {
    method: "POST",
    headers: {
      "x-cron-secret": cronSecret,
      "Content-Type": "application/json",
    },
    body: "{}",
  }).catch((err) => console.warn("[ardupilot-enqueue] worker trigger failed:", err?.message ?? err));
}

