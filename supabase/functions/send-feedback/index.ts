import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress, getEmailHeaders } from "../_shared/email-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
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

    // Get user profile
    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const senderName = profile?.full_name || 'Ukjent bruker';
    const senderEmail = profile?.email || 'ukjent';

    // Parse and validate body
    const { subject, message } = await req.json();

    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Overskrift er påkrevd' }), { status: 400, headers: corsHeaders });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Melding er påkrevd' }), { status: 400, headers: corsHeaders });
    }
    if (subject.length > 200) {
      return new Response(JSON.stringify({ error: 'Overskrift kan ikke være lengre enn 200 tegn' }), { status: 400, headers: corsHeaders });
    }
    if (message.length > 5000) {
      return new Response(JSON.stringify({ error: 'Melding kan ikke være lengre enn 5000 tegn' }), { status: 400, headers: corsHeaders });
    }

    // Build HTML email
    const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <h2 style="color: #1a56db;">Tilbakemelding fra AviSafe</h2>
  <p><strong>Fra:</strong> ${senderName} (${senderEmail})</p>
  <p><strong>Emne:</strong> ${subject.trim()}</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
  <div style="white-space: pre-wrap;">${message.trim()}</div>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
  <p style="font-size: 12px; color: #6b7280;">Denne meldingen ble sendt via AviSafe tilbakemeldingsskjema.</p>
</body></html>`;

    // Get SMTP config (falls back to default AviSafe SMTP)
    const emailConfig = await getEmailConfig();
    const emailHeaders = getEmailHeaders();

    const client = new SMTPClient({
      connection: {
        hostname: emailConfig.host,
        port: emailConfig.port,
        tls: emailConfig.secure,
        auth: {
          username: emailConfig.user,
          password: emailConfig.pass,
        },
      },
    });

    await client.send({
      from: formatSenderAddress(emailConfig.fromName || 'AviSafe', emailConfig.fromEmail),
      to: 'kontakt@avisafe.no',
      subject: sanitizeSubject(`Tilbakemelding: ${subject.trim()}`),
      content: "auto",
      html: htmlBody,
      ...emailHeaders,
    });

    await client.close();

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (error) {
    console.error('Error sending feedback:', error);
    return new Response(JSON.stringify({ error: 'Kunne ikke sende tilbakemelding' }), { status: 500, headers: corsHeaders });
  }
});
