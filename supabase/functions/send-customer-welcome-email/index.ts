import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";
import { resolveLanguage, t } from "../_shared/email-i18n.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CustomerWelcomeRequest {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  company_name: string;
  company_id: string;
  language?: string;
}

serve(async (req) => {
  console.log("Customer welcome email function called");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as CustomerWelcomeRequest;
    const { customer_name, customer_email, company_name, company_id } = body;
    const language = resolveLanguage(req, body);

    console.log("Processing welcome email for customer:", customer_name, customer_email, "company_id:", company_id, "language:", language);

    if (!customer_email) {
      return new Response(JSON.stringify({ message: t(language, 'noEmailProvided') }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer_email)) {
      return new Response(JSON.stringify({ error: t(language, 'invalidRequest') }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const templateResult = await getEmailTemplateWithFallback(
      company_id,
      'customer_welcome',
      { customer_name, company_name },
      language,
    );

    const emailConfig = await getEmailConfig(company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    await sendEmail({ from: senderAddress, to: customer_email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content });

    console.log("Customer welcome email sent successfully to:", customer_email);

    return new Response(
      JSON.stringify({ success: true, message: "Welcome email sent successfully" }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    const errorMessage = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    console.error("Error in send-customer-welcome-email function:", errorMessage, error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
