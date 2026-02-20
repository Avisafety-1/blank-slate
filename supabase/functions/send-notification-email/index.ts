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
    const { recipientId, notificationType, subject, htmlContent, type, companyId, missionId, newUser, incident, mission, followupAssigned, approvalMission, pilotComment }: EmailRequest = await req.json();

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
      // Find users who can approve and have email_mission_approval enabled
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
      // Fetch personnel linked to this mission
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

      // Fetch mission data
      const { data: missionData, error: missionError } = await supabase
        .from('missions')
        .select('*')
        .eq('id', missionId)
        .single();
      if (missionError || !missionData) throw new Error('Mission not found');

      const effectiveCompanyId = companyId || missionData.company_id;

      // Fetch personnel linked to this mission
      const { data: personnel } = await supabase
        .from('mission_personnel')
        .select('profile_id')
        .eq('mission_id', missionId);

      if (!personnel?.length) {
        return new Response(JSON.stringify({ success: true, message: 'No personnel' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      // Build comments section HTML
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

    // Handle bulk emails
    if (type === 'bulk_email_users' && companyId && subject && htmlContent) {
      // Fetch profile IDs for approved users in this company
      const { data: profiles } = await supabase.from('profiles').select('id').eq('company_id', companyId).eq('approved', true);
      if (!profiles?.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      // Fix images in the HTML content
      const fixedHtmlContent = fixEmailImages(htmlContent);

      let emailsSent = 0;
      for (const p of profiles) {
        try {
          const { data: { user } } = await supabase.auth.admin.getUserById(p.id);
          if (!user?.email) continue;
          const emailHeaders = getEmailHeaders();
          await client.send({ from: senderAddress, to: user.email, subject: sanitizeSubject(subject), html: fixedHtmlContent, date: new Date().toUTCString(), headers: emailHeaders.headers });
          emailsSent++;
        } catch (e) { console.error(`Failed for profile ${p.id}`, e); }
      }
      await client.close();
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (type === 'bulk_email_customers' && companyId && subject && htmlContent) {
      const { data: customers } = await supabase.from('customers').select('epost').eq('company_id', companyId).eq('aktiv', true).not('epost', 'is', null);
      if (!customers?.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig(companyId);
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      // Fix images in the HTML content
      const fixedHtmlContent = fixEmailImages(htmlContent);

      let emailsSent = 0;
      for (const c of customers) {
        if (!c.epost) continue;
        try {
          const emailHeaders = getEmailHeaders();
          await client.send({ from: senderAddress, to: c.epost, subject: sanitizeSubject(subject), html: fixedHtmlContent, date: new Date().toUTCString(), headers: emailHeaders.headers });
          emailsSent++;
        } catch (e) { console.error(`Failed: ${c.epost}`, e); }
      }
      await client.close();
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (type === 'bulk_email_all_users' && subject && htmlContent) {
      // Use auth.admin.listUsers() to get all users with emails (bypasses RLS and profiles.email issue)
      // Paginate through all users (max 1000 per page)
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

      // Always use global SMTP settings for system-wide bulk emails — never a single company's config
      const emailConfig = await getEmailConfig();
      const fromName = emailConfig.fromName || "AviSafe";
      const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      // Fix images in the HTML content
      const fixedHtmlContent = fixEmailImages(htmlContent);

      let emailsSent = 0;
      for (const u of allAuthUsers) {
        if (!u.email) continue;
        try {
          const emailHeaders = getEmailHeaders();
          await client.send({ from: senderAddress, to: u.email, subject: sanitizeSubject(subject), html: fixedHtmlContent, date: new Date().toUTCString(), headers: emailHeaders.headers });
          emailsSent++;
        } catch (e) { console.error(`Failed: ${u.email}`, e); }
      }
      await client.close();
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
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

    // Fix images in the HTML content
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