import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { getEmailConfig, getEmailHeaders, encodeSubject, formatSenderAddress } from "../_shared/email-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_id, recipient_email } = await req.json();

    if (!company_id || !recipient_email) {
      return new Response(JSON.stringify({ error: "company_id and recipient_email are required" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const emailConfig = await getEmailConfig(company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
    const emailHeaders = getEmailHeaders();
    const subject = encodeSubject("Test e-post fra ditt system");
    const date = new Date().toUTCString();

    // Log what we're sending for debugging
    console.log("=== Email Debug Info ===");
    console.log("From (string):", senderAddress);
    console.log("To:", recipient_email);
    console.log("Subject:", subject);
    console.log("Date:", date);
    console.log("Extra headers:", JSON.stringify(emailHeaders.headers));
    console.log("SMTP Host:", emailConfig.host);
    console.log("SMTP Port:", emailConfig.port);
    console.log("========================");

    const client = new SMTPClient({
      connection: { 
        hostname: emailConfig.host, 
        port: emailConfig.port, 
        tls: emailConfig.port === 465 || emailConfig.secure, 
        auth: { username: emailConfig.user, password: emailConfig.pass } 
      },
    });

    await client.send({
      from: senderAddress,
      to: recipient_email,
      subject: subject,
      date: date,
      headers: emailHeaders.headers,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>✓ Test e-post</h1><p>E-postinnstillingene fungerer korrekt.</p><p>SMTP: ${emailConfig.host}:${emailConfig.port}</p><p>From: ${senderAddress}</p></body></html>`,
    });

    await client.close();
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Test e-post sendt vellykket",
      debug: {
        from: senderAddress,
        to: recipient_email,
        subject: subject,
        date: date,
        headers: emailHeaders.headers,
        smtp: `${emailConfig.host}:${emailConfig.port}`
      }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Kunne ikke sende test e-post", details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
