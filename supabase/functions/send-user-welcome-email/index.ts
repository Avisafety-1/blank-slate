import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user_email)) {
      console.error("Invalid email format:", user_email);
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch email template from database (using customer_welcome template)
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('subject, content')
      .eq('company_id', company_id)
      .eq('template_type', 'customer_welcome')
      .maybeSingle();

    if (templateError) {
      console.error("Error fetching template:", templateError);
      throw templateError;
    }

    // Default template if none exists
    let emailSubject = `Velkommen til ${company_name}`;
    let emailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #888; }
            .info-box { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Velkommen!</h1>
            </div>
            <div class="content">
              <h2>Hei ${user_name}!</h2>
              <p>Takk for at du registrerte deg hos <strong>${company_name}</strong>.</p>
              <div class="info-box">
                <p><strong>📋 Din bruker venter nå på godkjenning</strong></p>
                <p>En administrator vil gjennomgå din forespørsel. Du vil motta en ny e-post når brukeren din er godkjent og klar til bruk.</p>
              </div>
              <p>Hvis du har spørsmål i mellomtiden, ta gjerne kontakt med oss.</p>
              <div class="footer">
                <p>Med vennlig hilsen,<br>${company_name}</p>
                <p style="font-size: 11px; color: #aaa;">Dette er en automatisk generert e-post.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    // Use custom template if available
    if (template) {
      console.log("Using custom email template");
      emailSubject = template.subject
        .replace(/\{\{customer_name\}\}/g, user_name)
        .replace(/\{\{user_name\}\}/g, user_name)
        .replace(/\{\{company_name\}\}/g, company_name);
      
      emailContent = template.content
        .replace(/\{\{customer_name\}\}/g, user_name)
        .replace(/\{\{user_name\}\}/g, user_name)
        .replace(/\{\{company_name\}\}/g, company_name);
    }

    // Get email configuration from database or fallback to environment
    let emailHost: string | undefined;
    let emailPort: number;
    let emailUser: string | undefined;
    let emailPass: string | undefined;
    let emailSecure: boolean;
    let fromName: string | undefined;
    let fromEmail: string | undefined;

    // Try to fetch settings from database first
    const { data: emailSettings, error: settingsError } = await supabase
      .from('email_settings')
      .select('*')
      .eq('company_id', company_id)
      .eq('enabled', true)
      .maybeSingle();

    if (settingsError) {
      console.error("Error fetching email settings:", settingsError);
    }

    if (emailSettings) {
      console.log("Using email settings from database");
      emailHost = emailSettings.smtp_host;
      emailPort = emailSettings.smtp_port;
      emailUser = emailSettings.smtp_user;
      emailPass = emailSettings.smtp_pass;
      emailSecure = emailSettings.smtp_secure;
      fromName = emailSettings.from_name;
      fromEmail = emailSettings.from_email || emailSettings.smtp_user;
    } else {
      console.log("Using email settings from environment variables");
      emailHost = Deno.env.get('EMAIL_HOST');
      emailPort = parseInt(Deno.env.get('EMAIL_PORT') || '465');
      emailUser = Deno.env.get('EMAIL_USER');
      emailPass = Deno.env.get('EMAIL_PASS');
      emailSecure = Deno.env.get('EMAIL_SECURE') === 'true';
      fromEmail = emailUser;
    }

    if (!emailHost || !emailUser || !emailPass) {
      console.error("Email configuration missing");
      throw new Error("Email configuration is incomplete. Please configure SMTP settings in admin panel or environment variables.");
    }

    console.log("Email config:", { emailHost, emailPort, emailUser, emailSecure });

    // Create SMTP client
    const client = new SMTPClient({
      connection: {
        hostname: emailHost,
        port: emailPort,
        tls: emailSecure,
        auth: {
          username: emailUser,
          password: emailPass,
        },
      },
    });

    console.log("Attempting to send welcome email to:", user_email);

    const senderAddress = fromName ? `${fromName} <${fromEmail}>` : fromEmail!;

    await client.send({
      from: senderAddress,
      to: user_email,
      subject: emailSubject,
      content: "auto",
      html: emailContent,
    });

    await client.close();

    console.log("User welcome email sent successfully to:", user_email);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Welcome email sent successfully" 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error("Error in send-user-welcome-email function:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
