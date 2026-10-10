// Daily deadline reminders for internal audit findings/actions (pg_cron 05:00 UTC).
// Idempotent: audit_notification_log guarantees one reminder per item, kind and recipient.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/cron.ts";
import { authErrorResponse } from "../_shared/auth.ts";
import { daysBetween, deadlineTargets, getAuditReminderConfig } from "../_shared/auditNotify.ts";
import { deliverAuditNotification, loadAuditState } from "../_shared/auditDeliver.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    requireCronSecret(req);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = new Date().toISOString().slice(0, 10);
  const maxSoon = getAuditReminderConfig().soonDays;
  const horizon = new Date(Date.now() + maxSoon * 86_400_000).toISOString().slice(0, 10);

  const findingIds = new Set<string>();
  const { data: fs, error: fErr } = await admin.from("audit_findings")
    .select("id").in("status", ["open", "in_progress"]).not("deadline", "is", null).lte("deadline", horizon);
  if (fErr) console.error("[audit-deadline-reminders] findings", fErr);
  (fs ?? []).forEach((f: { id: string }) => findingIds.add(f.id));
  const { data: as, error: aErr } = await admin.from("audit_actions")
    .select("finding_id").neq("status", "closed").not("deadline", "is", null).lte("deadline", horizon);
  if (aErr) console.error("[audit-deadline-reminders] actions", aErr);
  (as ?? []).forEach((a: { finding_id: string }) => findingIds.add(a.finding_id));

  const counts = { deadline_soon: 0, deadline_overdue: 0, errors: 0 };
  for (const id of findingIds) {
    try {
      const state = await loadAuditState(admin, id);
      if (!state) continue;
      const cfg = getAuditReminderConfig(state.finding.company_id);
      for (const t of deadlineTargets(state, today, cfg)) {
        counts[t.kind] += await deliverAuditNotification(admin, {
          kind: t.kind, state, actionId: t.actionId, recipients: t.recipients, actorId: null,
        });
      }
    } catch (e) {
      counts.errors++;
      console.error("[audit-deadline-reminders] finding failed", id, e);
    }
  }
  return json({ today, checked: findingIds.size, horizonDays: daysBetween(today, horizon), ...counts });
});
