import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ACCESS_TOKEN = Deno.env.get("SB_MANAGEMENT_TOKEN") ?? ""; // optional
const PROJECT_REF = "pmucsvrypogtttrajqxq";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// Use Supabase Logflare-style analytics endpoint via management API
async function runAnalytics(sql: string): Promise<any[]> {
  // Public anon key approach not available — use management API if token provided.
  // Fallback: use postgres logs via direct REST is not exposed; instead use
  // Supabase Management API /v1/projects/{ref}/analytics/endpoints/logs.all
  if (!SUPABASE_ACCESS_TOKEN) return [];
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all?sql=${encodeURIComponent(sql)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    console.error("Analytics fetch failed", res.status, await res.text());
    return [];
  }
  const json = await res.json();
  return json.result ?? [];
}

async function alreadyAlerted(alertType: string, withinMinutes = 60): Promise<boolean> {
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const { count } = await admin
    .from("monitoring_alerts")
    .select("id", { count: "exact", head: true })
    .eq("alert_type", alertType)
    .gte("sent_at", since);
  return (count ?? 0) > 0;
}

async function sendAlert(
  recipients: string[],
  alertType: string,
  subject: string,
  htmlBody: string,
  details: Record<string, unknown>,
) {
  for (const to of recipients) {
    try {
      await sendEmail({
        from: "AviSafe Monitor <noreply@avisafe.no>",
        to,
        subject: `[AviSafe Alert] ${subject}`,
        html: htmlBody,
      });
    } catch (e) {
      console.error("Failed to send alert email to", to, e);
    }
  }
  await admin.from("monitoring_alerts").insert({
    alert_type: alertType,
    subject,
    details,
    severity: "warning",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { data: cfg } = await admin
      .from("monitoring_config")
      .select("*")
      .eq("id", 1)
      .single();

    if (!cfg || !cfg.enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipients: string[] = cfg.recipient_emails ?? [];
    const findings: Record<string, unknown> = {};

    // 1) DB errors siste 10 min
    const dbErrSql = `
      select count(*) as n from postgres_logs
      cross join unnest(metadata) as m
      cross join unnest(m.parsed) as parsed
      where parsed.error_severity in ('ERROR','FATAL','PANIC')
        and postgres_logs.timestamp > timestamp_sub(current_timestamp(), interval 10 minute)
        and event_message not like '%canceling statement due to user request%'
        and event_message not like '%canceling statement due to statement timeout%'
    `;
    const dbRows = await runAnalytics(dbErrSql);
    const dbErrors = Number(dbRows?.[0]?.n ?? 0);
    findings.db_errors_10m = dbErrors;

    // 2) Edge 5xx siste 10 min
    const edge5xxSql = `
      select m.function_id, count(*) as n from function_edge_logs
      cross join unnest(metadata) as m
      cross join unnest(m.response) as response
      where response.status_code >= 500
        and function_edge_logs.timestamp > timestamp_sub(current_timestamp(), interval 10 minute)
      group by m.function_id
      order by n desc
    `;
    const edge5xx = await runAnalytics(edge5xxSql);
    const total5xx = edge5xx.reduce((s: number, r: any) => s + Number(r.n ?? 0), 0);
    findings.edge_5xx_10m = total5xx;
    findings.edge_5xx_by_function = edge5xx;

    // 3) Auth-feil siste 10 min
    const authSql = `
      select count(*) as n from auth_logs
      cross join unnest(metadata) as m
      where m.status >= 400
        and auth_logs.timestamp > timestamp_sub(current_timestamp(), interval 10 minute)
    `;
    const authRows = await runAnalytics(authSql);
    const authFails = Number(authRows?.[0]?.n ?? 0);
    findings.auth_failures_10m = authFails;

    const triggered: { type: string; subject: string; html: string }[] = [];

    if (dbErrors >= cfg.db_errors_per_10m) {
      triggered.push({
        type: "db_errors",
        subject: `Mange DB-feil: ${dbErrors} siste 10 min`,
        html: `<p>${dbErrors} DB-feil siste 10 minutter (terskel ${cfg.db_errors_per_10m}).</p>`,
      });
    }
    if (total5xx >= cfg.edge_5xx_per_10m) {
      const list = edge5xx.map((r: any) => `<li>${r.function_id}: ${r.n}</li>`).join("");
      triggered.push({
        type: "edge_5xx",
        subject: `Edge functions feiler: ${total5xx} 5xx siste 10 min`,
        html: `<p>Totalt ${total5xx} 5xx-svar (terskel ${cfg.edge_5xx_per_10m}).</p><ul>${list}</ul>`,
      });
    }
    if (authFails >= cfg.auth_failures_per_10m) {
      triggered.push({
        type: "auth_failures",
        subject: `Mange auth-feil: ${authFails} siste 10 min`,
        html: `<p>${authFails} auth-feil siste 10 minutter (terskel ${cfg.auth_failures_per_10m}).</p>`,
      });
    }

    const sent: string[] = [];
    for (const t of triggered) {
      if (await alreadyAlerted(t.type, 60)) continue;
      await sendAlert(recipients, t.type, t.subject, t.html, findings);
      sent.push(t.type);
    }

    return new Response(JSON.stringify({ ok: true, findings, sent_alerts: sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Monitor error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
