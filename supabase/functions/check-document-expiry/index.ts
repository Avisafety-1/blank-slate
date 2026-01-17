import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { getEmailConfig, getEmailHeaders, encodeSubject, formatSenderAddress } from "../_shared/email-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendPushNotifications(supabase: any, companyId: string, title: string, body: string) {
  try {
    // Find users in this company with push document expiry enabled
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('approved', true);

    if (!profiles || profiles.length === 0) return;

    const userIds = profiles.map((p: any) => p.id);

    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('user_id')
      .in('user_id', userIds)
      .eq('push_enabled', true)
      .eq('push_document_expiry', true);

    if (!prefs || prefs.length === 0) return;

    const pushUserIds = prefs.map((p: any) => p.user_id);

    // Get push subscriptions for these users
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', pushUserIds);

    if (!subscriptions || subscriptions.length === 0) return;

    console.log(`Sending push notifications to ${subscriptions.length} subscriptions`);

    // Send push notifications
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT');

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      console.error('VAPID keys not configured');
      return;
    }

    // Import web-push functionality
    const webPush = await import("https://esm.sh/web-push@3.6.7");
    
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      title,
      body,
      icon: '/pwa-192x192.png',
      badge: '/favicon.png',
      data: { url: '/documents' }
    });

    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          payload
        );
        console.log(`Push sent to user ${sub.user_id}`);
      } catch (pushError: any) {
        console.error(`Push error for user ${sub.user_id}:`, pushError);
        // Remove invalid subscription
        if (pushError.statusCode === 410 || pushError.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          console.log(`Removed invalid subscription ${sub.id}`);
        }
      }
    }
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Checking for expiring documents...');

    // Find documents that are expiring soon
    const { data: expiringDocs, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .not('gyldig_til', 'is', null);

    if (docsError) {
      console.error('Error fetching documents:', docsError);
      throw docsError;
    }

    if (!expiringDocs || expiringDocs.length === 0) {
      console.log('No documents with expiry dates found');
      return new Response(
        JSON.stringify({ success: true, message: 'No documents to check' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filter documents where notification should be sent today
    const documentsToNotify = expiringDocs.filter(doc => {
      if (!doc.gyldig_til || !doc.varsel_dager_for_utløp) return false;
      
      const expiryDate = new Date(doc.gyldig_til);
      const notificationDate = new Date(expiryDate);
      notificationDate.setDate(notificationDate.getDate() - doc.varsel_dager_for_utløp);
      notificationDate.setHours(0, 0, 0, 0);
      
      return notificationDate.getTime() === today.getTime();
    });

    if (documentsToNotify.length === 0) {
      console.log('No documents requiring notification today');
      return new Response(
        JSON.stringify({ success: true, message: 'No notifications needed today' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Found ${documentsToNotify.length} documents requiring notification`);

    // Group documents by company
    const documentsByCompany = documentsToNotify.reduce((acc, doc) => {
      if (!acc[doc.company_id]) {
        acc[doc.company_id] = [];
      }
      acc[doc.company_id].push(doc);
      return acc;
    }, {} as Record<string, typeof documentsToNotify>);

    let totalEmailsSent = 0;
    let totalPushSent = 0;

    // Process each company's documents
    for (const [companyId, docs] of Object.entries(documentsByCompany) as [string, typeof documentsToNotify][]) {
      console.log(`Processing ${docs.length} documents for company ${companyId}`);

      // Send push notifications for this company
      const pushTitle = 'Dokumenter utløper snart';
      const pushBody = docs.length === 1 
        ? `${docs[0].tittel} utløper snart`
        : `${docs.length} dokumenter utløper snart`;
      
      await sendPushNotifications(supabase, companyId, pushTitle, pushBody);
      totalPushSent++;

      // Get company-specific email configuration
      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      console.log(`Using email config for company ${companyId}: host=${emailConfig.host}, from=${emailConfig.fromEmail}`);

      const emailClient = new SMTPClient({
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

      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

      // Find users in this company with document expiry notifications enabled
      const { data: eligibleUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', companyId)
        .eq('approved', true);

      if (usersError) {
        console.error('Error fetching users:', usersError);
        await emailClient.close();
        continue;
      }

      if (!eligibleUsers || eligibleUsers.length === 0) {
        console.log(`No approved users found in company ${companyId}`);
        await emailClient.close();
        continue;
      }

      const userIds = eligibleUsers.map(u => u.id);

      const { data: notificationPrefs, error: prefsError } = await supabase
        .from('notification_preferences')
        .select('user_id')
        .in('user_id', userIds)
        .eq('email_document_expiry', true);

      if (prefsError) {
        console.error('Error fetching notification preferences:', prefsError);
        await emailClient.close();
        continue;
      }

      const usersToNotify = notificationPrefs?.map(pref => pref.user_id) || [];

      if (usersToNotify.length === 0) {
        console.log(`No users with document expiry notifications enabled in company ${companyId}`);
        await emailClient.close();
        continue;
      }

      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      if (authError) {
        console.error('Error fetching auth users:', authError);
        await emailClient.close();
        continue;
      }

      // Fetch company details
      const { data: companyData } = await supabase
        .from('companies')
        .select('navn')
        .eq('id', companyId)
        .single();

      const companyName = companyData?.navn || 'Selskapet';

      // Fetch email template
      const { data: template } = await supabase
        .from('email_templates')
        .select('subject, content')
        .eq('company_id', companyId)
        .eq('template_type', 'document_reminder')
        .maybeSingle();

      // Send email to each eligible user
      for (const userId of usersToNotify) {
        const authUser = authUsers.users.find(u => u.id === userId);
        if (!authUser?.email) continue;

        console.log(`Sending document expiry notification to ${authUser.email}`);

        // Process each document separately if using template
        if (template) {
          for (const doc of docs) {
            const expiryDate = new Date(doc.gyldig_til!).toLocaleDateString('nb-NO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            });

            const emailSubject = template.subject
              .replace(/\{\{document_title\}\}/g, doc.tittel)
              .replace(/\{\{expiry_date\}\}/g, expiryDate)
              .replace(/\{\{company_name\}\}/g, companyName);

            const emailContent = template.content
              .replace(/\{\{document_title\}\}/g, doc.tittel)
              .replace(/\{\{expiry_date\}\}/g, expiryDate)
              .replace(/\{\{company_name\}\}/g, companyName);

            const emailHeaders = getEmailHeaders();
            try {
              await emailClient.send({
                from: senderAddress,
                to: authUser.email,
                subject: encodeSubject(emailSubject),
                html: emailContent,
                date: new Date().toUTCString(),
                headers: emailHeaders.headers,
              });

              totalEmailsSent++;
            } catch (emailError) {
              console.error(`Error sending email to ${authUser.email}:`, emailError);
            }
          }
        } else {
          // Use default HTML template
          const documentsListHtml = docs.map(doc => {
            const expiryDate = new Date(doc.gyldig_til!).toLocaleDateString('nb-NO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            });

            const daysUntilExpiry = Math.ceil((new Date(doc.gyldig_til!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            return `
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #ef4444;">
                <h3 style="color: #333; font-size: 16px; margin-bottom: 8px;">${doc.tittel}</h3>
                <div style="margin-bottom: 5px;">
                  <strong style="color: #666;">Kategori:</strong>
                  <span style="color: #333; margin-left: 8px;">${doc.kategori}</span>
                </div>
                <div style="margin-bottom: 5px;">
                  <strong style="color: #666;">Utløper:</strong>
                  <span style="color: #ef4444; margin-left: 8px;">${expiryDate} (om ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'dag' : 'dager'})</span>
                </div>
              </div>
            `;
          }).join('');

          const emailHtml = `
            <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Dokumenter som snart utløper</h1>
            <p style="color: #666; margin-bottom: 20px;">Følgende dokumenter krever din oppmerksomhet:</p>
            ${documentsListHtml}
            <p style="color: #666; margin-top: 20px; font-size: 14px;">Vennligst logg inn for å fornye eller oppdatere disse dokumentene.</p>
          `;

          const emailHeaders = getEmailHeaders();
          try {
            await emailClient.send({
              from: senderAddress,
              to: authUser.email,
              subject: encodeSubject(`Dokumenter som snart utløper (${docs.length} ${docs.length === 1 ? 'dokument' : 'dokumenter'})`),
              html: emailHtml,
              date: new Date().toUTCString(),
              headers: emailHeaders.headers,
            });

            totalEmailsSent++;
          } catch (emailError) {
            console.error(`Error sending email to ${authUser.email}:`, emailError);
          }
        }
      }

      // Close the email client for this company
      await emailClient.close();
    }

    console.log(`Document expiry check complete. Sent ${totalEmailsSent} emails, ${totalPushSent} push batches.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        documentsChecked: documentsToNotify.length,
        emailsSent: totalEmailsSent,
        pushBatchesSent: totalPushSent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Error in check-document-expiry function:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
