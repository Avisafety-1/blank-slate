import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { getEmailConfig, getEmailHeaders, encodeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { getTemplateAttachments } from "../_shared/attachment-utils.ts";

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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, user_name, user_email, company_name, company_id }: UserApprovedRequest = await req.json();
    if (!user_email) {
      return new Response(JSON.stringify({ message: "No email provided" }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: template } = await supabase.from('email_templates').select('id, subject, content').eq('company_id', company_id).eq('template_type', 'user_approved').maybeSingle();

    let attachments: any[] = [];
    if (template?.id) attachments = await getTemplateAttachments(template.id);

    let emailSubject = `Din bruker hos ${company_name} er godkjent`;
    let emailContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>Hei ${user_name}!</h2><p>Din bruker hos <strong>${company_name}</strong> er nå godkjent.</p></body></html>`;

    if (template) {
      emailSubject = template.subject.replace(/\{\{user_name\}\}/g, user_name).replace(/\{\{company_name\}\}/g, company_name);
      emailContent = template.content.replace(/\{\{user_name\}\}/g, user_name).replace(/\{\{company_name\}\}/g, company_name);
    }

    const emailConfig = await getEmailConfig(company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
    const emailHeaders = getEmailHeaders(fromName, emailConfig.fromEmail);

    const client = new SMTPClient({
      connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } },
    });

    await client.send({
      from: senderAddress,
      to: user_email,
      subject: encodeSubject(emailSubject),
      html: emailContent,
      date: emailHeaders.date,
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
