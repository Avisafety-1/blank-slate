import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig } from "../_shared/email-config.ts";

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

    // Generate password reset link - use the Lovable project URL directly
    const redirectUrl = 'https://d5204389-1e73-493a-85e2-7981b39460ee.lovableproject.com/reset-password';
    
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

    // Create email HTML
    const html = `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
.warning { background: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Tilbakestill passord</h1>
</div>
<div class="content">
<p>Hei${profile.full_name ? ' ' + profile.full_name : ''},</p>
<p>Vi har mottatt en forespørsel om å tilbakestille passordet ditt. Klikk på knappen nedenfor for å fortsette:</p>
<a href="${data.properties.action_link}" class="button">Tilbakestill passord</a>
<div class="warning">
<p><strong>Viktig:</strong> Denne lenken utløper om 1 time av sikkerhetsgrunner.</p>
</div>
<p>Hvis du ikke har bedt om å tilbakestille passordet ditt, kan du ignorere denne e-posten. Passordet ditt vil forbli uendret.</p>
<p>Med vennlig hilsen,<br>AviSafe</p>
</div>
</div>
</body>
</html>`;

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
      subject: 'Tilbakestill passord - AviSafe',
      html: html,
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