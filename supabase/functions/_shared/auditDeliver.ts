// Delivery of internal audit notifications (inbox always, e-mail when allowed, never SMS).
// The log row is inserted first; a unique violation means "already sent" and the recipient is skipped.
// Structural client type so callers using either supabase-js import (esm.sh / npm:) are accepted.
// deno-lint-ignore no-explicit-any
type SupabaseClient = { from: (table: string) => any };
import { sendEmail } from "./resend-email.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "./email-config.ts";
import {
  auditFindingKey, auditLang, auditTaskLink, buildAuditMessage, severityForEvent,
  type AuditEventKind, type AuditState,
} from "./auditNotify.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.avisafe.no";
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export async function loadAuditState(admin: SupabaseClient, findingId: string): Promise<AuditState | null> {
  const { data: f, error } = await admin
    .from("audit_findings")
    .select("id, status, severity, responsible_user_id, deadline, description, company_id, review_id, audit_actions(id, status, responsible_user_id, deadline, description)")
    .eq("id", findingId)
    .maybeSingle();
  if (error || !f) return null;
  let reviewTitle: string | null = null;
  let reviewResponsibleId: string | null = null;
  let ownerCompany: string = f.company_id;
  if (f.review_id) {
    const { data: r } = await admin.from("audit_reviews").select("title, responsible_user_id, company_id").eq("id", f.review_id).maybeSingle();
    if (r) { reviewTitle = r.title; reviewResponsibleId = r.responsible_user_id; ownerCompany = r.company_id; }
  }
  const { data: profs } = await admin.from("profiles").select("id").eq("company_id", ownerCompany);
  const ids = (profs ?? []).map((p: { id: string }) => p.id);
  let ownerAdminIds: string[] = [];
  if (ids.length) {
    const { data: roles } = await admin.from("user_roles").select("user_id").in("user_id", ids).in("role", ["admin", "administrator"]);
    ownerAdminIds = [...new Set((roles ?? []).map((r: { user_id: string }) => r.user_id))];
  }
  return {
    finding: {
      id: f.id, status: f.status, severity: f.severity, responsible_user_id: f.responsible_user_id,
      deadline: f.deadline, description: f.description, company_id: f.company_id,
    },
    actions: (f.audit_actions ?? []) as AuditState["actions"],
    reviewTitle, reviewResponsibleId, ownerAdminIds,
  };
}

export interface DeliverInput {
  kind: AuditEventKind;
  state: AuditState;
  actionId: string | null;
  recipients: string[];
  actorId: string | null;
}

/** Returns the number of recipients that were notified now. */
export async function deliverAuditNotification(admin: SupabaseClient, i: DeliverInput): Promise<number> {
  if (!i.recipients.length) return 0;
  const action = i.actionId ? i.state.actions.find((a) => a.id === i.actionId) : undefined;
  const { data: profiles } = await admin
    .from("profiles").select("id, email, company_id, preferred_language").in("id", i.recipients);
  const { data: prefs } = await admin
    .from("notification_preferences").select("user_id, email_audit_tasks").in("user_id", i.recipients);
  const emailOff = new Set((prefs ?? []).filter((p: any) => p.email_audit_tasks === false).map((p: any) => p.user_id));
  const findingKey = auditFindingKey(i.kind, action ? "audit_action" : "audit_finding", action?.id ?? i.state.finding.id);
  const link = auditTaskLink(i.state.finding.id);
  let sent = 0;

  for (const p of (profiles ?? []) as Array<{ id: string; email: string | null; company_id: string | null; preferred_language: string | null }>) {
    try {
      const { data: log, error: logErr } = await admin.from("audit_notification_log").insert({
        finding_id: i.state.finding.id, action_id: action?.id ?? null, kind: i.kind, recipient_id: p.id,
      }).select("id").single();
      if (logErr) {
        if ((logErr as any).code !== "23505") console.error("[audit] log insert failed", logErr);
        continue; // already sent (or cannot log → do not risk duplicates)
      }
      const lang = auditLang(p.preferred_language);
      const msg = buildAuditMessage(i.kind, {
        reviewTitle: i.state.reviewTitle,
        description: action?.description ?? i.state.finding.description,
        severity: i.state.finding.severity,
        deadline: action ? action.deadline : i.state.finding.deadline,
        isAction: !!action,
      }, lang);
      const sendEmailNow = !emailOff.has(p.id) && !!p.email;

      const { data: m, error: mErr } = await admin.from("internal_messages").insert({
        company_id: p.company_id ?? i.state.finding.company_id,
        sender_id: i.actorId,
        recipient_id: p.id,
        subject: msg.subject,
        body: msg.body,
        deep_link: link,
        finding_key: findingKey,
        severity: severityForEvent(i.kind, i.state.finding.severity),
        channels_sent: { inbox: true, email: sendEmailNow, sms: false },
      }).select("id").single();
      const { error: rErr } = m
        ? await admin.from("internal_message_recipients")
          .upsert({ message_id: m.id, recipient_id: p.id }, { onConflict: "message_id,recipient_id", ignoreDuplicates: true })
        : { error: mErr };
      if (mErr || rErr || !m) {
        console.error("[audit] inbox failed, rolling back log", mErr ?? rErr);
        if (m) await admin.from("internal_messages").delete().eq("id", m.id);
        await admin.from("audit_notification_log").delete().eq("id", log.id);
        continue;
      }
      sent++;

      if (sendEmailNow) {
        try {
          const cfg = await getEmailConfig(p.company_id ?? undefined);
          const href = `${APP_URL}${link}&msg=${m.id}`;
          const open = lang === "en" ? "Open in AviSafe" : "Åpne i AviSafe";
          await sendEmail({
            from: formatSenderAddress(cfg.fromName, cfg.fromEmail) || "AviSafe <noreply@avisafe.no>",
            to: p.email!,
            subject: sanitizeSubject(msg.subject),
            html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
              <h2 style="margin:0 0 12px">${esc(msg.subject)}</h2>
              <p style="white-space:pre-wrap;line-height:1.5">${esc(msg.body)}</p>
              <p style="margin-top:24px"><a href="${href}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${open}</a></p>
            </div>`,
          });
        } catch (e) {
          console.error("[audit] e-mail failed (not retried)", e);
        }
      }
    } catch (e) {
      console.error("[audit] recipient failed", p.id, e);
    }
  }
  return sent;
}
