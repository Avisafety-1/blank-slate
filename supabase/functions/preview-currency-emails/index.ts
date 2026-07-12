import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { resolveLanguage, type EmailLanguage } from "../_shared/email-i18n.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOGO_URL = 'https://app.avisafe.no/avisafe-logo-text.png';

const stringsByLang: Record<EmailLanguage, {
  warningTitle: string;
  expiredTitle: string;
  greeting: (name: string) => string;
  aboutToDropBelow: (h: number, d: number) => string;
  droppedBelow: (h: number, d: number) => string;
  loggedInLastDays: (d: number, h: string) => string;
  planMore: string;
  contactManager: string;
  footer: string;
  previewWarningSubject: string;
  previewExpiredSubject: string;
}> = {
  no: {
    warningTitle: '⚠️ Du nærmer deg grensen for currency',
    expiredTitle: '🚫 Du er ikke lenger current',
    greeting: (name) => `Hei ${name},`,
    aboutToDropBelow: (h, d) => `Du er i ferd med å gå under selskapets currency-krav på <strong>${h} timer per ${d} dager</strong>.`,
    droppedBelow: (h, d) => `Du har gått under selskapets currency-krav på <strong>${h} timer per ${d} dager</strong>.`,
    loggedInLastDays: (d, h) => `De siste ${d} dagene har du logget <strong>${h} timer</strong> flytid.`,
    planMore: 'For å holde deg current bør du planlegge mer flytid snarlig.',
    contactManager: 'Ta kontakt med din operasjonsleder for å planlegge nødvendig flytid for å bli current igjen.',
    footer: 'Denne e-posten ble sendt automatisk basert på selskapets currency-innstillinger.',
    previewWarningSubject: '[FORHÅNDSVISNING] Du nærmer deg selskapets currency-krav',
    previewExpiredSubject: '[FORHÅNDSVISNING] Du er ikke lenger current',
  },
  en: {
    warningTitle: '⚠️ You are approaching the currency threshold',
    expiredTitle: '🚫 You are no longer current',
    greeting: (name) => `Hi ${name},`,
    aboutToDropBelow: (h, d) => `You are about to drop below the company's currency requirement of <strong>${h} hours per ${d} days</strong>.`,
    droppedBelow: (h, d) => `You have dropped below the company's currency requirement of <strong>${h} hours per ${d} days</strong>.`,
    loggedInLastDays: (d, h) => `Over the last ${d} days you have logged <strong>${h} hours</strong> of flight time.`,
    planMore: 'To stay current you should schedule more flight time soon.',
    contactManager: 'Contact your operations manager to schedule the flight time needed to become current again.',
    footer: "This email was sent automatically based on the company's currency settings.",
    previewWarningSubject: '[PREVIEW] You are approaching the currency threshold',
    previewExpiredSubject: '[PREVIEW] You are no longer current',
  },
};

function warningEmailHtml(pilotName: string, hoursReq: number, days: number, minutes: number, language: EmailLanguage) {
  const s = stringsByLang[language];
  const hours = (minutes / 60).toFixed(1);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align:center;padding:20px 20px 10px 20px;">
    <img src="${LOGO_URL}" alt="AviSafe" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;" />
  </div>
  <div style="background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 20px;">${s.warningTitle}</h1>
  </div>
  <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
    <p>${s.greeting(pilotName)}</p>
    <p>${s.aboutToDropBelow(hoursReq, days)}</p>
    <p>${s.loggedInLastDays(days, hours)}</p>
    <p>${s.planMore}</p>
    <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">${s.footer}</p>
  </div>
</body></html>`;
}

function expiredEmailHtml(pilotName: string, hoursReq: number, days: number, minutes: number, language: EmailLanguage) {
  const s = stringsByLang[language];
  const hours = (minutes / 60).toFixed(1);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align:center;padding:20px 20px 10px 20px;">
    <img src="${LOGO_URL}" alt="AviSafe" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;" />
  </div>
  <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 20px;">${s.expiredTitle}</h1>
  </div>
  <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
    <p>${s.greeting(pilotName)}</p>
    <p>${s.droppedBelow(hoursReq, days)}</p>
    <p>${s.loggedInLastDays(days, hours)}</p>
    <p>${s.contactManager}</p>
    <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">${s.footer}</p>
  </div>
</body></html>`;
}

// Eksporterte hjelpere brukes av check-currency-status (som sender de faktiske
// currency-varslene). Kalleren må sende `preferred_language` fra pilotens
// profil. Se mem://preferences/i18n-mandatory.
export { warningEmailHtml, expiredEmailHtml };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { to = 'hauggard@gmail.com', companyId } = body;
    const language = resolveLanguage(req, body);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let cid = companyId;
    if (!cid) {
      const { data } = await supabase.from('companies').select('id').limit(1).maybeSingle();
      cid = data?.id;
    }
    const emailConfig = await getEmailConfig(cid);
    const fromName = emailConfig.fromName || 'AviSafe';
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    const warningHtml = warningEmailHtml('Pilot Hauggard', 2, 90, 130, language);
    const expiredHtml = expiredEmailHtml('Pilot Hauggard', 2, 90, 95, language);
    const s = stringsByLang[language];

    const r1 = await sendEmail({
      from: senderAddress,
      to,
      subject: sanitizeSubject(s.previewWarningSubject),
      html: warningHtml,
    });
    const r2 = await sendEmail({
      from: senderAddress,
      to,
      subject: sanitizeSubject(s.previewExpiredSubject),
      html: expiredHtml,
    });

    return new Response(JSON.stringify({ success: true, warning: r1, expired: r2, language }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('preview-currency-emails failed', e);
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
