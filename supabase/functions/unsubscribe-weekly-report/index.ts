import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const tokenParam = url.searchParams.get("token");
  if (!tokenParam) {
    return new Response("Mangler token", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // PT-14 fix: prefer per-user random UUID token (unforgeable, looked up in DB).
  // Backward-compat: still accept legacy base64(user_id:...) tokens for 30 days
  // so emails already in inboxes keep working. Remove fallback after 2026-06-09.
  let lookupColumn: "unsubscribe_token" | "id" = "unsubscribe_token";
  let lookupValue: string | null = null;

  if (UUID_RE.test(tokenParam)) {
    lookupValue = tokenParam.toLowerCase();
  } else {
    try {
      const decoded = atob(decodeURIComponent(tokenParam));
      const userId = decoded.split(":")[0];
      if (UUID_RE.test(userId)) {
        lookupColumn = "id";
        lookupValue = userId;
      }
    } catch { /* fall through */ }
  }

  if (!lookupValue) {
    return new Response("Ugyldig token", { status: 400, headers: corsHeaders });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ weekly_report_unsubscribed: true })
    .eq(lookupColumn, lookupValue);

  if (error) {
    return new Response(`Feil: ${error.message}`, { status: 500, headers: corsHeaders });
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Avmeldt</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="text-align:center;padding:32px;background:#1e293b;border-radius:12px;max-width:420px">
    <h1 style="margin:0 0 12px;font-size:22px">Du er nå avmeldt</h1>
    <p style="margin:0;color:#94a3b8;font-size:14px">Du vil ikke lenger motta den ukentlige rapporten på e-post. Du kan reaktivere den i profil-innstillingene dine.</p>
  </div>
</body></html>`;

  return new Response(html, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
});
