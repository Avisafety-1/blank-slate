import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, getEmailHeaders, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, feedUrl, companyId } = await req.json();

    if (!userId || !feedUrl || !companyId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !user?.email) {
      return new Response(JSON.stringify({ error: "Could not find user email" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company name
    const { data: company } = await supabase
      .from("companies")
      .select("navn")
      .eq("id", companyId)
      .single();

    const companyName = company?.navn || "AviSafe";
    const webcalUrl = feedUrl.replace("https://", "webcal://");

    const htmlContent = `<!DOCTYPE html>
<html lang="no">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#333333;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;color:#1a1a2e;margin:0 0 8px 0;">📅 Din kalenderlenke</h1>
      <p style="font-size:14px;color:#666;margin:0;">${companyName}</p>
    </div>

    <div style="background:#f8f9fa;border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 16px 0;font-size:15px;">
        Her er din personlige kalenderlenke for automatisk synkronisering av oppdrag og hendelser.
      </p>

      <div style="text-align:center;margin:24px 0;">
        <a href="${feedUrl}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;">
          📅 Åpne kalenderlenke
        </a>
      </div>

      <p style="margin:16px 0 0 0;font-size:13px;color:#888;text-align:center;">
        Kopier lenken fra nettleseren og lim den inn i kalenderappen din (se instruksjoner under).
      </p>

      <div style="text-align:center;margin:16px 0 0 0;">
        <a href="${webcalUrl}" style="font-size:13px;color:#1a1a2e;text-decoration:underline;">
          Åpne direkte i kalenderappen (webcal://)
        </a>
        <p style="font-size:11px;color:#aaa;margin:4px 0 0 0;">Fungerer best fra telefon eller desktop e-postklient</p>
      </div>
    </div>

    <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:16px;color:#1a1a2e;margin:0 0 16px 0;">Manuelt oppsett</h2>
      <p style="font-size:13px;color:#666;margin:0 0 12px 0;">Kopier denne lenken hvis knappen over ikke fungerer:</p>
      <div style="background:#f0f0f0;border-radius:6px;padding:12px;word-break:break-all;font-family:monospace;font-size:12px;color:#333;">
        ${feedUrl}
      </div>
    </div>

    <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:24px;">
      <h2 style="font-size:16px;color:#1a1a2e;margin:0 0 16px 0;">Slik legger du til</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;font-size:14px;vertical-align:top;"><strong>Google Calendar</strong></td>
          <td style="padding:8px 0;font-size:13px;color:#666;">Innstillinger → Legg til kalender → Fra URL → Lim inn lenken</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;vertical-align:top;border-top:1px solid #f0f0f0;"><strong>iPhone / iPad</strong></td>
          <td style="padding:8px 0;font-size:13px;color:#666;border-top:1px solid #f0f0f0;">Innstillinger → Kalender → Kontoer → Legg til konto → Annet → Abonner på kalender</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;vertical-align:top;border-top:1px solid #f0f0f0;"><strong>Outlook</strong></td>
          <td style="padding:8px 0;font-size:13px;color:#666;border-top:1px solid #f0f0f0;">Legg til kalender → Abonner fra nettet → Lim inn lenken</td>
        </tr>
      </table>
    </div>

    <p style="text-align:center;font-size:12px;color:#999;margin-top:32px;">
      Denne lenken er personlig og bør ikke deles med andre.
    </p>
  </div>
</body>
</html>`;

    const emailConfig = await getEmailConfig(companyId);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    const client = new SMTPClient({
      connection: {
        hostname: emailConfig.host,
        port: emailConfig.port,
        tls: emailConfig.secure,
        auth: { username: emailConfig.user, password: emailConfig.pass },
      },
    });

    const emailHeaders = getEmailHeaders();
    await client.send({
      from: senderAddress,
      to: user.email,
      subject: sanitizeSubject(`Din kalenderlenke – ${companyName}`),
      html: htmlContent,
      date: new Date().toUTCString(),
      headers: emailHeaders.headers,
    });
    await client.close();

    console.log(`Calendar link email sent to ${user.email}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending calendar link email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
