import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const NEWSLETTER_AUDIENCE_NAME = "AviSafe Nyhetsbrev";
const NEWSLETTER_CONFIG_KEY = "resend_newsletter_audience_id";

/**
 * Newsletter subscribers live in their OWN Resend audience, separate from the
 * app-user audience (RESEND_AUDIENCE_ID). This keeps external signups safe when
 * we prune deleted users from the user audience.
 */
async function getAudienceId(): Promise<string> {
  const fromEnv = Deno.env.get("RESEND_NEWSLETTER_AUDIENCE_ID");
  if (fromEnv) return fromEnv;

  const admin = getAdminClient();
  const { data: cfg } = await admin
    .from("app_config")
    .select("value")
    .eq("key", NEWSLETTER_CONFIG_KEY)
    .maybeSingle();
  if (cfg?.value) return cfg.value as string;

  // Find existing audience by name, otherwise create it.
  let audienceId: string | undefined;
  const list = await resendFetch("/audiences");
  const match = (list?.data ?? []).find(
    (a: { id: string; name: string }) => a.name === NEWSLETTER_AUDIENCE_NAME,
  );
  if (match?.id) {
    audienceId = match.id;
  } else {
    const created = await resendFetch("/audiences", {
      method: "POST",
      body: JSON.stringify({ name: NEWSLETTER_AUDIENCE_NAME }),
    });
    audienceId = created?.id;
  }
  if (!audienceId) throw new Error("Could not resolve newsletter audience");

  await admin.from("app_config").upsert({ key: NEWSLETTER_CONFIG_KEY, value: audienceId });
  return audienceId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;
    const audienceId = await getAudienceId();

    // Public action — no auth required
    if (action === "public-subscribe") {
      const { email, first_name, last_name } = body;
      if (!email || typeof email !== "string" || !email.includes("@")) {
        throw new Error("Ugyldig e-postadresse");
      }
      // Ikke send `unsubscribed` – POST er en upsert i Resend og ville
      // re-abonnert noen som har meldt seg av.
      const result = await resendFetch(`/audiences/${audienceId}/contacts`, {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          first_name: first_name || "",
          last_name: last_name || "",
        }),
      });
      return new Response(JSON.stringify({ ok: true, data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other actions require superadmin auth
    const authHeader = req.headers.get("authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: roleData } = await getAdminClient()
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "superadmin")
      .maybeSingle();

    if (!roleData) throw new Error("Forbidden: superadmin required");

    let result: unknown;

    switch (action) {
      case "list-contacts": {
        result = await resendFetch(`/audiences/${audienceId}/contacts`);
        break;
      }
      case "add-contact": {
        const { email, first_name, last_name } = body;
        result = await resendFetch(`/audiences/${audienceId}/contacts`, {
          method: "POST",
          body: JSON.stringify({ email, first_name: first_name || "", last_name: last_name || "" }),
        });
        break;
      }
      case "remove-contact": {
        const { contact_id } = body;
        result = await resendFetch(`/audiences/${audienceId}/contacts/${contact_id}`, {
          method: "DELETE",
        });
        break;
      }
      case "import-contacts": {
        const { emails } = body;
        const results: unknown[] = [];
        for (const email of emails) {
          try {
            const r = await resendFetch(`/audiences/${audienceId}/contacts`, {
              method: "POST",
              body: JSON.stringify({ email }),
            });
            results.push({ email, ok: true, data: r });
          } catch (e) {
            results.push({ email, ok: false, error: (e as Error).message });
          }
        }
        result = { imported: results };
        break;
      }
      case "create-broadcast": {
        const { subject, html, from_name } = body;
        const broadcast = await resendFetch("/broadcasts", {
          method: "POST",
          body: JSON.stringify({
            audience_id: audienceId,
            from: `${from_name || "AviSafe"} <noreply@avisafe.no>`,
            subject,
            html,
          }),
        });
        await getAdminClient().from("newsletter_broadcasts").insert({
          subject,
          html_content: html,
          resend_broadcast_id: broadcast.id,
          status: "draft",
          created_by: user.id,
        });
        result = broadcast;
        break;
      }
      case "send-broadcast": {
        const { broadcast_id } = body;
        result = await resendFetch(`/broadcasts/${broadcast_id}/send`, {
          method: "POST",
        });
        await getAdminClient()
          .from("newsletter_broadcasts")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("resend_broadcast_id", broadcast_id);
        break;
      }
      case "list-broadcasts": {
        const { data } = await getAdminClient()
          .from("newsletter_broadcasts")
          .select("*")
          .order("created_at", { ascending: false });
        result = data;
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result ?? { ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
