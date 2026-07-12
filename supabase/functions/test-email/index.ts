import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { requireUser, requireRole, getUserCompanyId, authErrorResponse, AuthError } from "../_shared/auth.ts";
import { resolveLanguage } from "../_shared/email-i18n.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // AuthZ: require valid JWT + (superadmin OR admin in target company)
    let user;
    try {
      user = await requireUser(req);
    } catch (e) {
      return authErrorResponse(e, corsHeaders);
    }

    const body = await req.json();
    const { company_id, recipient_email, subject: customSubject } = body;
    const language = resolveLanguage(req, body);

    if (!company_id || !recipient_email) {
      return new Response(JSON.stringify({ error: "company_id and recipient_email are required" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check role: superadmin can test for any company; admin only for their own
    try {
      try {
        await requireRole(user, ["superadmin"]);
      } catch {
        await requireRole(user, ["admin"]);
        const callerCompanyId = await getUserCompanyId(user);
        if (callerCompanyId !== company_id) {
          throw new AuthError(403, "Cannot test email for another company");
        }
      }
    } catch (e) {
      return authErrorResponse(e, corsHeaders);
    }

    const emailConfig = await getEmailConfig(company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    const strings = language === 'en'
      ? {
          defaultSubject: 'Test email from your system',
          heading: '✓ Test email',
          intro: 'The email settings are working correctly.',
          successMessage: 'Test email sent successfully',
          errorMessage: 'Could not send test email',
        }
      : {
          defaultSubject: 'Test e-post fra ditt system',
          heading: '✓ Test e-post',
          intro: 'E-postinnstillingene fungerer korrekt.',
          successMessage: 'Test e-post sendt vellykket',
          errorMessage: 'Kunne ikke sende test e-post',
        };
    const rawSubject = customSubject || strings.defaultSubject;
    const subject = sanitizeSubject(rawSubject);

    console.log("=== Email Debug Info ===");
    console.log("From:", senderAddress);
    console.log("To:", recipient_email);
    console.log("Subject:", subject);
    console.log("Caller:", user.id);
    console.log("Language:", language);
    console.log("========================");

    await sendEmail({
      from: senderAddress,
      to: recipient_email,
      subject: subject,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>${strings.heading}</h1><p>${strings.intro}</p><p>From: ${senderAddress}</p><p>Subject: ${subject}</p><p>Sendt via Resend API.</p></body></html>`,
    });

    return new Response(JSON.stringify({
      success: true,
      message: strings.successMessage,
      debug: {
        from: senderAddress,
        to: recipient_email,
        subject: subject,
        language,
      }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Could not send test email", details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
