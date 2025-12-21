import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { getEmailConfig } from "../_shared/email-config.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";

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
  console.log("User welcome email function called");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_name, user_email, company_name, company_id }: UserWelcomeRequest = await req.json();
    console.log("Processing welcome email for new user:", user_name, user_email);

    if (!user_email) {
      console.log("No email provided for user, skipping notification");
      return new Response(
        JSON.stringify({ message: "No email provided" }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user_email)) {
      console.error("Invalid email format:", user_email);
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get email template with fallback
    const templateResult = await getEmailTemplateWithFallback(
      company_id,
      'user_welcome',
      {
        user_name: user_name,
        company_name: company_name
      }
    );

    console.log(`Using ${templateResult.isCustom ? 'custom' : 'default'} user welcome template`);

    // Get email configuration
    const emailConfig = await getEmailConfig(company_id);
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

    console.log("Sending welcome email to:", user_email);

    await client.send({
      from: senderAddress,
      to: user_email,
      subject: templateResult.subject,
      content: "auto",
      html: templateResult.content,
    });

    await client.close();

    console.log("User welcome email sent successfully to:", user_email);

    return new Response(
      JSON.stringify({ success: true, message: "Welcome email sent successfully" }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error in send-user-welcome-email function:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
