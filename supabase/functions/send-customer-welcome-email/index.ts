import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { getEmailConfig } from "../_shared/email-config.ts";

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
    console.log("Processing welcome email for customer:", customer_name, customer_email, "company_id:", company_id);

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

    // Get email configuration using shared helper
    const emailConfig = await getEmailConfig(company_id);
    console.log("Email config loaded:", { 
      host: emailConfig.host, 
      port: emailConfig.port, 
      user: emailConfig.user, 
      secure: emailConfig.secure,
      fromEmail: emailConfig.fromEmail
    });

    // Determine TLS settings based on port
    const useTLS = emailConfig.port === 465 ? true : 
                   (emailConfig.port === 587 ? true : emailConfig.secure);

    const senderAddress = emailConfig.fromName 
      ? `${emailConfig.fromName} <${emailConfig.fromEmail}>` 
      : emailConfig.fromEmail;

    console.log("Attempting to send email to:", customer_email, "from:", senderAddress);

    // Retry logic for sporadic SMTP failures
    const maxRetries = 3;
    let lastError: Error | null = null;
    let success = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let client: SMTPClient | null = null;
      
      try {
        console.log(`Send attempt ${attempt}/${maxRetries}`);
        
        client = new SMTPClient({
          connection: {
            hostname: emailConfig.host,
            port: emailConfig.port,
            tls: useTLS,
            auth: {
              username: emailConfig.user,
              password: emailConfig.pass,
            },
          },
        });

        await client.send({
          from: senderAddress,
          to: customer_email,
          subject: emailSubject,
          html: emailContent,
        });

        await client.close();
        success = true;
        console.log("Customer welcome email sent successfully to:", customer_email);
        break;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Send attempt ${attempt} failed:`, lastError.message);
        
        // Try to close the client if it exists
        if (client) {
          try {
            await client.close();
          } catch (closeError) {
            console.log("Error closing client:", closeError);
          }
        }
        
        if (attempt < maxRetries) {
          const waitTime = 1000 * attempt; // Exponential backoff: 1s, 2s, 3s
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    if (!success) {
      console.error("All send attempts failed. Last error:", lastError?.message);
      
      // Provide user-friendly error message
      let userMessage = "Kunne ikke sende e-post.";
      const errorMsg = lastError?.message?.toLowerCase() || "";
      
      if (errorMsg.includes("auth") || errorMsg.includes("credentials") || errorMsg.includes("535")) {
        userMessage = "Feil brukernavn eller passord for SMTP-server.";
      } else if (errorMsg.includes("connection") || errorMsg.includes("timeout") || errorMsg.includes("econnrefused")) {
        userMessage = "Kunne ikke koble til e-postserveren. Sjekk SMTP-host og port.";
      } else if (errorMsg.includes("tls") || errorMsg.includes("ssl") || errorMsg.includes("certificate")) {
        userMessage = "TLS/SSL-feil. Prøv å endre sikkerhetsinnstillinger.";
      } else if (errorMsg.includes("datamode") || errorMsg.includes("bad resource")) {
        userMessage = "E-postserveren avsluttet forbindelsen uventet. Dette kan være et midlertidig problem.";
      }
      
      return new Response(
        JSON.stringify({ 
          error: userMessage,
          details: lastError?.message
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

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
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error instanceof Error ? error.toString() : String(error)
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
