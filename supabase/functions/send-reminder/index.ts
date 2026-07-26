import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend-email.ts";
import { sendGatewaySms } from "../_shared/sms.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  recipient_ids: string[];
  subject: string;
  body: string;
  deep_link?: string | null;
  finding_key?: string | null;
  severity?: "critical" | "warning" | "info";
  channels: { email?: boolean; sms?: boolean; inbox?: boolean };
}

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.avisafe.no";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const payload = (await req.json()) as Body;
    if (!payload?.recipient_ids?.length || !payload.subject || !payload.body) {
      return json({ error: "invalid_payload" }, 400);
    }

    // Sender profile & company
    const { data: sender } = await admin
      .from("profiles")
      .select("id, company_id, full_name, email")
      .eq("id", user.id)
      .single();
    if (!sender) return json({ error: "sender_not_found" }, 404);

    // Verify sender is admin/superadmin
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r) => ["admin", "administrator", "superadmin"].includes(r.role as string));
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    // Fetch recipients (must be in same company)
    const { data: recipients } = await admin
      .from("profiles")
      .select("id, full_name, email, telefon, company_id, preferred_language")
      .in("id", payload.recipient_ids);

    if (!recipients?.length) return json({ error: "no_recipients" }, 404);

    const validRecipients = recipients.filter((r) => r.company_id === sender.company_id);
    if (!validRecipients.length) return json({ error: "recipients_outside_company" }, 403);

    const channels = {
      email: !!payload.channels?.email,
      sms: !!payload.channels?.sms,
      inbox: true, // always
    };

    const emailCfg = channels.email ? await getEmailConfig(sender.company_id) : null;
    const fromAddress = emailCfg ? formatSenderAddress(emailCfg.fromName, emailCfg.fromEmail) : "";

    const results: Array<Record<string, unknown>> = [];

    for (const r of validRecipients) {
      // 1. Insert inbox message
      const { data: msg, error: insErr } = await admin
        .from("internal_messages")
        .insert({
          company_id: sender.company_id,
          sender_id: sender.id,
          recipient_id: r.id,
          subject: payload.subject,
          body: payload.body,
          deep_link: payload.deep_link ?? null,
          finding_key: payload.finding_key ?? null,
          severity: payload.severity ?? "info",
          channels_sent: channels,
        })
        .select("id")
        .single();

      if (insErr || !msg) {
        results.push({ recipient_id: r.id, ok: false, error: insErr?.message });
        continue;
      }

      const receipts: Array<{ message_id: string; channel: string; status: string; error?: string; provider_id?: string }> = [
        { message_id: msg.id, channel: "inbox", status: "sent" },
      ];

      const deepLinkAbs = payload.deep_link
        ? `${APP_URL}${payload.deep_link.startsWith("/") ? "" : "/"}${payload.deep_link}${payload.deep_link.includes("?") ? "&" : "?"}msg=${msg.id}`
        : `${APP_URL}/?msg=${msg.id}`;

      // 2. Email
      if (channels.email) {
        if (!r.email) {
          receipts.push({ message_id: msg.id, channel: "email", status: "failed", error: "missing_email" });
        } else {
          try {
            const html = `
              <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
                <h2 style="margin:0 0 12px">${esc(payload.subject)}</h2>
                <p style="white-space:pre-wrap;line-height:1.5">${esc(payload.body)}</p>
                <p style="margin-top:24px">
                  <a href="${deepLinkAbs}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Åpne i AviSafe</a>
                </p>
                <p style="margin-top:24px;font-size:12px;color:#64748b">Sendt av ${esc(sender.full_name ?? sender.email ?? "AviSafe")}</p>
              </div>`;
            const res = await sendEmail({
              from: fromAddress || "AviSafe <noreply@avisafe.no>",
              to: r.email,
              subject: sanitizeSubject(payload.subject),
              html,
            });
            receipts.push({ message_id: msg.id, channel: "email", status: "sent", provider_id: (res as any)?.id });
          } catch (e) {
            receipts.push({ message_id: msg.id, channel: "email", status: "failed", error: String(e) });
          }
        }
      }

      // 3. SMS
      if (channels.sms) {
        if (!r.telefon) {
          receipts.push({ message_id: msg.id, channel: "sms", status: "failed", error: "missing_phone" });
        } else {
          const smsText = `${payload.subject}\n${payload.body}\n${deepLinkAbs}`.slice(0, 480);
          const res = await sendGatewaySms({ phone: r.telefon, message: smsText, reference: msg.id });
          receipts.push({
            message_id: msg.id,
            channel: "sms",
            status: res.ok ? "sent" : "failed",
            error: res.ok ? undefined : res.error,
          });
        }
      }

      await admin.from("internal_message_receipts").insert(receipts);
      results.push({ recipient_id: r.id, message_id: msg.id, ok: true, receipts });
    }

    return json({ success: true, results });
  } catch (e) {
    console.error("[send-reminder] error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
