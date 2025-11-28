import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { getEmailConfig } from "../_shared/email-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestEmailRequest {
  company_id: string;
  recipient_email: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_id, recipient_email }: TestEmailRequest = await req.json();

    console.log("Test email request received:", { company_id, recipient_email });

    // Validate inputs
    if (!company_id || !recipient_email) {
      return new Response(
        JSON.stringify({ error: "company_id and recipient_email are required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient_email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address format" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get email configuration
    const emailConfig = await getEmailConfig(company_id);
    console.log("Email configuration retrieved for company:", company_id);

    // Create SMTP client
    // Port 587 uses STARTTLS, port 465 uses implicit TLS
    const useTLS = emailConfig.port === 465 ? true : (emailConfig.port === 587 ? true : emailConfig.secure);
    
    const client = new SMTPClient({
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

    console.log("Sending test email to:", recipient_email);

    // Send test email
    await client.send({
      from: emailConfig.fromName 
        ? `${emailConfig.fromName} <${emailConfig.fromEmail}>` 
        : emailConfig.fromEmail,
      to: recipient_email,
      subject: "Test e-post fra ditt system",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
              .success { color: #10b981; font-weight: bold; font-size: 18px; }
              .details { background-color: white; padding: 15px; border-radius: 6px; margin-top: 20px; border-left: 4px solid #4F46E5; }
              .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✓ Test e-post</h1>
              </div>
              <div class="content">
                <p class="success">Gratulerer! E-postinnstillingene fungerer korrekt.</p>
                <p>Denne test-e-posten bekrefter at SMTP-konfigurasjonen din er riktig satt opp og at systemet kan sende e-post.</p>
                <div class="details">
                  <h3>Konfigurasjonsdetaljer:</h3>
                  <p><strong>SMTP-server:</strong> ${emailConfig.host}</p>
                  <p><strong>Port:</strong> ${emailConfig.port}</p>
                  <p><strong>Sikker forbindelse:</strong> ${emailConfig.secure ? 'Ja (TLS/SSL)' : 'Nei'}</p>
                  <p><strong>Avsender:</strong> ${emailConfig.fromEmail}</p>
                  ${emailConfig.fromName ? `<p><strong>Avsendernavn:</strong> ${emailConfig.fromName}</p>` : ''}
                </div>
                <p style="margin-top: 20px;">Du kan nå bruke disse innstillingene til å sende e-post fra systemet ditt.</p>
              </div>
              <div class="footer">
                <p>Denne e-posten ble sendt automatisk for å teste e-postkonfigurasjonen.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    await client.close();

    console.log("Test email sent successfully to:", recipient_email);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Test e-post sendt vellykket",
        recipient: recipient_email 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Error sending test email:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "Kunne ikke sende test e-post", 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
