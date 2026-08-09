// Auto-sync user email to Resend Audience(s).
// Called by DB triggers on public.profiles (insert/update/delete).
// Syncs to a global audience and (optionally) to a per-company audience.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

const RESEND_BASE = "https://api.resend.com";

async function resendFetch(path: string, opts: RequestInit = {}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch(`${RESEND_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: json, raw: text };
}

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

type SyncOp = { audienceId: string; audienceName: string; status: number; action: string };

async function upsertContact(audienceId: string, email: string, first_name: string, last_name: string, prevEmail?: string): Promise<{ status: number; action: string }> {
  if (prevEmail && prevEmail !== email) {
    await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(prevEmail)}`, { method: "DELETE" });
  }

  // IMPORTANT: never send `unsubscribed` — a POST on an existing email is an
  // upsert in Resend and would re-subscribe someone who has opted out.
  const existing = await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`);
  if (existing.ok) {
    const patch = await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify({ first_name: first_name || "", last_name: last_name || "" }),
    });
    return { status: patch.status, action: "updated" };
  }

  const create = await resendFetch(`/audiences/${audienceId}/contacts`, {
    method: "POST",
    body: JSON.stringify({ email, first_name: first_name || "", last_name: last_name || "" }),
  });
  if (create.ok) return { status: create.status, action: "created" };
  if (create.status === 409) {
    const patch = await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify({ first_name: first_name || "", last_name: last_name || "" }),
    });
    return { status: patch.status, action: "updated" };
  }
  return { status: create.status, action: "failed" };
}

async function deleteContact(audienceId: string, email: string): Promise<{ status: number; action: string }> {
  const r = await resendFetch(`/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`, { method: "DELETE" });
  return { status: r.status, action: "deleted" };
}

/** Look up the per-company audience for a user. Lazily creates the Resend audience. */
async function resolveCompanyAudience(userId: string | undefined): Promise<{ audienceId: string; audienceName: string } | null> {
  if (!userId) return null;
  const admin = getAdminClient();

  const { data: profile } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (!profile?.company_id) return null;

  const { data: rootRes } = await admin.rpc("get_root_company_id", { _company_id: profile.company_id });
  const rootId: string | null = (rootRes as string | null) ?? profile.company_id;
  if (!rootId) return null;

  const { data: row } = await admin
    .from("resend_company_audiences")
    .select("audience_id, audience_name, enabled")
    .eq("company_id", rootId)
    .maybeSingle();

  if (!row || !row.enabled) return null;

  let audienceId = row.audience_id as string | null;
  if (!audienceId) {
    const created = await resendFetch("/audiences", {
      method: "POST",
      body: JSON.stringify({ name: row.audience_name }),
    });
    if (!created.ok || !(created.body as { id?: string })?.id) {
      console.error("Failed to create Resend audience", row.audience_name, created.status, created.raw);
      return null;
    }
    audienceId = (created.body as { id: string }).id;
    await admin.from("resend_company_audiences").update({ audience_id: audienceId }).eq("company_id", rootId);
  }

  return { audienceId, audienceName: row.audience_name };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const audienceId = Deno.env.get("RESEND_AUDIENCE_ID");
    if (!audienceId) throw new Error("RESEND_AUDIENCE_ID not configured");

    // Auth: shared secret OR service-role bearer
    const expectedSecret = Deno.env.get("SYNC_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-sync-secret");
    if (expectedSecret && providedSecret !== expectedSecret) {
      const auth = req.headers.get("authorization") ?? "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!serviceKey || !auth.includes(serviceKey)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const { action, email, first_name, last_name, old_email, user_id } = body as {
      action: "upsert" | "delete";
      email?: string;
      first_name?: string;
      last_name?: string;
      old_email?: string;
      user_id?: string;
    };

    const norm = (e?: string) => (e || "").trim().toLowerCase();
    const newEmail = norm(email);
    const prevEmail = norm(old_email);

    const ops: SyncOp[] = [];
    const companyAudience = await resolveCompanyAudience(user_id);

    if (action === "delete") {
      if (!newEmail) return new Response(JSON.stringify({ skipped: "no email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const g = await deleteContact(audienceId, newEmail);
      ops.push({ audienceId, audienceName: "global", ...g });
      if (companyAudience) {
        const c = await deleteContact(companyAudience.audienceId, newEmail);
        ops.push({ audienceId: companyAudience.audienceId, audienceName: companyAudience.audienceName, ...c });
      }
    } else if (action === "upsert") {
      if (!newEmail || !newEmail.includes("@")) {
        return new Response(JSON.stringify({ skipped: "invalid email" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const g = await upsertContact(audienceId, newEmail, first_name || "", last_name || "", prevEmail || undefined);
      ops.push({ audienceId, audienceName: "global", ...g });
      if (companyAudience) {
        const c = await upsertContact(companyAudience.audienceId, newEmail, first_name || "", last_name || "", prevEmail || undefined);
        ops.push({ audienceId: companyAudience.audienceId, audienceName: companyAudience.audienceName, ...c });
      }
    } else {
      return new Response(JSON.stringify({ error: "unknown action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("sync result", { email: newEmail, user_id, ops });
    return new Response(JSON.stringify({ email: newEmail, ops }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-user-to-resend-audience error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
