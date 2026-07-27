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
  parent_id?: string | null;
  severity?: "critical" | "warning" | "info";
  channels?: { email?: boolean; sms?: boolean };
}

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.avisafe.no";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    if (!payload?.subject || !payload?.body) return json({ error: "invalid_payload" }, 400);

    // Sender profile
    const { data: sender } = await admin
      .from("profiles")
      .select("id, company_id, full_name, email")
      .eq("id", user.id)
      .single();
    if (!sender) return json({ error: "sender_not_found" }, 404);

    // Roles
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roleSet = new Set((roles ?? []).map((r) => r.role as string));
    const isSuper = roleSet.has("superadmin");
    const isAdmin = isSuper || roleSet.has("admin") || roleSet.has("administrator");

    // Resolve recipients
    let parent: any = null;
    let recipientIds = payload.recipient_ids ?? [];

    if (payload.parent_id) {
      const { data: p } = await admin
        .from("internal_messages")
        .select("id, sender_id, recipient_id, subject, company_id, thread_root_id")
        .eq("id", payload.parent_id)
        .single();
      if (!p) return json({ error: "parent_not_found" }, 404);
      // Caller must have been a participant in parent
      if (p.sender_id !== user.id && p.recipient_id !== user.id) {
        return json({ error: "not_a_participant" }, 403);
      }
      parent = p;
      // Reply target = the other participant
      const target = p.sender_id === user.id ? p.recipient_id : p.sender_id;
      if (!target) return json({ error: "no_reply_target" }, 400);
      recipientIds = [target];
    }

    if (!recipientIds.length) return json({ error: "no_recipients" }, 400);

    const { data: recipients } = await admin
      .from("profiles")
      .select("id, full_name, email, telefon, company_id, preferred_language")
      .in("id", recipientIds);
    if (!recipients?.length) return json({ error: "recipients_not_found" }, 404);

    // Access control per recipient (skipped when replying — parent already validates)
    let allowedRecipients = recipients;
    if (!parent && !isSuper) {
      const { data: visible } = await admin.rpc("get_user_visible_company_ids", { _user_id: user.id });
      const visibleSet = new Set((visible as string[] | null) ?? []);
      allowedRecipients = recipients.filter((r) => r.company_id && visibleSet.has(r.company_id));
    }
    if (!allowedRecipients.length) return json({ error: "no_valid_recipients" }, 403);

    // Email/SMS only for admin/superadmin
    const channels = {
      email: !!payload.channels?.email && isAdmin,
      sms: !!payload.channels?.sms && isAdmin,
      inbox: true,
    };

    const companyId = parent?.company_id ?? sender.company_id;
    const emailCfg = channels.email ? await getEmailConfig(companyId) : null;
    const fromAddress = emailCfg ? formatSenderAddress(emailCfg.fromName, emailCfg.fromEmail) : "";

    const subject = parent
      ? (payload.subject.trim().toLowerCase().startsWith("re:") ? payload.subject : `Re: ${parent.subject}`)
      : payload.subject;

    const results: Array<Record<string, unknown>> = [];

    for (const r of allowedRecipients) {
      const { data: msg, error: insErr } = await admin
        .from("internal_messages")
        .insert({
          company_id: parent ? parent.company_id : r.company_id ?? sender.company_id,
          sender_id: sender.id,
          recipient_id: r.id,
          subject,
          body: payload.body,
          severity: payload.severity ?? "info",
          channels_sent: channels,
          parent_id: parent?.id ?? null,
        })
        .select("id, thread_root_id")
        .single();

      if (insErr || !msg) {
        results.push({ recipient_id: r.id, ok: false, error: insErr?.message });
        continue;
      }

      const receipts: Array<Record<string, unknown>> = [
        { message_id: msg.id, channel: "inbox", status: "sent" },
      ];

      const deepLinkAbs = `${APP_URL}/?msg=${msg.id}`;

      if (channels.email && r.email) {
        try {
          const html = `
            <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
              <h2 style="margin:0 0 12px">${esc(subject)}</h2>
              <p style="white-space:pre-wrap;line-height:1.5">${esc(payload.body)}</p>
              <p style="margin-top:24px">
                <a href="${deepLinkAbs}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Åpne i AviSafe</a>
              </p>
              <p style="margin-top:24px;font-size:12px;color:#64748b">Sendt av ${esc(sender.full_name ?? sender.email ?? "AviSafe")}</p>
            </div>`;
          const res = await sendEmail({
            from: fromAddress || "AviSafe <noreply@avisafe.no>",
            to: r.email,
            subject: sanitizeSubject(subject),
            html,
          });
          receipts.push({ message_id: msg.id, channel: "email", status: "sent", provider_id: (res as any)?.id });
        } catch (e) {
          receipts.push({ message_id: msg.id, channel: "email", status: "failed", error: String(e) });
        }
      }

      if (channels.sms && r.telefon) {
        const smsText = `${subject}\n${payload.body}\n${deepLinkAbs}`.slice(0, 480);
        const res = await sendGatewaySms({ phone: r.telefon, message: smsText, reference: msg.id });
        receipts.push({
          message_id: msg.id,
          channel: "sms",
          status: res.ok ? "sent" : "failed",
          error: res.ok ? undefined : res.error,
        });
      }

      await admin.from("internal_message_receipts").insert(receipts);
      results.push({ recipient_id: r.id, message_id: msg.id, ok: true });
    }

    return json({ success: true, results });
  } catch (e) {
    console.error("[send-message] error", e);
    return json({ error: String(e) }, 500);
  }
});
