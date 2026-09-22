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

/** Run an async worker over items with bounded concurrency. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try { await worker(item); } catch { /* collected by caller */ }
    }
  });
  await Promise.all(runners);
}

async function listAllContacts(audienceId: string) {
  const r = await resendFetch(`/audiences/${audienceId}/contacts`);
  if (!r.ok) return [];
  return ((r.body as { data?: Array<{ id: string; email: string; first_name?: string; last_name?: string; unsubscribed?: boolean }> })?.data) ?? [];
}

/**
 * Split + prune:
 *  - Contacts in the user audience with no profile and no deletion record are
 *    treated as pure newsletter signups → copied to the newsletter audience.
 *  - Contacts with no profile are then removed from the user audience.
 * The newsletter audience itself is never pruned.
 */
async function splitAndPrune(
  admin: ReturnType<typeof getAdminClient>,
  userAudienceId: string,
  newsletterAudienceId: string | null,
) {
  const { data: profileRows } = await admin.from("profiles").select("email").not("email", "is", null);
  const profileEmails = new Set((profileRows ?? []).map((p) => (p.email as string).trim().toLowerCase()));

  const { data: deletedRows } = await admin.rpc("get_deleted_user_emails");
  const deletedEmails = new Set(
    (deletedRows ?? []).map((r: unknown) =>
      String(typeof r === "string" ? r : (r as { email?: string }).email ?? "").trim().toLowerCase(),
    ),
  );

  const contacts = await listAllContacts(userAudienceId);
  const movedToNewsletter: string[] = [];
  const removedFromUsers: string[] = [];
  const failed: string[] = [];

  const targets = contacts.filter((c) => {
    const email = (c.email || "").trim().toLowerCase();
    return !!email && !profileEmails.has(email);
  });

  await runPool(targets, 6, async (c) => {
    const email = (c.email || "").trim().toLowerCase();
    const isFormerUser = deletedEmails.has(email);
    if (!isFormerUser && newsletterAudienceId) {
      const r = await syncOne(newsletterAudienceId, email, c.first_name || "", c.last_name || "");
      if (r === "failed") { failed.push(email); return; }
      movedToNewsletter.push(email);
    }

    const del = await resendFetch(`/audiences/${userAudienceId}/contacts/${encodeURIComponent(email)}`, { method: "DELETE" });
    if (del.ok) removedFromUsers.push(email); else failed.push(email);
  });

  return { movedToNewsletter, removedFromUsers, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const globalAudienceId = Deno.env.get("RESEND_AUDIENCE_ID");
    if (!globalAudienceId) throw new Error("RESEND_AUDIENCE_ID not configured");

    const admin = getAdminClient();

    // Auth: superadmin, service-role bearer, or the shared maintenance secret
    const authHeader = req.headers.get("authorization") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceRole = !!serviceKey && authHeader.includes(serviceKey);

    if (!isServiceRole) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "superadmin")
        .maybeSingle();
      if (!roleRow) throw new Error("Forbidden: superadmin required");
    }

    const reqBody = await req.json().catch(() => ({}));
    const mode = (reqBody as { mode?: string }).mode ?? "backfill";

    if (mode === "split") {
      const { data: cfg } = await admin
        .from("app_config")
        .select("value")
        .eq("key", "resend_newsletter_audience_id")
        .maybeSingle();
      const newsletterAudienceId =
        Deno.env.get("RESEND_NEWSLETTER_AUDIENCE_ID") ?? (cfg?.value as string | undefined) ?? null;

      const result = await splitAndPrune(admin, globalAudienceId, newsletterAudienceId);
      return new Response(JSON.stringify({ mode, newsletterAudienceId, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Load all profiles with email + company_id
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, email, full_name, company_id")
      .not("email", "is", null);
    if (error) throw error;

    // Pre-resolve root company once per distinct company (not per profile)
    const rootByCompany = new Map<string, string>();
    const companyIds = [...new Set((profiles ?? []).map((p) => p.company_id).filter(Boolean) as string[])];
    await runPool(companyIds, 8, async (cid) => {
      const { data: rootRes } = await admin.rpc("get_root_company_id", { _company_id: cid });
      if (rootRes) rootByCompany.set(cid, rootRes as string);
    });
    const rootByProfile = new Map<string, string>();
    for (const p of profiles ?? []) {
      const root = p.company_id ? rootByCompany.get(p.company_id) : undefined;
      if (root) rootByProfile.set(p.id, root);
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

    await runPool(profiles ?? [], 6, async (p) => {
      total++;
      const email = (p.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) { skipped++; return; }
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
    });

    // Always finish with a clean-up pass: former users are removed from the
    // user audience, and pure newsletter signups are preserved in their own list.
    const { data: nlCfg } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "resend_newsletter_audience_id")
      .maybeSingle();
    const newsletterAudienceId =
      Deno.env.get("RESEND_NEWSLETTER_AUDIENCE_ID") ?? (nlCfg?.value as string | undefined) ?? null;
    const cleanup = await splitAndPrune(admin, globalAudienceId, newsletterAudienceId);

    return new Response(JSON.stringify({ total, skipped, audiences: stats, cleanup }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("backfill-resend-audience error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
