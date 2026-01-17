import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, getEmailHeaders, encodeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";
import { getTemplateAttachments, getTemplateId } from "../_shared/attachment-utils.ts";

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
  newUser?: { fullName: string; email: string; companyName: string; };
  incident?: { tittel: string; beskrivelse?: string; alvorlighetsgrad: string; lokasjon?: string; };
  mission?: { tittel: string; lokasjon: string; tidspunkt: string; beskrivelse?: string; status?: string; };
  followupAssigned?: { recipientId: string; recipientName: string; incidentTitle: string; incidentSeverity: string; incidentLocation?: string; incidentDescription?: string; };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { recipientId, notificationType, subject, htmlContent, type, companyId, newUser, incident, mission, followupAssigned }: EmailRequest = await req.json();

    // Handle new incident notification
    if (type === 'notify_new_incident' && companyId && incident) {
      const { data: eligibleUsers } = await supabase.from('profiles').select('id').eq('company_id', companyId).eq('approved', true);
      if (!eligibleUsers?.length) return new Response(JSON.stringify({ success: true, message: 'No users' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: notificationPrefs } = await supabase.from('notification_preferences').select('user_id').in('user_id', eligibleUsers.map(u => u.id)).eq('email_new_incident', true);
      if (!notificationPrefs?.length) return new Response(JSON.stringify({ success: true, message: 'No users to notify' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const { data: company } = await supabase.from('companies').select('navn').eq('id', companyId).single();
      const templateResult = await getEmailTemplateWithFallback(companyId, 'incident_notification', { incident_title: incident.tittel, incident_severity: incident.alvorlighetsgrad, incident_location: incident.lokasjon || 'Ikke oppgitt', incident_description: incident.beskrivelse || '', company_name: company?.navn || '' });
      const templateId = await getTemplateId(companyId, 'incident_notification');
      const emailAttachments = templateId ? await getTemplateAttachments(templateId) : [];

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let emailsSent = 0;
      for (const pref of notificationPrefs) {
        const { data: { user } } = await supabase.auth.admin.getUserById(pref.user_id);
        if (!user?.email) continue;
        const emailHeaders = getEmailHeaders();
        await client.send({ from: senderAddress, to: user.email, subject: encodeSubject(templateResult.subject), html: templateResult.content, date: emailHeaders.date, headers: emailHeaders.headers, attachments: emailAttachments.length > 0 ? emailAttachments : undefined });
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
      const emailAttachments = templateId ? await getTemplateAttachments(templateId) : [];

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let emailsSent = 0;
      for (const pref of notificationPrefs) {
        const { data: { user } } = await supabase.auth.admin.getUserById(pref.user_id);
        if (!user?.email) continue;
        const emailHeaders = getEmailHeaders();
        await client.send({ from: senderAddress, to: user.email, subject: encodeSubject(templateResult.subject), html: templateResult.content, date: emailHeaders.date, headers: emailHeaders.headers, attachments: emailAttachments.length > 0 ? emailAttachments : undefined });
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
      const emailAttachments = templateId ? await getTemplateAttachments(templateId) : [];

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let sentCount = 0;
      for (const pref of preferences) {
        const { data: { user } } = await supabase.auth.admin.getUserById(pref.user_id);
        if (!user?.email) continue;
        const emailHeaders = getEmailHeaders();
        await client.send({ from: senderAddress, to: user.email, subject: encodeSubject(templateResult.subject), html: templateResult.content, date: emailHeaders.date, headers: emailHeaders.headers, attachments: emailAttachments.length > 0 ? emailAttachments : undefined });
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
      const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      const emailHeaders = getEmailHeaders();
      await client.send({ from: senderAddress, to: user.email, subject: encodeSubject(templateResult.subject), html: templateResult.content, date: emailHeaders.date, headers: emailHeaders.headers });
      await client.close();
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Handle bulk emails
    if (type === 'bulk_email_users' && companyId && subject && htmlContent) {
      const { data: users } = await supabase.from('profiles').select('email').eq('company_id', companyId).eq('approved', true).not('email', 'is', null);
      if (!users?.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let emailsSent = 0;
      for (const u of users) {
        if (!u.email) continue;
        try {
          const emailHeaders = getEmailHeaders();
          await client.send({ from: senderAddress, to: u.email, subject: encodeSubject(subject), html: htmlContent, date: emailHeaders.date, headers: emailHeaders.headers });
          emailsSent++;
        } catch (e) { console.error(`Failed: ${u.email}`, e); }
      }
      await client.close();
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (type === 'bulk_email_customers' && companyId && subject && htmlContent) {
      const { data: customers } = await supabase.from('customers').select('epost').eq('company_id', companyId).eq('aktiv', true).not('epost', 'is', null);
      if (!customers?.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let emailsSent = 0;
      for (const c of customers) {
        if (!c.epost) continue;
        try {
          const emailHeaders = getEmailHeaders();
          await client.send({ from: senderAddress, to: c.epost, subject: encodeSubject(subject), html: htmlContent, date: emailHeaders.date, headers: emailHeaders.headers });
          emailsSent++;
        } catch (e) { console.error(`Failed: ${c.epost}`, e); }
      }
      await client.close();
      return new Response(JSON.stringify({ success: true, emailsSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (type === 'bulk_email_all_users' && subject && htmlContent) {
      const { data: allUsers } = await supabase.from('profiles').select('email').eq('approved', true).not('email', 'is', null);
      if (!allUsers?.length) return new Response(JSON.stringify({ success: true, emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);
      const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

      let emailsSent = 0;
      for (const u of allUsers) {
        if (!u.email) continue;
        try {
          const emailHeaders = getEmailHeaders();
          await client.send({ from: senderAddress, to: u.email, subject: encodeSubject(subject), html: htmlContent, date: emailHeaders.date, headers: emailHeaders.headers });
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
    const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);
    const client = new SMTPClient({ connection: { hostname: emailConfig.host, port: emailConfig.port, tls: emailConfig.secure, auth: { username: emailConfig.user, password: emailConfig.pass } } });

    const emailHeaders = getEmailHeaders();
    await client.send({ from: senderAddress, to: user.email, subject: encodeSubject(subject), html: htmlContent, date: emailHeaders.date, headers: emailHeaders.headers });
    await client.close();

    return new Response(JSON.stringify({ message: "Email sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
