import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { resolveLanguage } from "../_shared/email-i18n.ts";

// NOTE: Denne funksjonen sender tilbakemeldinger til AviSafes support-adresse
// (support@avisafe.no). Innholdet i selve e-posten er alltid på norsk siden
// mottaker er intern. Klient-vendte feilmeldinger er tospråklige.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const userId = claimsData.claims.sub;

    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('full_name, email, company_id')
      .eq('id', userId)
      .single();
    if (profileError) {
      console.error('Profile fetch error:', profileError);
    }

    const senderName = profile?.full_name || 'Ukjent bruker';
    const senderEmail = profile?.email || '';

    let companyLabel = 'Ukjent selskap';
    if (profile?.company_id) {
      const { data: company } = await serviceClient
        .from('companies')
        .select('navn, parent_company_id')
        .eq('id', profile.company_id)
        .maybeSingle();
      if (company) {
        companyLabel = company.navn || 'Ukjent selskap';
        if (company.parent_company_id) {
          const { data: parent } = await serviceClient
            .from('companies')
            .select('navn')
            .eq('id', company.parent_company_id)
            .maybeSingle();
          if (parent?.navn) companyLabel = `${parent.navn} › ${company.navn}`;
        }
      }
    }

    const body = await req.json();
    const { subject, message, imageUrl, missionId } = body;
    const language = resolveLanguage(req, body);
    const errStrings = language === 'en'
      ? {
          subjectRequired: 'Subject is required',
          messageRequired: 'Message is required',
          subjectTooLong: 'Subject cannot be longer than 200 characters',
          messageTooLong: 'Message cannot be longer than 5000 characters',
          sendFailed: 'Could not send feedback',
        }
      : {
          subjectRequired: 'Overskrift er påkrevd',
          messageRequired: 'Melding er påkrevd',
          subjectTooLong: 'Overskrift kan ikke være lengre enn 200 tegn',
          messageTooLong: 'Melding kan ikke være lengre enn 5000 tegn',
          sendFailed: 'Kunne ikke sende tilbakemelding',
        };

    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return new Response(JSON.stringify({ error: errStrings.subjectRequired }), { status: 400, headers: corsHeaders });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: errStrings.messageRequired }), { status: 400, headers: corsHeaders });
    }
    if (subject.length > 200) {
      return new Response(JSON.stringify({ error: errStrings.subjectTooLong }), { status: 400, headers: corsHeaders });
    }
    if (message.length > 5000) {
      return new Response(JSON.stringify({ error: errStrings.messageTooLong }), { status: 400, headers: corsHeaders });
    }

    let missionLine = '';
    if (missionId && typeof missionId === 'string' && profile?.company_id) {
      const { data: mission } = await serviceClient
        .from('missions')
        .select('tittel, tidspunkt, lokasjon')
        .eq('id', missionId)
        .eq('company_id', profile.company_id)
        .maybeSingle();
      if (mission) {
        const date = mission.tidspunkt ? new Date(mission.tidspunkt).toLocaleString('nb-NO') : '';
        const loc = mission.lokasjon ? ` — ${mission.lokasjon}` : '';
        missionLine = `<p><strong>Oppdrag:</strong> ${mission.tittel}${date ? ` (${date})` : ''}${loc}</p>`;
      }
    }

    const imageSection = imageUrl
      ? `<p><strong>Vedlagt bilde:</strong></p><img src="${imageUrl}" alt="Vedlegg" style="max-width: 100%; max-height: 600px; border-radius: 8px; border: 1px solid #e5e7eb;" />`
      : '';

    const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <h2 style="color: #1a56db;">Tilbakemelding fra AviSafe</h2>
  <p><strong>Fra:</strong> ${senderName} (${senderEmail})</p>
  <p><strong>Selskap/avdeling:</strong> ${companyLabel}</p>
  ${missionLine}
  <p><strong>Emne:</strong> ${subject.trim()}</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
  <div style="white-space: pre-wrap;">${message.trim()}</div>
  ${imageSection}
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
  <p style="font-size: 12px; color: #6b7280;">Denne meldingen ble sendt via AviSafe tilbakemeldingsskjema.</p>
</body></html>`;

    const emailConfig = await getEmailConfig(profile?.company_id);

    await sendEmail({
      from: formatSenderAddress(emailConfig.fromName || 'AviSafe', emailConfig.fromEmail),
      to: 'support@avisafe.no',
      subject: sanitizeSubject(`Tilbakemelding: ${subject.trim()}`),
      html: htmlBody,
      replyTo: senderEmail && senderEmail.includes('@') ? senderEmail : undefined,
    });

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (error) {
    console.error('Error sending feedback:', error);
    return new Response(JSON.stringify({ error: 'Kunne ikke sende tilbakemelding' }), { status: 500, headers: corsHeaders });
  }
});
