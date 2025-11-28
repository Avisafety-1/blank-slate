import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CustomerWelcomeRequest {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  company_name: string;
  company_id: string;
}

serve(async (req) => {
  console.log("Customer welcome email function called");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customer_id, customer_name, customer_email, company_name, company_id }: CustomerWelcomeRequest = await req.json();
    console.log("Processing welcome email for customer:", customer_name, customer_email);

    if (!customer_email) {
      console.log("No email provided for customer, skipping notification");
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
    if (!emailRegex.test(customer_email)) {
      console.error("Invalid email format:", customer_email);
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

    // Fetch email template from database
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
    let emailSubject = `Velkommen som kunde hos ${company_name}`;
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
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Velkommen som kunde!</h1>
            </div>
            <div class="content">
              <h2>Hei ${customer_name}!</h2>
              <p>Vi er glade for å ønske deg velkommen som kunde hos <strong>${company_name}</strong>.</p>
              <p>Du er nå registrert i vårt system, og vi ser frem til å samarbeide med deg.</p>
              <p>Hvis du har spørsmål eller trenger hjelp, ta gjerne kontakt med oss.</p>
              <div class="footer">
                <p>Med vennlig hilsen,<br>${company_name}</p>
                <p style="font-size: 11px; color: #aaa;">Dette er en automatisk generert e-post. Vennligst ikke svar på denne e-posten.</p>
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
        .replace(/\{\{customer_name\}\}/g, customer_name)
        .replace(/\{\{company_name\}\}/g, company_name);
      
      emailContent = template.content
        .replace(/\{\{customer_name\}\}/g, customer_name)
        .replace(/\{\{company_name\}\}/g, company_name);
    }

    // Get email configuration from environment
    const emailHost = Deno.env.get('EMAIL_HOST');
    const emailPort = parseInt(Deno.env.get('EMAIL_PORT') || '465');
    const emailUser = Deno.env.get('EMAIL_USER');
    const emailPass = Deno.env.get('EMAIL_PASS');
    const emailSecure = Deno.env.get('EMAIL_SECURE') === 'true';

    if (!emailHost || !emailUser || !emailPass) {
      console.error("Email configuration missing");
      throw new Error("Email configuration is incomplete");
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

    console.log("Attempting to send email to:", customer_email);

    await client.send({
      from: emailUser,
      to: customer_email,
      subject: emailSubject,
      content: "auto",
      html: emailContent,
    });

    await client.close();

    console.log("Customer welcome email sent successfully to:", customer_email);

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
    console.error("Error in send-customer-welcome-email function:", error);
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
