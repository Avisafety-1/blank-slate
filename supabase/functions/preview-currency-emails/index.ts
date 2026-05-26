import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOGO_URL = 'https://app.avisafe.no/avisafe-logo-text.png';

function warningEmailHtml(pilotName: string, hoursReq: number, days: number, minutes: number) {
  const hours = (minutes / 60).toFixed(1);
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
    <p>Du er i ferd med å gå under selskapets currency-krav på <strong>${hoursReq} timer per ${days} dager</strong>.</p>
    <p>De siste ${days} dagene har du logget <strong>${hours} timer</strong> flytid.</p>
    <p>For å holde deg current bør du planlegge mer flytid snarlig.</p>
    <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">Denne e-posten ble sendt automatisk basert på selskapets currency-innstillinger.</p>
  </div>
</body></html>`;
}

function expiredEmailHtml(pilotName: string, hoursReq: number, days: number, minutes: number) {
  const hours = (minutes / 60).toFixed(1);
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
    <p>Du har gått under selskapets currency-krav på <strong>${hoursReq} timer per ${days} dager</strong>.</p>
    <p>De siste ${days} dagene har du logget <strong>${hours} timer</strong> flytid.</p>
    <p>Ta kontakt med din operasjonsleder for å planlegge nødvendig flytid for å bli current igjen.</p>
    <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">Denne e-posten ble sendt automatisk basert på selskapets currency-innstillinger.</p>
  </div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { to = 'hauggard@gmail.com', companyId } = await req.json().catch(() => ({}));
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Find a company with currency settings (or use provided one) for sender domain config
    let cid = companyId;
    if (!cid) {
      const { data } = await supabase.from('companies').select('id').limit(1).maybeSingle();
      cid = data?.id;
    }
    const emailConfig = await getEmailConfig(cid);
    const fromName = emailConfig.fromName || 'AviSafe';
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    // Sample: krav 2t/90d, har logget 130 min (2,17t — i gult belte siden 1.2 * 120 = 144)
    const warningHtml = warningEmailHtml('Pilot Hauggard', 2, 90, 130);
    const expiredHtml = expiredEmailHtml('Pilot Hauggard', 2, 90, 95);

    const r1 = await sendEmail({
      from: senderAddress,
      to,
      subject: sanitizeSubject('[FORHÅNDSVISNING] Du nærmer deg selskapets currency-krav'),
      html: warningHtml,
    });
    const r2 = await sendEmail({
      from: senderAddress,
      to,
      subject: sanitizeSubject('[FORHÅNDSVISNING] Du er ikke lenger current'),
      html: expiredHtml,
    });

    return new Response(JSON.stringify({ success: true, warning: r1, expired: r2 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('preview-currency-emails failed', e);
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
