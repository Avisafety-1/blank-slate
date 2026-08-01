import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend-email.ts";
import { sendGatewaySms } from "../_shared/sms.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Audience {
  mode: "all" | "companies";
  company_ids?: string[];
}

interface Body {
  recipient_ids?: string[];
  audience?: Audience | null;
  subject: string;
  body: string;
  parent_id?: string | null;
  deep_link?: string | null;
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

type Recipient = {
  id: string;
  full_name: string | null;
  email: string | null;
  telefon: string | null;
  company_id: string | null;
};

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
    if (!payload?.subject?.trim() || !payload?.body?.trim()) return json({ error: "invalid_payload" }, 400);

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

    // Is the sender an Avisafe superadmin (allowed to broadcast system-wide)?
    let isAvisafeSuper = false;
    if (isSuper && sender.company_id) {
      const { data: comp } = await admin.from("companies").select("navn").eq("id", sender.company_id).single();
      isAvisafeSuper = (comp?.navn ?? "").trim().toLowerCase() === "avisafe";
    }

    let parent:
      | { id: string; sender_id: string | null; recipient_id: string | null; subject: string; company_id: string; thread_root_id: string | null; is_broadcast: boolean }
      | null = null;
    let recipientIds: string[] = payload.recipient_ids ?? [];
    let isBroadcast = false;
    let broadcastScope: Record<string, unknown> | null = null;

    // ---- Reply path -------------------------------------------------------
    if (payload.parent_id) {
      const { data: p } = await admin
        .from("internal_messages")
        .select("id, sender_id, recipient_id, subject, company_id, thread_root_id, is_broadcast")
        .eq("id", payload.parent_id)
        .single();
      if (!p) return json({ error: "parent_not_found" }, 404);
      parent = p as typeof parent;

      const threadRoot = p.thread_root_id ?? p.id;

      // Collect all participants of the thread
      const { data: threadMsgs } = await admin
        .from("internal_messages")
        .select("id, sender_id, recipient_id")
        .or(`thread_root_id.eq.${threadRoot},id.eq.${threadRoot}`);
      const msgIds = (threadMsgs ?? []).map((m) => m.id);
      const { data: junction } = msgIds.length
        ? await admin.from("internal_message_recipients").select("recipient_id").in("message_id", msgIds)
        : { data: [] as { recipient_id: string }[] };

      const participants = new Set<string>();
      for (const m of threadMsgs ?? []) {
        if (m.sender_id) participants.add(m.sender_id);
        if (m.recipient_id) participants.add(m.recipient_id);
      }
      for (const r of junction ?? []) participants.add(r.recipient_id);

      if (!participants.has(user.id)) return json({ error: "not_a_participant" }, 403);

      if (p.is_broadcast) {
        // Replies to a broadcast go only to the original sender
        recipientIds = p.sender_id && p.sender_id !== user.id ? [p.sender_id] : [];
      } else {
        participants.delete(user.id);
        recipientIds = Array.from(participants);
      }
      if (!recipientIds.length) return json({ error: "no_reply_target" }, 400);
    }

    // ---- Broadcast path ---------------------------------------------------
    if (!parent && payload.audience) {
      if (!isAvisafeSuper) return json({ error: "broadcast_not_allowed" }, 403);
      const mode = payload.audience.mode;
      if (mode !== "all" && mode !== "companies") return json({ error: "invalid_audience" }, 400);

      let q = admin.from("profiles").select("id").neq("id", user.id);
      if (mode === "companies") {
        const ids = payload.audience.company_ids ?? [];
        if (!ids.length) return json({ error: "no_companies_selected" }, 400);
        q = q.in("company_id", ids);
      }
      const { data: audienceRows, error: audErr } = await q;
      if (audErr) return json({ error: `audience_failed: ${audErr.message}` }, 500);
      recipientIds = (audienceRows ?? []).map((r) => r.id);
      isBroadcast = true;
      broadcastScope = { mode, company_ids: payload.audience.company_ids ?? null };
    }

    if (!recipientIds.length) return json({ error: "no_recipients" }, 400);

    // Fetch recipient profiles (chunked to stay under URL limits)
    const recipients: Recipient[] = [];
    for (let i = 0; i < recipientIds.length; i += 200) {
      const chunk = recipientIds.slice(i, i + 200);
      const { data } = await admin
        .from("profiles")
        .select("id, full_name, email, telefon, company_id")
        .in("id", chunk);
      recipients.push(...((data ?? []) as Recipient[]));
    }
    if (!recipients.length) return json({ error: "recipients_not_found" }, 404);

    // Access control (skipped when replying or broadcasting — both validated above)
    let allowed = recipients;
    if (!parent && !isBroadcast && !isSuper) {
      const { data: visible } = await admin.rpc("get_user_visible_company_ids", { _user_id: user.id });
      const visibleSet = new Set((visible as string[] | null) ?? []);
      // Exception to company isolation: anyone may message superadmins (Avisafe support)
      const { data: superRows } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "superadmin")
        .in("user_id", recipients.map((r) => r.id));
      const superSet = new Set(((superRows as { user_id: string }[] | null) ?? []).map((r) => r.user_id));
      allowed = recipients.filter((r) => superSet.has(r.id) || (r.company_id && visibleSet.has(r.company_id)));
    }

    if (!allowed.length) return json({ error: "no_valid_recipients" }, 403);

    const channels = {
      email: !!payload.channels?.email && isAdmin,
      sms: !!payload.channels?.sms && isAdmin,
      inbox: true,
    };

    const companyId = parent?.company_id ?? sender.company_id;
    const emailCfg = channels.email ? await getEmailConfig(companyId).catch(() => null) : null;
    const fromAddress = emailCfg ? formatSenderAddress(emailCfg.fromName, emailCfg.fromEmail) : "";

    const subject = parent
      ? (payload.subject.trim().toLowerCase().startsWith("re:") || payload.subject.trim().toLowerCase().startsWith("sv:")
          ? payload.subject.trim()
          : `Re: ${parent.subject}`)
      : payload.subject.trim();

    const results: Array<Record<string, unknown>> = [];

    const deliver = async (msgId: string, targets: Recipient[]) => {
      const receipts: Array<Record<string, unknown>> = [
        { message_id: msgId, channel: "inbox", status: "sent" },
      ];
      const deepLinkAbs = `${APP_URL}/?msg=${msgId}`;

      for (const r of targets) {
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
            receipts.push({ message_id: msgId, channel: "email", status: "sent", provider_id: (res as any)?.id });
          } catch (e) {
            receipts.push({ message_id: msgId, channel: "email", status: "failed", error: String(e) });
          }
        }

        if (channels.sms && r.telefon) {
          const smsText = `${subject}\n${payload.body}\n${deepLinkAbs}`.slice(0, 480);
          const res = await sendGatewaySms({ phone: r.telefon, message: smsText, reference: msgId });
          receipts.push({
            message_id: msgId,
            channel: "sms",
            status: res.ok ? "sent" : "failed",
            error: res.ok ? undefined : res.error,
          });
        }
      }

      // Web push to the recipients' PWA devices (best effort)
      try {
        const targetIds = targets.map((r) => r.id);
        if (targetIds.length) {
          await admin.functions.invoke("send-push-notification", {
            headers: { "x-cron-secret": Deno.env.get("CRON_SHARED_SECRET") ?? "" },
            body: {
              userIds: targetIds,
              title: subject,
              body: payload.body.slice(0, 180),
              tag: `internal-message-${msgId}`,
              url: `/?msg=${msgId}`,
              data: { type: "internal_message", message_id: msgId },
            },
          });
          receipts.push({ message_id: msgId, channel: "push", status: "sent" });
        }
      } catch (e) {
        console.error("[send-message] push failed", e);
        receipts.push({ message_id: msgId, channel: "push", status: "failed", error: String(e) });
      }

      if (receipts.length) await admin.from("internal_message_receipts").insert(receipts);
    };


    if (isBroadcast) {
      // One separate (private) thread per recipient — replies go back to sender only.
      for (const r of allowed) {
        const { data: msg, error: insErr } = await admin
          .from("internal_messages")
          .insert({
            company_id: r.company_id ?? sender.company_id,
            sender_id: sender.id,
            recipient_id: r.id,
            subject,
            body: payload.body,
            severity: payload.severity ?? "info",
            channels_sent: channels,
            parent_id: null,
            is_broadcast: true,
            deep_link: deepLink,
            broadcast_scope: broadcastScope,
          })
          .select("id")
          .single();
        if (insErr || !msg) {
          results.push({ recipient_id: r.id, ok: false, error: insErr?.message });
          continue;
        }
        await admin.from("internal_message_recipients").insert({ message_id: msg.id, recipient_id: r.id });
        await deliver(msg.id, [r]);
        results.push({ recipient_id: r.id, message_id: msg.id, ok: true });
      }
    } else {
      // One shared message row with all recipients — a real group thread.
      const { data: msg, error: insErr } = await admin
        .from("internal_messages")
        .insert({
          company_id: parent ? parent.company_id : allowed[0].company_id ?? sender.company_id,
          sender_id: sender.id,
          recipient_id: allowed[0].id,
          subject,
          body: payload.body,
          severity: payload.severity ?? "info",
          channels_sent: channels,
          parent_id: parent?.id ?? null,
          is_broadcast: false,
          deep_link: deepLink,
        })
        .select("id, thread_root_id")
        .single();
      if (insErr || !msg) return json({ error: `insert_failed: ${insErr?.message}` }, 500);

      const { error: junErr } = await admin
        .from("internal_message_recipients")
        .insert(allowed.map((r) => ({ message_id: msg.id, recipient_id: r.id })));
      if (junErr) console.error("[send-message] junction insert failed", junErr);

      await deliver(msg.id, allowed);
      for (const r of allowed) results.push({ recipient_id: r.id, message_id: msg.id, ok: true });
    }

    return json({ success: true, broadcast: isBroadcast, results });
  } catch (e) {
    console.error("[send-message] error", e);
    return json({ error: String(e) }, 500);
  }
});
