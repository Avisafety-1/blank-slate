import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";
import { resolveLanguage, t } from "../_shared/email-i18n.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserApprovedRequest {
  user_id: string;
  user_name: string;
  user_email: string;
  company_name: string;
  company_id: string;
  language?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as UserApprovedRequest;
    const { user_name, user_email, company_name, company_id } = body;
    const language = resolveLanguage(req, body);

    if (!user_email) {
      return new Response(JSON.stringify({ message: t(language, 'noEmailProvided') }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const templateResult = await getEmailTemplateWithFallback(
      company_id,
      'user_approved',
      { user_name, company_name },
      language,
    );

    const emailConfig = await getEmailConfig(company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    await sendEmail({ from: senderAddress, to: user_email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
