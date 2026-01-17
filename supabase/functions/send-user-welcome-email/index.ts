import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { getEmailConfig, getEmailHeaders, encodeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";
import { getTemplateAttachments, getTemplateId } from "../_shared/attachment-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserWelcomeRequest {
  user_name: string;
  user_email: string;
  company_name: string;
  company_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_name, user_email, company_name, company_id }: UserWelcomeRequest = await req.json();
    if (!user_email) {
      return new Response(JSON.stringify({ message: "No email provided" }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const templateResult = await getEmailTemplateWithFallback(company_id, 'user_welcome', { user_name, company_name });
    
    let attachments: any[] = [];
    const templateId = await getTemplateId(company_id, 'user_welcome');
    if (templateId) attachments = await getTemplateAttachments(templateId);

    const emailConfig = await getEmailConfig(company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
    const emailHeaders = getEmailHeaders();

    const client = new SMTPClient({
      connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } },
    });

    await client.send({
      from: senderAddress,
      to: user_email,
      subject: encodeSubject(templateResult.subject),
      html: templateResult.content,
      date: new Date().toUTCString(),
      headers: emailHeaders.headers,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    await client.close();
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
