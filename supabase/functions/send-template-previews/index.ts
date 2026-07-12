import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { defaultTemplatesByLang, replaceTemplateVariables } from "../_shared/template-utils.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { requireUser, requireRole, getUserCompanyId, authErrorResponse } from "../_shared/auth.ts";
import { hasValidCronSecret } from "../_shared/cron.ts";
import { resolveLanguage, type EmailLanguage } from "../_shared/email-i18n.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sample variables that cover all known placeholders across templates
const SAMPLE_VARS: Record<string, string> = {
  user_name: 'Ola Nordmann',
  user_email: 'ola@example.com',
  user_phone: '+47 900 00 000',
  reset_link: 'https://app.avisafe.no/reset?token=DEMO',
  login_link: 'https://app.avisafe.no/login',
  approval_link: 'https://app.avisafe.no/oppdrag/demo',
  mission_link: 'https://app.avisafe.no/oppdrag/demo',
  company_name: 'Demo Droneoperatør AS',
  company_logo: 'https://app.avisafe.no/avisafe-logo-text.png',
  mission_title: 'Inspeksjon Bru — Drammen',
  mission_location: 'Drammensbrua, Drammen',
  mission_date: '15. juni 2026, 10:00',
  mission_description: 'Termografisk inspeksjon av bærekonstruksjon. Krever VLOS og BVLOS dispensasjon.',
  mission_status: 'Venter på godkjenning',
  mission_pilot: 'Kari Hansen',
  pilot_name: 'Kari Hansen',
  pilot_comment: 'Vurderer å utsette pga vind. Be om tilbakemelding før 09:00.',
  mention_text: 'Hei @ola — kan du dobbeltsjekke risikovurderingen på dette oppdraget?',
  incident_title: 'Nær-ulykke under inspeksjon Bru',
  incident_id: 'INC-2026-0042',
  incident_link: 'https://app.avisafe.no/hendelser/INC-2026-0042',
  followup_link: 'https://app.avisafe.no/hendelser/INC-2026-0042',
  document_name: 'Operasjonsmanual v3.2',
  document_expiry: '30. juni 2026',
  document_link: 'https://app.avisafe.no/dokumenter/demo',
  item_count: '3',
  maintenance_items: '<li>DJI M4D — Service intervall (200t)</li><li>DJI M30T — Batteri 4 kalibrering</li><li>RTK Base — Firmware update</li>',
  customer_name: 'Statnett SF',
  invite_link: 'https://app.avisafe.no/invite?token=DEMO',
  inviter_name: 'Per Administrator',
  role: 'Pilot',
  approver_name: 'Per Administrator',
  approval_status: 'Godkjent',
  rejection_reason: '—',
  tier_label: 'Påminnelse: oppdrag venter på godkjenning',
  hours_until: 'om 3 timer og 45 minutter',
  approvers_list: 'Per Administrator (<a href="mailto:per@example.com">per@example.com</a>)<br>Kari Leder (<a href="mailto:kari@example.com">kari@example.com</a>)',
};

// Extra fallback templates that are inlined in their edge functions (not in defaultTemplates)
const EXTRA_TEMPLATES: Record<string, { subject: string; content: string }> = {
  mission_approval_reminder: {
    subject: '[{{tier_label}}] Oppdrag venter på godkjenning: {{mission_title}}',
    content: `<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#222;">
      <h2>{{tier_label}}</h2>
      <p><strong>Oppdrag:</strong> {{mission_title}}</p>
      <p><strong>Lokasjon:</strong> {{mission_location}}</p>
      <p><strong>Tidspunkt:</strong> {{mission_date}} ({{hours_until}})</p>
      <p>{{mission_description}}</p>
      <p>Logg inn i AviSafe for å godkjenne oppdraget.</p>
    </body></html>`,
  },
  mission_pending_approval_personnel: {
    subject: 'Ditt oppdrag «{{mission_title}}» er ikke godkjent ennå',
    content: `<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#222;">
      <h2>Oppdraget ditt mangler godkjenning</h2>
      <p>Hei! Vi ser at ditt oppdrag <strong>{{mission_title}}</strong> ({{mission_date}}, {{mission_location}}) ennå ikke er godkjent — det starter {{hours_until}}.</p>
      <p>Vi har sendt påminnelse til:</p>
      <p>{{approvers_list}}</p>
      <p>Ta eventuelt direkte kontakt for å få oppdraget godkjent før start.</p>
    </body></html>`,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    let cid: string;
    let recipient: string;
    let language: EmailLanguage = 'no';
    if (hasValidCronSecret(req)) {
      const cronBody = await req.json().catch(() => ({}));
      const { recipient: r2, company_id: c2 } = cronBody;
      language = resolveLanguage(req, cronBody);
      if (!c2) {
        const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const { data } = await supa.from('companies').select('id').limit(1).maybeSingle();
        cid = c2 || data?.id;
      } else {
        cid = c2;
      }
      recipient = r2 || 'hauggard@gmail.com';
    } else {
      const user = await requireUser(req);
      await requireRole(user, ['superadmin']);
      const body = await req.json().catch(() => ({}));
      recipient = body.recipient || 'hauggard@gmail.com';
      cid = body.company_id || (await getUserCompanyId(user));
      language = resolveLanguage(req, body);
    }

    const cfg = await getEmailConfig(cid);
    const from = formatSenderAddress(cfg.fromName || 'AviSafe', cfg.fromEmail);

    const templatesForLang = defaultTemplatesByLang[language] || defaultTemplatesByLang.no;
    const all: Record<string, { subject: string; content: string }> = {
      ...templatesForLang,
      ...EXTRA_TEMPLATES,
    };

    const results: Array<{ template: string; ok: boolean; error?: string }> = [];

    for (const [name, tpl] of Object.entries(all)) {
      try {
        const subject = sanitizeSubject(`[MAL: ${name}] ` + replaceTemplateVariables(tpl.subject, SAMPLE_VARS));
        const html = replaceTemplateVariables(tpl.content, SAMPLE_VARS);
        const banner = `<div style="background:#fef3c7;border:1px solid #f59e0b;color:#78350f;padding:10px 14px;font-family:Arial,sans-serif;font-size:13px;margin:0 0 12px 0;">
          <strong>Forhåndsvisning av e-postmal:</strong> <code>${name}</code> — Eksempelvariabler er fylt inn.
        </div>`;
        const finalHtml = html.includes('<body')
          ? html.replace(/<body([^>]*)>/i, `<body$1>${banner}`)
          : banner + html;

        await sendEmail({ from, to: recipient, subject, html: finalHtml });
        results.push({ template: name, ok: true });
      } catch (e: any) {
        results.push({ template: name, ok: false, error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({ recipient, sent: results.filter(r => r.ok).length, total: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return authErrorResponse(e, corsHeaders);
  }
});
