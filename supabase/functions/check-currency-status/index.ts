import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Rule = { hours: number; days: number };
type EffectiveRules = { rule1: Rule | null; rule2: Rule | null };
type Status = 'green' | 'yellow' | 'red';

const LOGO_URL = 'https://app.avisafe.no/avisafe-logo-text.png';

function classifyStatus(minutes: number, rule: Rule): Status {
  const required = rule.hours * 60;
  if (minutes < required) return 'red';
  if (minutes < required * 1.2) return 'yellow';
  return 'green';
}

function resolveRules(companyId: string, byId: Map<string, any>): EffectiveRules {
  let current = byId.get(companyId);
  // Walk up while child propagates from parent
  while (current?.propagate_currency_requirement && current.parent_company_id && byId.has(current.parent_company_id)) {
    current = byId.get(current.parent_company_id);
  }
  if (!current) return { rule1: null, rule2: null };
  const rule1: Rule | null = current.currency_requirement_enabled
    && Number(current.currency_requirement_hours) > 0
    && Number(current.currency_requirement_days) > 0
    ? { hours: Number(current.currency_requirement_hours), days: Number(current.currency_requirement_days) }
    : null;
  const rule2: Rule | null = current.currency_requirement_2_enabled
    && Number(current.currency_requirement_2_hours) > 0
    && Number(current.currency_requirement_2_days) > 0
    ? { hours: Number(current.currency_requirement_2_hours), days: Number(current.currency_requirement_2_days) }
    : null;
  return { rule1, rule2 };
}

function warningEmailHtml(pilotName: string, rule: Rule, minutes: number) {
  const hours = (minutes / 60).toFixed(1);
  const required = rule.hours;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align:center;padding:20px 20px 10px 20px;">
    <img src="${LOGO_URL}" alt="AviSafe" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;" />
  </div>
  <div style="background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 20px;">⚠️ Du nærmer deg grensen for currency</h1>
  </div>
  <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Hei ${pilotName},</p>
    <p>Du er i ferd med å gå under selskapets currency-krav på <strong>${required} timer per ${rule.days} dager</strong>.</p>
    <p>De siste ${rule.days} dagene har du logget <strong>${hours} timer</strong> flytid.</p>
    <p>For å holde deg current bør du planlegge mer flytid snarlig.</p>
    <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">Denne e-posten ble sendt automatisk basert på selskapets currency-innstillinger.</p>
  </div>
</body></html>`;
}

function expiredEmailHtml(pilotName: string, rule: Rule, minutes: number) {
  const hours = (minutes / 60).toFixed(1);
  const required = rule.hours;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align:center;padding:20px 20px 10px 20px;">
    <img src="${LOGO_URL}" alt="AviSafe" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;" />
  </div>
  <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 20px;">🚫 Du er ikke lenger current</h1>
  </div>
  <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Hei ${pilotName},</p>
    <p>Du har gått under selskapets currency-krav på <strong>${required} timer per ${rule.days} dager</strong>.</p>
    <p>De siste ${rule.days} dagene har du logget <strong>${hours} timer</strong> flytid.</p>
    <p>Ta kontakt med din operasjonsleder for å planlegge nødvendig flytid for å bli current igjen.</p>
    <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">Denne e-posten ble sendt automatisk basert på selskapets currency-innstillinger.</p>
  </div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Load all companies (for rule resolution including propagation).
    const { data: companies, error: compErr } = await supabase
      .from('companies')
      .select('id, parent_company_id, propagate_currency_requirement, currency_requirement_enabled, currency_requirement_hours, currency_requirement_days, currency_requirement_2_enabled, currency_requirement_2_hours, currency_requirement_2_days');
    if (compErr) throw compErr;
    const byId = new Map<string, any>();
    for (const c of companies || []) byId.set(c.id, c);

    // 2. Resolve effective rules per company; only keep companies with at least one rule.
    const effectiveByCompany = new Map<string, EffectiveRules>();
    for (const c of companies || []) {
      const rules = resolveRules(c.id, byId);
      if (rules.rule1 || rules.rule2) effectiveByCompany.set(c.id, rules);
    }

    if (effectiveByCompany.size === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no rules' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Load all pilots in those companies.
    const companyIds = Array.from(effectiveByCompany.keys());
    const { data: pilots, error: pilotErr } = await supabase
      .from('profiles')
      .select('id, company_id, full_name')
      .in('company_id', companyIds);
    if (pilotErr) throw pilotErr;
    if (!pilots || pilots.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. Load existing status log for these pilots.
    const pilotIds = pilots.map(p => p.id);
    const { data: existingLogs } = await supabase
      .from('currency_status_log')
      .select('user_id, rule_index, last_status')
      .in('user_id', pilotIds);
    const logKey = (uid: string, idx: number) => `${uid}:${idx}`;
    const lastStatusMap = new Map<string, Status>();
    for (const row of existingLogs || []) {
      lastStatusMap.set(logKey(row.user_id, row.rule_index), row.last_status as Status);
    }

    let notifiedCount = 0;
    const nowIso = new Date().toISOString();

    for (const pilot of pilots) {
      const rules = effectiveByCompany.get(pilot.company_id);
      if (!rules) continue;
      const ruleList: { idx: 1 | 2; rule: Rule }[] = [];
      if (rules.rule1) ruleList.push({ idx: 1, rule: rules.rule1 });
      if (rules.rule2) ruleList.push({ idx: 2, rule: rules.rule2 });
      if (ruleList.length === 0) continue;

      // Fetch flight logs for max needed window
      const maxDays = Math.max(...ruleList.map(r => r.rule.days));
      const cutoff = new Date(Date.now() - maxDays * 86400000).toISOString().slice(0, 10);
      const { data: logs } = await supabase
        .from('flight_logs')
        .select('flight_date, flight_duration_minutes')
        .eq('user_id', pilot.id)
        .gte('flight_date', cutoff);

      for (const { idx, rule } of ruleList) {
        const ruleCutoff = Date.now() - rule.days * 86400000;
        const minutes = (logs || [])
          .filter((l: any) => new Date(l.flight_date).getTime() >= ruleCutoff)
          .reduce((s: number, l: any) => s + (Number(l.flight_duration_minutes) || 0), 0);
        const newStatus = classifyStatus(minutes, rule);
        const prevStatus = lastStatusMap.get(logKey(pilot.id, idx));

        // Detect transitions: green→yellow (warning), yellow→red (expired).
        // Also catch green→red directly as expired.
        let transition: 'warning' | 'expired' | null = null;
        if (prevStatus === 'green' && newStatus === 'yellow') transition = 'warning';
        else if (prevStatus === 'green' && newStatus === 'red') transition = 'expired';
        else if (prevStatus === 'yellow' && newStatus === 'red') transition = 'expired';

        // Always upsert the latest status.
        await supabase.from('currency_status_log').upsert({
          user_id: pilot.id,
          company_id: pilot.company_id,
          rule_index: idx,
          last_status: newStatus,
          last_notified_at: nowIso,
          updated_at: nowIso,
        }, { onConflict: 'user_id,company_id,rule_index' });

        if (!transition || !prevStatus) continue; // First-time seed: no notification

        // Load preferences
        const { data: prefs } = await supabase
          .from('notification_preferences')
          .select('email_currency_warning, email_currency_expired, push_currency_warning, push_currency_expired')
          .eq('user_id', pilot.id)
          .maybeSingle();

        const wantsEmail = transition === 'warning'
          ? (prefs?.email_currency_warning ?? true)
          : (prefs?.email_currency_expired ?? true);
        const wantsPush = transition === 'warning'
          ? (prefs?.push_currency_warning ?? true)
          : (prefs?.push_currency_expired ?? true);

        const { data: { user } } = await supabase.auth.admin.getUserById(pilot.id);
        const pilotName = pilot.full_name || user?.email || 'Pilot';

        // Push notification
        if (wantsPush) {
          try {
            await supabase.functions.invoke('send-push-notification', {
              headers: { 'x-cron-secret': Deno.env.get('CRON_SHARED_SECRET') ?? '' },
              body: {
                userId: pilot.id,
                title: transition === 'warning' ? 'Snart utgått currency' : 'Du er ikke lenger current',
                body: transition === 'warning'
                  ? `Du nærmer deg grensen på ${rule.hours}t/${rule.days}d.`
                  : `Du har gått under kravet ${rule.hours}t/${rule.days}d.`,
                tag: `currency-${transition}-${idx}`,
                url: '/',
              },
            });
          } catch (pushErr) {
            console.error(`Push failed for ${pilot.id}:`, pushErr);
          }
        }

        // Email
        if (wantsEmail && user?.email) {
          try {
            const emailConfig = await getEmailConfig(pilot.company_id);
            const fromName = emailConfig.fromName || 'AviSafe';
            const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
            const html = transition === 'warning'
              ? warningEmailHtml(pilotName, rule, minutes)
              : expiredEmailHtml(pilotName, rule, minutes);
            const subject = transition === 'warning'
              ? 'Du nærmer deg selskapets currency-krav'
              : 'Du er ikke lenger current';
            await sendEmail({
              from: senderAddress,
              to: user.email,
              subject: sanitizeSubject(subject),
              html,
            });
          } catch (emailErr) {
            console.error(`Email failed for ${pilot.id}:`, emailErr);
          }
        }

        notifiedCount++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, notified: notifiedCount, pilots: pilots.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in check-currency-status:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
