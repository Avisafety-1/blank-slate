// Backfill all profile emails to Resend Audiences (global + per-company). Superadmin only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const RESEND_BASE = "https://api.resend.com";
async function resendFetch(path: string, opts: RequestInit = {}) {
  const apiKey = Deno.env.get("RESEND_API_KEY")!;
  const res = await fetch(`${RESEND_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: json };
}

async function syncOne(audienceId: string, email: string, first_name: string, last_name: string) {
  // Never send `unsubscribed` — POST is an upsert in Resend and would
  // re-subscribe contacts who have opted out. Update existing contacts only.
  const existing = await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`);
  if (existing.ok) {
    const patch = await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify({ first_name, last_name }),
    });
    return patch.ok ? "updated" : "failed";
  }

  const r = await resendFetch(`/audiences/${audienceId}/contacts`, {
    method: "POST",
    body: JSON.stringify({ email, first_name, last_name }),
  });
  if (r.ok) return "added";
  if (r.status === 409) {
    const patch = await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify({ first_name, last_name }),
    });
    return patch.ok ? "updated" : "failed";
  }
  return "failed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const globalAudienceId = Deno.env.get("RESEND_AUDIENCE_ID");
    if (!globalAudienceId) throw new Error("RESEND_AUDIENCE_ID not configured");

    // Auth: superadmin only
    const authHeader = req.headers.get("authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const admin = getAdminClient();
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "superadmin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: superadmin required");

    // Load all profiles with email + company_id
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, email, full_name, company_id")
      .not("email", "is", null);
    if (error) throw error;

    // Pre-resolve root company for each profile
    const rootByProfile = new Map<string, string>();
    for (const p of profiles ?? []) {
      if (!p.company_id) continue;
      const { data: rootRes } = await admin.rpc("get_root_company_id", { _company_id: p.company_id });
      if (rootRes) rootByProfile.set(p.id, rootRes as string);
    }

    // Load company audiences and lazily create on Resend if missing
    const { data: companyAudiences } = await admin
      .from("resend_company_audiences")
      .select("company_id, audience_id, audience_name, enabled")
      .eq("enabled", true);

    const audienceByCompany = new Map<string, { audienceId: string; audienceName: string }>();
    for (const ca of companyAudiences ?? []) {
      let aid = ca.audience_id as string | null;
      if (!aid) {
        const created = await resendFetch("/audiences", { method: "POST", body: JSON.stringify({ name: ca.audience_name }) });
        if (created.ok && (created.body as { id?: string })?.id) {
          aid = (created.body as { id: string }).id;
          await admin.from("resend_company_audiences").update({ audience_id: aid }).eq("company_id", ca.company_id);
        } else {
          continue;
        }
      }
      audienceByCompany.set(ca.company_id as string, { audienceId: aid!, audienceName: ca.audience_name as string });
    }

    const stats: Record<string, { added: number; updated: number; failed: number }> = {
      global: { added: 0, updated: 0, failed: 0 },
    };
    for (const a of audienceByCompany.values()) stats[a.audienceName] = { added: 0, updated: 0, failed: 0 };

    let total = 0, skipped = 0;

    for (const p of profiles ?? []) {
      total++;
      const email = (p.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) { skipped++; continue; }
      const fullName = (p.full_name || "").trim();
      const [first_name, ...rest] = fullName.split(" ");
      const last_name = rest.join(" ");

      // Global audience
      try {
        const r = await syncOne(globalAudienceId, email, first_name || "", last_name || "");
        const k = r as "added" | "updated" | "failed";
        stats.global[k]++;
      } catch { stats.global.failed++; }

      // Company audience
      const root = rootByProfile.get(p.id);
      const ca = root ? audienceByCompany.get(root) : null;
      if (ca) {
        try {
          const r = await syncOne(ca.audienceId, email, first_name || "", last_name || "");
          const k = r as "added" | "updated" | "failed";
          stats[ca.audienceName][k]++;
        } catch { stats[ca.audienceName].failed++; }
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    return new Response(JSON.stringify({ total, skipped, audiences: stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("backfill-resend-audience error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
