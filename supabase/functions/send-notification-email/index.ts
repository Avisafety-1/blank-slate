import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, getEmailHeaders, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { getEmailTemplateWithFallback, fixEmailImages } from "../_shared/template-utils.ts";
import { getTemplateAttachments, getTemplateId, generateDownloadLinksHtml } from "../_shared/attachment-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  recipientId?: string;
  notificationType?: string;
  subject?: string;
  htmlContent?: string;
  type?: string;
  companyId?: string;
  missionId?: string;
  sentBy?: string;
  campaignId?: string;
  newUser?: { fullName: string; email: string; companyName: string; };
  incident?: { tittel: string; beskrivelse?: string; alvorlighetsgrad: string; lokasjon?: string; };
  mission?: { tittel: string; lokasjon: string; tidspunkt: string; beskrivelse?: string; status?: string; };
  followupAssigned?: { recipientId: string; recipientName: string; incidentTitle: string; incidentSeverity: string; incidentLocation?: string; incidentDescription?: string; };
  approvalMission?: { tittel: string; lokasjon?: string; tidspunkt: string; beskrivelse?: string; };
  pilotComment?: { missionTitle: string; missionLocation: string; missionDate: string; comment: string; senderName: string; };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { recipientId, notificationType, subject, htmlContent, type, companyId, missionId, sentBy, campaignId, newUser, incident, mission, followupAssigned, approvalMission, pilotComment, dry_run: dryRun }: EmailRequest & { dry_run?: boolean } = await req.json();

    // Handle new incident notification
    if (type === 'notify_new_incident' && companyId && incident) {
      const { data: eligibleUsers } = await supabase.from('profiles').select('id').eq('company_id', companyId).eq('approved', true);
      if (!eligibleUsers?.length) return new Response(JSON.stringify({ success: true, message: 'No users' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: notificationPrefs } = await supabase.from('notification_preferences').select('user_id').in('user_id', eligibleUsers.map(u => u.id)).eq('email_new_incident', true);
      if (!notificationPrefs?.length) return new Response(JSON.stringify({ success: true, message: 'No users to notify' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const templateResult = await getEmailTemplateWithFallback(companyId, 'incident_notification', { incident_title: incident.tittel, incident_severity: incident.alvorlighetsgrad, incident_location: incident.lokasjon || 'Ikke oppgitt', incident_description: incident.beskrivelse || '', company_name: company?.navn || '' });
      const templateId = await getTemplateId(companyId, 'incident_notification');
      const attachmentResult = templateId ? await getTemplateAttachments(templateId) : { attachments: [], skippedAttachments: [], skippedAttachmentDetails: [], totalSizeBytes: 0 };
      const emailAttachments = attachmentResult.attachments;

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let emailsSent = 0;
      for (const pref of notificationPrefs) {
        const { data: { user } } = await supabase.auth.admin.getUserById(pref.user_id);
        if (!user?.email) continue;
        const emailHeaders = getEmailHeaders();
        await client.send({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content, date: new Date().toUTCString(), headers: emailHeaders.headers, attachments: emailAttachments.length > 0 ? emailAttachments : undefined });
        emailsSent++;
      }
      await client.close();
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle new mission notification
    if (type === 'notify_new_mission' && companyId && mission) {
      const { data: eligibleUsers } = await supabase.from('profiles').select('id').eq('company_id', companyId).eq('approved', true);
      if (!eligibleUsers?.length) return new Response(JSON.stringify({ success: true, message: 'No users' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: notificationPrefs } = await supabase.from('notification_preferences').select('user_id').in('user_id', eligibleUsers.map(u => u.id)).eq('email_new_mission', true);
      if (!notificationPrefs?.length) return new Response(JSON.stringify({ success: true, message: 'No users to notify' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const missionDate = new Date(mission.tidspunkt).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const templateResult = await getEmailTemplateWithFallback(companyId, 'mission_notification', { mission_title: mission.tittel, mission_location: mission.lokasjon, mission_date: missionDate, mission_status: mission.status || 'Planlagt', mission_description: mission.beskrivelse || '', company_name: company?.navn || '' });
      const templateId = await getTemplateId(companyId, 'mission_notification');
      const attachmentResult = templateId ? await getTemplateAttachments(templateId) : { attachments: [], skippedAttachments: [], skippedAttachmentDetails: [], totalSizeBytes: 0 };
      const emailAttachments = attachmentResult.attachments;

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let emailsSent = 0;
      for (const pref of notificationPrefs) {
        const { data: { user } } = await supabase.auth.admin.getUserById(pref.user_id);
        if (!user?.email) continue;
        const emailHeaders = getEmailHeaders();
        await client.send({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content, date: new Date().toUTCString(), headers: emailHeaders.headers, attachments: emailAttachments.length > 0 ? emailAttachments : undefined });
        emailsSent++;
      }
      await client.close();
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle new user notification to admins
    if (type === 'notify_admins_new_user' && companyId && newUser) {
      const { data: adminRoles } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'superadmin']);
      if (!adminRoles?.length) return new Response(JSON.stringify({ message: 'No admins' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: adminProfiles } = await supabase.from('profiles').select('id').eq('company_id', companyId).in('id', adminRoles.map(r => r.user_id));
      if (!adminProfiles?.length) return new Response(JSON.stringify({ message: 'No admins in company' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: preferences } = await supabase.from('notification_preferences').select('user_id').in('user_id', adminProfiles.map(p => p.id)).eq('email_new_user_pending', true);
      if (!preferences?.length) return new Response(JSON.stringify({ message: 'No admins with notifications' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const templateResult = await getEmailTemplateWithFallback(companyId, 'admin_new_user', { new_user_name: newUser.fullName, new_user_email: newUser.email, company_name: newUser.companyName });
      const templateId = await getTemplateId(companyId, 'admin_new_user');
      const attachmentResult = templateId ? await getTemplateAttachments(templateId) : { attachments: [], skippedAttachments: [], skippedAttachmentDetails: [], totalSizeBytes: 0 };
      const emailAttachments = attachmentResult.attachments;

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let sentCount = 0;
      for (const pref of preferences) {
        const { data: { user } } = await supabase.auth.admin.getUserById(pref.user_id);
        if (!user?.email) continue;
        const emailHeaders = getEmailHeaders();
        await client.send({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content, date: new Date().toUTCString(), headers: emailHeaders.headers, attachments: emailAttachments.length > 0 ? emailAttachments : undefined });
        sentCount++;
      }
      await client.close();
      return new Response(JSON.stringify({ message: `Sent ${sentCount} notifications` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Handle followup assigned notification
    if (type === 'notify_followup_assigned' && companyId && followupAssigned) {
      const { data: prefs } = await supabase.from("notification_preferences").select("email_followup_assigned").eq("user_id", followupAssigned.recipientId).maybeSingle();
      if (!prefs?.email_followup_assigned) return new Response(JSON.stringify({ success: true, message: 'Disabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: { user } } = await supabase.auth.admin.getUserById(followupAssigned.recipientId);
      if (!user?.email) throw new Error("User email not found");

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const templateResult = await getEmailTemplateWithFallback(companyId, 'followup_assigned', { user_name: followupAssigned.recipientName, incident_title: followupAssigned.incidentTitle, incident_severity: followupAssigned.incidentSeverity, incident_location: followupAssigned.incidentLocation || '', incident_description: followupAssigned.incidentDescription || '', company_name: company?.navn || '' });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      const emailHeaders = getEmailHeaders();
      await client.send({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content, date: new Date().toUTCString(), headers: emailHeaders.headers });
      await client.close();
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle mission approval notification
    if (type === 'notify_mission_approval' && companyId && (mission || approvalMission)) {
      const missionData = mission || approvalMission;
      const { data: approvers } = await supabase.from('profiles').select('id').eq('company_id', companyId).eq('approved', true).eq('can_approve_missions', true);
      if (!approvers?.length) return new Response(JSON.stringify({ success: true, message: 'No approvers' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: notificationPrefs } = await supabase.from('notification_preferences').select('user_id').in('user_id', approvers.map(u => u.id)).eq('email_mission_approval', true);
      if (!notificationPrefs?.length) return new Response(JSON.stringify({ success: true, message: 'No approvers with notifications' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const missionDate = new Date(missionData!.tidspunkt).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const templateResult = await getEmailTemplateWithFallback(companyId, 'mission_approval_request', { mission_title: missionData!.tittel, mission_location: missionData!.lokasjon || 'Ikke oppgitt', mission_date: missionDate, mission_description: missionData!.beskrivelse || '', company_name: company?.navn || '' });

      if (!templateResult.content) {
        console.warn('Empty template content for mission_approval_request, using inline fallback');
        templateResult.content = `<html><head><meta charset="utf-8"></head><body><h2>Oppdrag venter på godkjenning: ${missionData!.tittel}</h2><p>Lokasjon: ${missionData!.lokasjon || 'Ikke oppgitt'}</p><p>Tidspunkt: ${missionDate}</p><p>${missionData!.beskrivelse || ''}</p><p>Logg inn i appen for å godkjenne oppdraget.</p></body></html>`;
        if (!templateResult.subject) templateResult.subject = `Oppdrag venter på godkjenning: ${missionData!.tittel}`;
      }

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let emailsSent = 0;
      for (const pref of notificationPrefs) {
        const { data: { user } } = await supabase.auth.admin.getUserById(pref.user_id);
        if (!user?.email) continue;
        const emailHeaders = getEmailHeaders();
        await client.send({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content, date: new Date().toUTCString(), headers: emailHeaders.headers });
        emailsSent++;
      }
      await client.close();
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle pilot comment notification
    if (type === 'notify_pilot_comment' && companyId && missionId && pilotComment) {
      const { data: personnel } = await supabase
        .from('mission_personnel')
        .select('profile_id')
        .eq('mission_id', missionId);

      if (!personnel?.length) {
        return new Response(JSON.stringify({ success: true, message: 'No personnel' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const missionDate = new Date(pilotComment.missionDate).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      const templateResult = await getEmailTemplateWithFallback(companyId, 'pilot_comment_notification', {
        mission_title: pilotComment.missionTitle,
        mission_location: pilotComment.missionLocation,
        mission_date: missionDate,
        comment: pilotComment.comment,
        sender_name: pilotComment.senderName,
        company_name: company?.navn || '',
      });

      if (!templateResult.content) {
        templateResult.content = `<html><head><meta charset="utf-8"></head><body><h2>Kommentar til oppdrag: ${pilotComment.missionTitle}</h2><p><strong>Fra:</strong> ${pilotComment.senderName}</p><p><strong>Lokasjon:</strong> ${pilotComment.missionLocation}</p><p><strong>Tidspunkt:</strong> ${missionDate}</p><p><strong>Kommentar:</strong></p><p>${pilotComment.comment}</p></body></html>`;
        if (!templateResult.subject) templateResult.subject = `Kommentar til oppdrag: ${pilotComment.missionTitle}`;
      }

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let emailsSent = 0;
      for (const p of personnel) {
        const { data: { user } } = await supabase.auth.admin.getUserById(p.profile_id);
        if (!user?.email) continue;
        const emailHeaders = getEmailHeaders();
        await client.send({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject), html: templateResult.content, date: new Date().toUTCString(), headers: emailHeaders.headers });
        emailsSent++;
      }
      await client.close();
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle mission approved notification to pilots
    if (type === 'notify_mission_approved' && (companyId || true)) {
      if (!missionId) throw new Error('Missing missionId');

      const { data: missionData, error: missionError } = await supabase
        .from('missions')
        .select('*')
        .eq('id', missionId)
        .single();
      if (missionError || !missionData) throw new Error('Mission not found');

      const effectiveCompanyId = companyId || missionData.company_id;

      const { data: personnel } = await supabase
        .from('mission_personnel')
        .select('profile_id')
        .eq('mission_id', missionId);

      if (!personnel?.length) {
        return new Response(JSON.stringify({ success: true, message: 'No personnel' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const comments = Array.isArray(missionData.approver_comments) ? missionData.approver_comments : [];
      let commentsHtml = '';
      if (comments.length > 0) {
        commentsHtml = '<div class="comments-box"><h3>Kommentarer fra godkjenner</h3>';
        for (const c of comments) {
          commentsHtml += `<p><strong>${c.author_name}:</strong> ${c.comment}</p>`;
        }
        commentsHtml += '</div>';
      }

      const missionDate = new Date(missionData.tidspunkt).toLocaleString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const templateResult = await getEmailTemplateWithFallback(effectiveCompanyId, 'mission_approved', {
        mission_title: missionData.tittel,
        mission_location: missionData.lokasjon || 'Ikke oppgitt',
        mission_date: missionDate,
        comments_section: commentsHtml,
      });

      if (!templateResult.content) {
        console.warn('Empty template content for mission_approved, using inline fallback');
        templateResult.content = `<html><head><meta charset="utf-8"></head><body><h2>Oppdrag godkjent: ${missionData.tittel}</h2><p>Lokasjon: ${missionData.lokasjon || 'Ikke oppgitt'}</p><p>Tidspunkt: ${missionDate}</p>${commentsHtml}<p>Logg inn i appen for å se oppdraget.</p></body></html>`;
        if (!templateResult.subject) templateResult.subject = `Oppdrag godkjent: ${missionData.tittel}`;
      }

      const emailConfig = await getEmailConfig(effectiveCompanyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let emailsSent = 0;
      for (const p of personnel) {
        const { data: { user } } = await supabase.auth.admin.getUserById(p.profile_id);
        if (!user?.email) continue;
        const emailHeaders = getEmailHeaders();
        await client.send({ from: senderAddress, to: user.email, subject: sanitizeSubject(templateResult.subject || 'Oppdrag godkjent'), html: templateResult.content, date: new Date().toUTCString(), headers: emailHeaders.headers });
        emailsSent++;
      }
      await client.close();
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ============================================================
    // BULK EMAIL HANDLERS (with campaign logging)
    // ============================================================

    if (type === 'bulk_email_users' && companyId && subject && htmlContent) {
      const { data: profiles } = await supabase.from('profiles').select('id, email').eq('company_id', companyId).eq('approved', true).not('email', 'is', null);
      if (!profiles?.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const smtpConnection = { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } };
      const fixedHtmlContent = fixEmailImages(htmlContent);
      const validProfiles = profiles.filter(p => p.email);

      // Pre-insert campaign — returned immediately to browser
      const { data: campaign } = await supabase.from('bulk_email_campaigns').insert({
        company_id: companyId,
        recipient_type: dryRun ? 'users_dry_run' : 'users',
        subject,
        html_content: htmlContent,
        sent_by: sentBy || null,
        emails_sent: validProfiles.length, // estimert
        sent_to_emails: [],
        failed_emails: [],
      }).select('id').single();

      console.info(`bulk_email_users: queued ${dryRun ? '[DRY RUN] ' : ''}${validProfiles.length} recipients, campaign ${campaign?.id}`);

      if (!dryRun) {
        // Send in background — browser gets response immediately
        const sendPromise = (async () => {
          const sentToEmails: string[] = [];
          const failedEmails: string[] = [];
          try {
            for (const p of validProfiles) {
              const client = new SMTPClient({ connection: smtpConnection });
              try {
                const emailHeaders = getEmailHeaders();
                await client.send({ from: senderAddress, to: p.email!, subject: sanitizeSubject(subject), html: fixedHtmlContent, date: new Date().toUTCString(), headers: emailHeaders.headers });
                sentToEmails.push(p.email!);
                console.info(`bulk_email_users: ✓ sent to ${p.email}`);
              } catch (e) {
                failedEmails.push(p.email!);
                console.error(`bulk_email_users: ✗ failed for ${p.email}`, e);
              } finally {
                try { await client.close(); } catch (_) { /* ignore */ }
              }
            }
          } finally {
            if (campaign?.id) {
              await supabase.from('bulk_email_campaigns').update({
                emails_sent: sentToEmails.length,
                sent_to_emails: sentToEmails,
                failed_emails: failedEmails,
              }).eq('id', campaign.id);
            }
            console.info(`bulk_email_users: complete — sent: ${sentToEmails.length}, failed: ${failedEmails.length}`);
          }
        })();
        EdgeRuntime.waitUntil(sendPromise);
      } else {
        // Dry run: just update with all recipients as "sent"
        const dryRunEmails = validProfiles.map(p => p.email!);
        if (campaign?.id) {
          await supabase.from('bulk_email_campaigns').update({
            emails_sent: dryRunEmails.length,
            sent_to_emails: dryRunEmails,
            failed_emails: [],
          }).eq('id', campaign.id);
        }
      }

      return new Response(JSON.stringify({ success: true, emailsSent: validProfiles.length, campaignId: campaign?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (type === 'bulk_email_customers' && companyId && subject && htmlContent) {
      const { data: customers } = await supabase.from('customers').select('epost').eq('company_id', companyId).eq('aktiv', true).not('epost', 'is', null);
      if (!customers?.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const smtpConnection = { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } };
      const fixedHtmlContent = fixEmailImages(htmlContent);
      const validCustomers = customers.filter(c => c.epost);

      // Pre-insert campaign — returned immediately to browser
      const { data: campaign } = await supabase.from('bulk_email_campaigns').insert({
        company_id: companyId,
        recipient_type: dryRun ? 'customers_dry_run' : 'customers',
        subject,
        html_content: htmlContent,
        sent_by: sentBy || null,
        emails_sent: validCustomers.length, // estimert
        sent_to_emails: [],
        failed_emails: [],
      }).select('id').single();

      console.info(`bulk_email_customers: queued ${dryRun ? '[DRY RUN] ' : ''}${validCustomers.length} recipients, campaign ${campaign?.id}`);

      if (!dryRun) {
        const sendPromise = (async () => {
          const sentToEmails: string[] = [];
          const failedEmails: string[] = [];
          try {
            for (const c of validCustomers) {
              const client = new SMTPClient({ connection: smtpConnection });
              try {
                const emailHeaders = getEmailHeaders();
                await client.send({ from: senderAddress, to: c.epost!, subject: sanitizeSubject(subject), html: fixedHtmlContent, date: new Date().toUTCString(), headers: emailHeaders.headers });
                sentToEmails.push(c.epost!);
                console.info(`bulk_email_customers: ✓ sent to ${c.epost}`);
              } catch (e) {
                failedEmails.push(c.epost!);
                console.error(`bulk_email_customers: ✗ failed for ${c.epost}`, e);
              } finally {
                try { await client.close(); } catch (_) { /* ignore */ }
              }
            }
          } finally {
            if (campaign?.id) {
              await supabase.from('bulk_email_campaigns').update({
                emails_sent: sentToEmails.length,
                sent_to_emails: sentToEmails,
                failed_emails: failedEmails,
              }).eq('id', campaign.id);
            }
            console.info(`bulk_email_customers: complete — sent: ${sentToEmails.length}, failed: ${failedEmails.length}`);
          }
        })();
        EdgeRuntime.waitUntil(sendPromise);
      } else {
        const dryRunEmails = validCustomers.map(c => c.epost!);
        if (campaign?.id) {
          await supabase.from('bulk_email_campaigns').update({
            emails_sent: dryRunEmails.length,
            sent_to_emails: dryRunEmails,
            failed_emails: [],
          }).eq('id', campaign.id);
        }
      }

      return new Response(JSON.stringify({ success: true, emailsSent: validCustomers.length, campaignId: campaign?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (type === 'bulk_email_all_users' && subject && htmlContent) {
      let allAuthUsers: Array<{ email?: string }> = [];
      let page = 1;
      const perPage = 1000;
      while (true) {
        const { data: { users: pageUsers }, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
        if (listError) { console.error('Error listing users:', listError); break; }
        if (!pageUsers?.length) break;
        allAuthUsers = allAuthUsers.concat(pageUsers);
        if (pageUsers.length < perPage) break;
        page++;
      }

      if (!allAuthUsers.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig();
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const smtpConnection = { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } };

      const fixedHtmlContent = fixEmailImages(htmlContent);
      const validUsers = allAuthUsers.filter(u => u.email);

      // Pre-insert campaign — returned immediately to browser
      const { data: campaign } = await supabase.from('bulk_email_campaigns').insert({
        company_id: null,
        recipient_type: dryRun ? 'all_users_dry_run' : 'all_users',
        subject,
        html_content: htmlContent,
        sent_by: sentBy || null,
        emails_sent: validUsers.length, // estimert
        sent_to_emails: [],
        failed_emails: [],
      }).select('id').single();

      console.info(`bulk_email_all_users: queued ${dryRun ? '[DRY RUN] ' : ''}${validUsers.length} recipients, campaign ${campaign?.id}`);

      if (!dryRun) {
        const sendPromise = (async () => {
          const sentToEmails: string[] = [];
          const failedEmails: string[] = [];
          try {
            for (const u of validUsers) {
              const client = new SMTPClient({ connection: smtpConnection });
              try {
                const emailHeaders = getEmailHeaders();
                await client.send({ from: senderAddress, to: u.email!, subject: sanitizeSubject(subject), html: fixedHtmlContent, date: new Date().toUTCString(), headers: emailHeaders.headers });
                sentToEmails.push(u.email!);
                console.info(`bulk_email_all_users: ✓ sent to ${u.email}`);
              } catch (e) {
                failedEmails.push(u.email!);
                console.error(`bulk_email_all_users: ✗ failed for ${u.email}`, e);
              } finally {
                try { await client.close(); } catch (_) { /* ignore */ }
              }
            }
          } finally {
            if (campaign?.id) {
              await supabase.from('bulk_email_campaigns').update({
                emails_sent: sentToEmails.length,
                sent_to_emails: sentToEmails,
                failed_emails: failedEmails,
              }).eq('id', campaign.id);
            }
            console.info(`bulk_email_all_users: complete — sent: ${sentToEmails.length}, failed: ${failedEmails.length}`);
          }
        })();
        EdgeRuntime.waitUntil(sendPromise);
      } else {
        const dryRunEmails = validUsers.map(u => u.email!);
        if (campaign?.id) {
          await supabase.from('bulk_email_campaigns').update({
            emails_sent: dryRunEmails.length,
            sent_to_emails: dryRunEmails,
            failed_emails: [],
          }).eq('id', campaign.id);
        }
      }

      return new Response(JSON.stringify({ success: true, emailsSent: validUsers.length, campaignId: campaign?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ============================================================
    // SEND TO MISSED — send campaign only to new/missed recipients
    // ============================================================
    if (type === 'send_to_missed' && campaignId) {
      // Fetch the original campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('bulk_email_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (campaignError || !campaign) {
        return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const alreadySentEmails = new Set<string>((campaign.sent_to_emails || []).map((e: string) => e.toLowerCase()));
      const fixedHtmlContent = fixEmailImages(campaign.html_content);

      let eligibleEmails: string[] = [];

      if (campaign.recipient_type === 'all_users') {
        // Fetch all auth users
        let allAuthUsers: Array<{ email?: string }> = [];
        let page = 1;
        const perPage = 1000;
        while (true) {
          const { data: { users: pageUsers }, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
          if (listError) break;
          if (!pageUsers?.length) break;
          allAuthUsers = allAuthUsers.concat(pageUsers);
          if (pageUsers.length < perPage) break;
          page++;
        }
        eligibleEmails = allAuthUsers.filter(u => u.email).map(u => u.email!);
      } else if (campaign.recipient_type === 'users' && campaign.company_id) {
        const { data: profiles } = await supabase.from('profiles')
          .select('email')
          .eq('company_id', campaign.company_id)
          .eq('approved', true)
          .not('email', 'is', null);
        eligibleEmails = (profiles || []).map((p: { email: string | null }) => p.email).filter(Boolean) as string[];
      } else if (campaign.recipient_type === 'customers' && campaign.company_id) {
        const { data: customers } = await supabase.from('customers').select('epost').eq('company_id', campaign.company_id).eq('aktiv', true).not('epost', 'is', null);
        eligibleEmails = (customers || []).map(c => c.epost).filter(Boolean) as string[];
      }

      // Filter to only those NOT already in sent_to_emails
      const missedEmails = eligibleEmails.filter(email => !alreadySentEmails.has(email.toLowerCase()));

      if (missedEmails.length === 0) {
        return new Response(JSON.stringify({ success: true, emailsSent: 0, message: 'No new recipients' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      // Set up SMTP
      const emailConfig = campaign.recipient_type === 'all_users'
        ? await getEmailConfig()
        : await getEmailConfig(campaign.company_id || undefined);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const smtpConnection = { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } };

      let emailsSent = 0;
      const newlySentEmails: string[] = [];
      const newlyFailedEmails: string[] = [];

      // New SMTP client per recipient to avoid connection drops
      for (const email of missedEmails) {
        const missedClient = new SMTPClient({ connection: smtpConnection });
        try {
          const emailHeaders = getEmailHeaders();
          await missedClient.send({ from: senderAddress, to: email, subject: sanitizeSubject(campaign.subject), html: fixedHtmlContent, date: new Date().toUTCString(), headers: emailHeaders.headers });
          emailsSent++;
          newlySentEmails.push(email);
        } catch (e) {
          newlyFailedEmails.push(email);
          console.error(`send_to_missed: failed for ${email}`, e);
        } finally {
          try { await missedClient.close(); } catch (_) { /* ignore */ }
        }
      }

      // Update campaign with new recipients
      const updatedSentEmails = [...(campaign.sent_to_emails || []), ...newlySentEmails];
      const updatedFailedEmails = [...(campaign.failed_emails || []), ...newlyFailedEmails];
      await supabase.from('bulk_email_campaigns').update({
        sent_to_emails: updatedSentEmails,
        failed_emails: updatedFailedEmails,
        emails_sent: updatedSentEmails.length,
      }).eq('id', campaignId);

      return new Response(JSON.stringify({ success: true, emailsSent, newlySentEmails, newlyFailedEmails }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ============================================================
    // PREVIEW MISSED COUNT — count how many recipients would receive the campaign
    // ============================================================
    if (type === 'preview_missed_count' && campaignId) {
      const { data: campaign, error: campaignError } = await supabase
        .from('bulk_email_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (campaignError || !campaign) {
        return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const alreadySentEmails = new Set<string>((campaign.sent_to_emails || []).map((e: string) => e.toLowerCase()));

      let eligibleEmails: string[] = [];

      if (campaign.recipient_type === 'all_users') {
        let allAuthUsers: Array<{ email?: string }> = [];
        let page = 1;
        const perPage = 1000;
        while (true) {
          const { data: { users: pageUsers }, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
          if (listError) break;
          if (!pageUsers?.length) break;
          allAuthUsers = allAuthUsers.concat(pageUsers);
          if (pageUsers.length < perPage) break;
          page++;
        }
        eligibleEmails = allAuthUsers.filter(u => u.email).map(u => u.email!);
      } else if (campaign.recipient_type === 'users' && campaign.company_id) {
        const { data: profiles } = await supabase.from('profiles').select('email').eq('company_id', campaign.company_id).eq('approved', true).not('email', 'is', null);
        eligibleEmails = (profiles || []).map((p: { email: string | null }) => p.email).filter(Boolean) as string[];
      } else if (campaign.recipient_type === 'customers' && campaign.company_id) {
        const { data: customers } = await supabase.from('customers').select('epost').eq('company_id', campaign.company_id).eq('aktiv', true).not('epost', 'is', null);
        eligibleEmails = (customers || []).map(c => c.epost).filter(Boolean) as string[];
      }

      const missedCount = eligibleEmails.filter(email => !alreadySentEmails.has(email.toLowerCase())).length;

      return new Response(JSON.stringify({ success: true, missedCount, totalEligible: eligibleEmails.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Single recipient flow
    if (!recipientId || !subject || !htmlContent) throw new Error('Missing required fields');

    const { data: prefs } = await supabase.from("notification_preferences").select("*").eq("user_id", recipientId).maybeSingle();
    if (!prefs || (notificationType && !prefs[notificationType])) {
      return new Response(JSON.stringify({ message: "Disabled" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: { user } } = await supabase.auth.admin.getUserById(recipientId);
    if (!user?.email) throw new Error("User email not found");

    const emailConfig = await getEmailConfig(companyId);
    const fromName = emailConfig.fromName || "AviSafe";
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
    const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

    const fixedHtmlContent = fixEmailImages(htmlContent);

    const emailHeaders = getEmailHeaders();
    await client.send({ from: senderAddress, to: user.email, subject: sanitizeSubject(subject), html: fixedHtmlContent, date: new Date().toUTCString(), headers: emailHeaders.headers });
    await client.close();

    return new Response(JSON.stringify({ message: "Email sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
