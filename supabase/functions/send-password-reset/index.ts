import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, getEmailHeaders, encodeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";
import { getTemplateAttachments, getTemplateId } from "../_shared/attachment-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "E-post er påkrevd" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      return new Response(JSON.stringify({ message: "Hvis e-posten finnes i systemet, vil du motta en tilbakestillingslenke" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: profile } = await supabase.from('profiles').select('company_id, full_name').eq('id', user.id).maybeSingle();
    if (!profile) throw new Error("Kunne ikke hente brukerinfo");

    const { data: company } = await supabase.from('companies').select('navn').eq('id', profile.company_id).single();

    const { data } = await supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: 'https://login.avisafe.no/reset-password' } });
    if (!data?.properties?.action_link) throw new Error("Kunne ikke generere tilbakestillingslenke");

    const templateResult = await getEmailTemplateWithFallback(profile.company_id, 'password_reset', { user_name: profile.full_name || '', reset_link: data.properties.action_link, company_name: company?.navn || 'AviSafe' });

    let attachments: any[] = [];
    const templateId = await getTemplateId(profile.company_id, 'password_reset');
    if (templateId) attachments = await getTemplateAttachments(templateId);

    const emailConfig = await getEmailConfig(profile.company_id);
    const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);

    const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

    const emailHeaders = getEmailHeaders();
    await client.send({ from: senderAddress, to: email, subject: encodeSubject(templateResult.subject), html: templateResult.content, date: emailHeaders.date, headers: emailHeaders.headers, attachments: attachments.length > 0 ? attachments : undefined });

    await client.close();
    return new Response(JSON.stringify({ message: "Hvis e-posten finnes i systemet, vil du motta en tilbakestillingslenke" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message || "En feil oppstod" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
