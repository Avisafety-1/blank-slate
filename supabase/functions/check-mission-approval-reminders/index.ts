import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/cron.ts";
import { authErrorResponse } from "../_shared/auth.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";
import { sendGatewaySms, buildApprovalSmsMessage } from "../_shared/sms.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const ADMIN_ROLES = ['admin', 'superadmin'];

type Tier = 1 | 2 | 3 | 4;

function tierFromHours(hoursUntil: number): Tier | null {
  if (hoursUntil <= 72 && hoursUntil > 24) return 1;
  if (hoursUntil <= 24 && hoursUntil > 4) return 2;
  if (hoursUntil <= 4 && hoursUntil > 0) return 3;
  if (hoursUntil <= 0 && hoursUntil >= -24) return 4;
  return null;
}

const TIER_META: Record<Tier, { label: string; subjectPrefix: string }> = {
  1: { label: 'Påminnelse', subjectPrefix: 'Påminnelse' },
  2: { label: 'Haster — venter på godkjenning', subjectPrefix: 'Haster' },
  3: { label: 'Siste varsel — godkjenning kreves snart', subjectPrefix: 'SISTE VARSEL' },
  4: { label: 'Kritisk — oppdraget har startet uten godkjenning', subjectPrefix: 'KRITISK' },
};

function formatHours(hoursUntil: number): string {
  if (hoursUntil < 0) {
    const h = Math.abs(hoursUntil);
    return h < 1 ? `startet for ${Math.round(h * 60)} minutter siden` : `startet for ${h.toFixed(1)} timer siden`;
  }
  if (hoursUntil < 1) return `om ${Math.round(hoursUntil * 60)} minutter`;
  if (hoursUntil < 48) return `om ${hoursUntil.toFixed(1)} timer`;
  return `om ${(hoursUntil / 24).toFixed(1)} dager`;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try { requireCronSecret(req); } catch (e) { return authErrorResponse(e, corsHeaders); }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const now = new Date();
  const lookaheadEnd = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const lookbackStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const { data: missions, error } = await supabase
    .from('missions')
    .select('id, tittel, lokasjon, tidspunkt, beskrivelse, company_id, approval_status')
    .eq('approval_status', 'pending_approval')
    .gte('tidspunkt', lookbackStart.toISOString())
    .lte('tidspunkt', lookaheadEnd.toISOString());

  if (error) {
    console.error('[approval-reminders] mission fetch error', error);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!missions?.length) {
    return new Response(JSON.stringify({ checked: 0, sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const missionIds = missions.map((m: any) => m.id);
  const { data: existing } = await supabase
    .from('mission_approval_reminders')
    .select('mission_id, tier, recipients_count, sms_recipients_count')
    .in('mission_id', missionIds);

  const sentSet = new Set((existing || []).map((r: any) => `${r.mission_id}:${r.tier}`));
  const smsSentSet = new Set((existing || []).filter((r: any) => (r.sms_recipients_count ?? 0) > 0).map((r: any) => `${r.mission_id}:${r.tier}`));

  let totalEmails = 0;
  const tiersHandled: Array<{ mission_id: string; tier: Tier; recipients: number }> = [];

  for (const mission of missions as any[]) {
    const hoursUntil = (new Date(mission.tidspunkt).getTime() - now.getTime()) / 36e5;
    const tier = tierFromHours(hoursUntil);
    if (!tier) continue;

    const tiersToMark: Tier[] = [];
    for (let t = 1; t < tier; t++) {
      const key = `${mission.id}:${t}`;
      if (!sentSet.has(key)) tiersToMark.push(t as Tier);
    }
    const currentKey = `${mission.id}:${tier}`;
    if (sentSet.has(currentKey)) continue;

    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('role', ADMIN_ROLES);
    if (!adminRoles?.length) continue;

    const adminIds = adminRoles.map((r: any) => r.user_id);
    const { data: approverProfiles } = await supabase
      .from('profiles')
      .select('id, approval_company_ids, company_id')
      .eq('approved', true)
      .eq('can_approve_missions', true)
      .in('id', adminIds);

    const { data: company } = await supabase
      .from('companies')
      .select('navn, parent_company_id, prevent_self_approval')
      .eq('id', mission.company_id)
      .single();
    const parentId = company?.parent_company_id;

    let eligible = (approverProfiles || []).filter((a: any) => {
      if (a.approval_company_ids?.includes('all')) {
        return a.company_id === mission.company_id || (parentId && a.company_id === parentId);
      }
      if (a.approval_company_ids) return a.approval_company_ids.includes(mission.company_id);
      return a.company_id === mission.company_id;
    });

    if (company?.prevent_self_approval) {
      const { data: personnel } = await supabase
        .from('mission_personnel')
        .select('profile_id')
        .eq('mission_id', mission.id);
      const assigned = new Set((personnel || []).map((p: any) => p.profile_id).filter(Boolean));
      eligible = eligible.filter((a: any) => !assigned.has(a.id));
    }

    let recipientIds = new Set(eligible.map((a: any) => a.id));
    if (tier >= 3) {
      const { data: companyAdmins } = await supabase
        .from('profiles')
        .select('id, company_id')
        .eq('approved', true)
        .in('id', adminIds)
        .eq('company_id', mission.company_id);
      for (const a of companyAdmins || []) recipientIds.add(a.id);
    }

    if (recipientIds.size === 0) {
      await supabase.from('mission_approval_reminders').insert(
        [...tiersToMark, tier].map((t) => ({ mission_id: mission.id, tier: t, recipients_count: 0 }))
      );
      continue;
    }

    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('user_id')
      .in('user_id', [...recipientIds])
      .eq('email_mission_approval', true);

    const notifyIds = (prefs || []).map((p: any) => p.user_id);
    if (notifyIds.length === 0) {
      await supabase.from('mission_approval_reminders').insert(
        [...tiersToMark, tier].map((t) => ({ mission_id: mission.id, tier: t, recipients_count: 0 }))
      );
      continue;
    }

    const meta = TIER_META[tier];
    const missionDate = new Date(mission.tidspunkt).toLocaleString('nb-NO', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const tpl = await getEmailTemplateWithFallback(mission.company_id, 'mission_approval_reminder', {
      mission_title: mission.tittel,
      mission_location: mission.lokasjon || 'Ikke oppgitt',
      mission_date: missionDate,
      mission_description: mission.beskrivelse || '',
      company_name: company?.navn || '',
      tier_label: meta.label,
      hours_until: formatHours(hoursUntil),
    });

    let subject = tpl.subject;
    let html = tpl.content;
    if (!html) {
      subject = `[${meta.subjectPrefix}] Oppdrag venter på godkjenning: ${mission.tittel}`;
      html = `<html><head><meta charset="utf-8"></head><body>
        <h2>${meta.label}</h2>
        <p><strong>Oppdrag:</strong> ${mission.tittel}</p>
        <p><strong>Lokasjon:</strong> ${mission.lokasjon || 'Ikke oppgitt'}</p>
        <p><strong>Tidspunkt:</strong> ${missionDate} (${formatHours(hoursUntil)})</p>
        ${mission.beskrivelse ? `<p>${mission.beskrivelse}</p>` : ''}
        <p>Logg inn i AviSafe for å godkjenne oppdraget.</p>
      </body></html>`;
    }

    const emailConfig = await getEmailConfig(mission.company_id);
    const fromName = emailConfig.fromName || 'AviSafe';
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    let sent = 0;
    for (const userId of notifyIds) {
      const { data: { user } } = await supabase.auth.admin.getUserById(userId);
      if (!user?.email) continue;
      try {
        await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(subject), html });
        sent++;
      } catch (e) {
        console.error('[approval-reminders] send failed', user.email, e);
      }
    }
    totalEmails += sent;

    // Tier 3 (T-4t): also notify mission personnel that approval is still pending
    let personnelSent = 0;
    if (tier === 3) {
      const { data: personnel } = await supabase
        .from('mission_personnel')
        .select('profile_id')
        .eq('mission_id', mission.id);
      const personnelIds = [...new Set((personnel || []).map((p: any) => p.profile_id).filter(Boolean))];

      if (personnelIds.length > 0) {
        // Build approvers list (name + email) from eligible approvers
        const approverIds = eligible.map((a: any) => a.id);
        const { data: approverProfileNames } = approverIds.length
          ? await supabase.from('profiles').select('id, navn').in('id', approverIds)
          : { data: [] as any[] };
        const nameById = new Map((approverProfileNames || []).map((p: any) => [p.id, p.navn || '']));
        const approverEntries: string[] = [];
        for (const aid of approverIds) {
          const { data: { user } } = await supabase.auth.admin.getUserById(aid);
          const name = nameById.get(aid) || user?.email || 'Godkjenner';
          const email = user?.email;
          approverEntries.push(email ? `${escapeHtml(name)} (<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>)` : escapeHtml(name));
        }
        const approversList = approverEntries.length
          ? approverEntries.join('<br>')
          : 'selskapets administrator';

        const personnelTpl = await getEmailTemplateWithFallback(mission.company_id, 'mission_pending_approval_personnel', {
          mission_title: mission.tittel,
          mission_location: mission.lokasjon || 'Ikke oppgitt',
          mission_date: missionDate,
          company_name: company?.navn || '',
          approvers_list: approversList,
          hours_until: formatHours(hoursUntil),
        });

        let pSubject = personnelTpl.subject;
        let pHtml = personnelTpl.content;
        if (!pHtml) {
          pSubject = `Ditt oppdrag «${mission.tittel}» er ikke godkjent ennå`;
          pHtml = `<html><head><meta charset="utf-8"></head><body>
            <h2>Oppdraget ditt mangler godkjenning</h2>
            <p>Hei! Vi ser at ditt oppdrag <strong>${escapeHtml(mission.tittel)}</strong> (${escapeHtml(missionDate)}, ${escapeHtml(mission.lokasjon || 'Ikke oppgitt')}) ennå ikke er godkjent — det starter ${formatHours(hoursUntil)}.</p>
            <p>Vi har sendt påminnelse til:</p>
            <p>${approversList}</p>
            <p>Ta eventuelt direkte kontakt for å få oppdraget godkjent før start.</p>
          </body></html>`;
        }

        // Filter on email_mission_approval preference
        const { data: pPrefs } = await supabase
          .from('notification_preferences')
          .select('user_id')
          .in('user_id', personnelIds)
          .eq('email_mission_approval', true);
        const pNotifyIds = (pPrefs || []).map((p: any) => p.user_id);

        for (const userId of pNotifyIds) {
          const { data: { user } } = await supabase.auth.admin.getUserById(userId);
          if (!user?.email) continue;
          try {
            await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject(pSubject), html: pHtml });
            personnelSent++;
          } catch (e) {
            console.error('[approval-reminders] personnel send failed', user.email, e);
          }
        }
        totalEmails += personnelSent;
      }
    }

    await supabase.from('mission_approval_reminders').insert(
      [...tiersToMark, tier].map((t) => ({
        mission_id: mission.id,
        tier: t,
        recipients_count: t === tier ? sent : 0,
      }))
    );

    tiersHandled.push({ mission_id: mission.id, tier, recipients: sent, personnel: personnelSent });
  }

  return new Response(JSON.stringify({ checked: missions.length, sent: totalEmails, tiersHandled }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
