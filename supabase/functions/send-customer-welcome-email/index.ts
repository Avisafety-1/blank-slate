import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { getEmailConfig, getEmailHeaders, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { getTemplateAttachments, generateDownloadLinksHtml } from "../_shared/attachment-utils.ts";
import { fixEmailImages } from "../_shared/template-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer_email)) {
      console.error("Invalid email format:", customer_email);
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('id, subject, content')
      .eq('company_id', company_id)
      .eq('template_type', 'customer_welcome')
      .maybeSingle();

    if (templateError) throw templateError;

    let attachments: any[] = [];
    let skippedAttachments: string[] = [];
    let downloadLinksHtml = '';
    
    if (template?.id) {
      try {
        const attachmentResult = await getTemplateAttachments(template.id);
        attachments = attachmentResult.attachments;
        skippedAttachments = attachmentResult.skippedAttachments;
        
        // Generate download links for large files
        downloadLinksHtml = generateDownloadLinksHtml(attachmentResult.skippedAttachmentDetails);
        
        console.log(`Attachment result: ${attachments.length} included, ${skippedAttachments.length} skipped`);
        if (downloadLinksHtml) {
          console.log('Generated download links HTML for large attachments');
        }
      } catch (attachmentError) {
        console.error("Failed to fetch attachments, sending email without them:", attachmentError);
        // Continue without attachments
      }
    }

    let emailSubject = `Velkommen som kunde hos ${company_name}`;
    let emailContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>Hei ${customer_name}!</h2><p>Vi er glade for å ønske deg velkommen som kunde hos <strong>${company_name}</strong>.</p></body></html>`;

    if (template) {
      emailSubject = template.subject.replace(/\{\{customer_name\}\}/g, customer_name).replace(/\{\{company_name\}\}/g, company_name);
      emailContent = template.content.replace(/\{\{customer_name\}\}/g, customer_name).replace(/\{\{company_name\}\}/g, company_name);
    }

    // Fix images to display correctly in email clients
    emailContent = fixEmailImages(emailContent);

    // Append download links to email content if there are large attachments
    if (downloadLinksHtml) {
      // Insert before closing </body> tag if present, otherwise append
      if (emailContent.includes('</body>')) {
        emailContent = emailContent.replace('</body>', `${downloadLinksHtml}</body>`);
      } else {
        emailContent += downloadLinksHtml;
      }
    }

    const emailConfig = await getEmailConfig(company_id);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
    const emailHeaders = getEmailHeaders();

    // Sanitize subject - do NOT pre-encode, let denomailer handle it
    const sanitizedSubject = sanitizeSubject(emailSubject);

    // Debug logging
    console.log("=== Customer Welcome Email Debug ===");
    console.log("From:", senderAddress);
    console.log("To:", customer_email);
    console.log("Raw subject:", emailSubject);
    console.log("Sanitized subject:", sanitizedSubject);
    console.log("Message-ID:", emailHeaders.headers["Message-ID"]);
    console.log("Attachments count:", attachments.length);
    console.log("Download links included:", downloadLinksHtml ? 'yes' : 'no');
    console.log("====================================");

    const client = new SMTPClient({
      connection: {
        hostname: emailConfig.host,
        port: emailConfig.port,
        tls: emailConfig.port === 465 || emailConfig.secure,
        auth: { username: emailConfig.user, password: emailConfig.pass },
      },
    });

    await client.send({
      from: senderAddress,
      to: customer_email,
      subject: sanitizedSubject,
      html: emailContent,
      date: new Date().toUTCString(),
      headers: emailHeaders.headers,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    await client.close();
    console.log("Customer welcome email sent successfully to:", customer_email);

    const response: any = { 
      success: true, 
      message: "Welcome email sent successfully",
      attachmentsIncluded: attachments.length,
      downloadLinksIncluded: downloadLinksHtml ? true : false
    };
    
    if (skippedAttachments.length > 0) {
      response.skippedAttachments = skippedAttachments;
      if (downloadLinksHtml) {
        response.message = `Email sent with download links for ${skippedAttachments.length} large attachment(s)`;
      } else {
        response.message = `Email sent, but ${skippedAttachments.length} attachment(s) were skipped`;
      }
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    const errorMessage = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    console.error("Error in send-customer-welcome-email function:", errorMessage, error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
