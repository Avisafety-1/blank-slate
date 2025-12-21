import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig } from "../_shared/email-config.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetRequest {
  email: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { email }: PasswordResetRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "E-post er påkrevd" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Password reset requested for email: ${email}`);

    // Check if user exists
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      // Don't reveal if user exists or not for security
      console.log(`User not found for email: ${email}`);
      return new Response(
        JSON.stringify({ message: "Hvis e-posten finnes i systemet, vil du motta en tilbakestillingslenke" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's profile to determine company for email config
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Error fetching user profile:", profileError);
      throw new Error("Kunne ikke hente brukerinfo");
    }

    // Get company name
    const { data: company } = await supabase
      .from('companies')
      .select('navn')
      .eq('id', profile.company_id)
      .single();

    const companyName = company?.navn || 'AviSafe';

    // Generate password reset link - use login domain
    const redirectUrl = 'https://login.avisafe.no/reset-password';
    
    console.log(`Using redirect URL: ${redirectUrl}`);
    
    const { data, error: resetError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectUrl
      }
    });

    if (resetError || !data) {
      console.error("Error generating reset link:", resetError);
      throw new Error("Kunne ikke generere tilbakestillingslenke");
    }

    console.log(`Generated reset link for user ${user.id}`);

    // Get email template with fallback
    const templateResult = await getEmailTemplateWithFallback(
      profile.company_id,
      'password_reset',
      {
        user_name: profile.full_name || '',
        reset_link: data.properties.action_link,
        company_name: companyName
      }
    );

    console.log(`Using ${templateResult.isCustom ? 'custom' : 'default'} password reset template`);

    // Get email configuration for the user's company
    const emailConfig = await getEmailConfig(profile.company_id);
    const senderAddress = emailConfig.fromName 
      ? `${emailConfig.fromName} <${emailConfig.fromEmail}>`
      : emailConfig.fromEmail;

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

    console.log(`Sending password reset email to ${email}`);

    await client.send({
      from: senderAddress,
      to: email,
      subject: templateResult.subject,
      html: templateResult.content,
    });

    await client.close();

    console.log("Password reset email sent successfully");

    return new Response(
      JSON.stringify({ message: "Hvis e-posten finnes i systemet, vil du motta en tilbakestillingslenke" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending password reset email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "En feil oppstod" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
