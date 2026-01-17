import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, getEmailHeaders } from "../_shared/email-config.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";
import { getTemplateAttachments, getTemplateId } from "../_shared/attachment-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  recipientId?: string;
  notificationType?: 'email_new_incident' | 'email_new_mission' | 'email_document_expiry' | 'email_new_user_pending' | 'email_followup_assigned';
  subject?: string;
  htmlContent?: string;
  type?: 'notify_admins_new_user' | 'notify_new_incident' | 'notify_new_mission' | 'notify_followup_assigned' | 'bulk_email_users' | 'bulk_email_customers' | 'bulk_email_all_users';
  companyId?: string;
  newUser?: {
    fullName: string;
    email: string;
    companyName: string;
  };
  incident?: {
    tittel: string;
    beskrivelse?: string;
    alvorlighetsgrad: string;
    lokasjon?: string;
  };
  mission?: {
    tittel: string;
    lokasjon: string;
    tidspunkt: string;
    beskrivelse?: string;
    status?: string;
    riskNiva?: string;
    merknader?: string;
    kunde?: string;
    personell?: string[];
    droner?: string[];
    utstyr?: string[];
    ruteLengde?: number;
  };
  followupAssigned?: {
    recipientId: string;
    recipientName: string;
    incidentTitle: string;
    incidentSeverity: string;
    incidentLocation?: string;
    incidentDescription?: string;
  };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { recipientId, notificationType, subject, htmlContent, type, companyId, newUser, incident, mission, followupAssigned }: EmailRequest = await req.json();

    // Handle new incident notification
    if (type === 'notify_new_incident' && companyId && incident) {
      console.log(`Finding users for new incident notification in company ${companyId}`);
      
      const { data: eligibleUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', companyId)
        .eq('approved', true);

      if (usersError) {
        console.error('Error fetching users:', usersError);
        throw usersError;
      }

      if (!eligibleUsers || eligibleUsers.length === 0) {
        console.log('No approved users found in company');
        return new Response(
          JSON.stringify({ success: true, message: 'No eligible users to notify' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const userIds = eligibleUsers.map(u => u.id);

      const { data: notificationPrefs, error: prefsError } = await supabase
        .from('notification_preferences')
        .select('user_id')
        .in('user_id', userIds)
        .eq('email_new_incident', true);

      if (prefsError) {
        console.error('Error fetching notification preferences:', prefsError);
        throw prefsError;
      }

      const usersToNotify = notificationPrefs?.map(pref => pref.user_id) || [];

      if (usersToNotify.length === 0) {
        console.log('No users with incident notifications enabled');
        return new Response(
          JSON.stringify({ success: true, message: 'No users to notify' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Get company name
      const { data: company } = await supabase
        .from('companies')
        .select('navn')
        .eq('id', companyId)
        .single();

      const companyName = company?.navn || 'Selskapet';

      // Get email template with fallback
      const templateResult = await getEmailTemplateWithFallback(
        companyId,
        'incident_notification',
        {
          incident_title: incident.tittel,
          incident_severity: incident.alvorlighetsgrad,
          incident_location: incident.lokasjon || 'Ikke oppgitt',
          incident_description: incident.beskrivelse || 'Ingen beskrivelse',
          company_name: companyName
        }
      );

      console.log(`Using ${templateResult.isCustom ? 'custom' : 'default'} incident notification template`);

      // Get template attachments
      const templateId = await getTemplateId(companyId, 'incident_notification');
      const emailAttachments = templateId ? await getTemplateAttachments(templateId) : [];
      console.log(`Found ${emailAttachments.length} attachments for template`);

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = emailConfig.fromName 
        ? `${emailConfig.fromName} <${emailConfig.fromEmail}>`
        : emailConfig.fromEmail;

      const client = new SMTPClient({
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

      let emailsSent = 0;
      for (const userId of usersToNotify) {
        const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
        if (userError || !user?.email) continue;

        console.log(`Sending new incident notification to ${user.email}`);

        const emailHeaders = getEmailHeaders();
        await client.send({
          from: senderAddress,
          to: user.email,
          subject: templateResult.subject,
          html: templateResult.content,
          date: emailHeaders.date,
          headers: emailHeaders.headers,
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        });

        emailsSent++;
      }

      await client.close();
      console.log(`Sent ${emailsSent} incident notification emails`);

      return new Response(
        JSON.stringify({ success: true, emailsSent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Handle new mission notification
    if (type === 'notify_new_mission' && companyId && mission) {
      console.log(`Finding users for new mission notification in company ${companyId}`);
      
      const { data: eligibleUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', companyId)
        .eq('approved', true);

      if (usersError) {
        console.error('Error fetching users:', usersError);
        throw usersError;
      }

      if (!eligibleUsers || eligibleUsers.length === 0) {
        console.log('No approved users found in company');
        return new Response(
          JSON.stringify({ success: true, message: 'No eligible users to notify' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const userIds = eligibleUsers.map(u => u.id);

      const { data: notificationPrefs, error: prefsError } = await supabase
        .from('notification_preferences')
        .select('user_id')
        .in('user_id', userIds)
        .eq('email_new_mission', true);

      if (prefsError) {
        console.error('Error fetching notification preferences:', prefsError);
        throw prefsError;
      }

      const usersToNotify = notificationPrefs?.map(pref => pref.user_id) || [];

      if (usersToNotify.length === 0) {
        console.log('No users with mission notifications enabled');
        return new Response(
          JSON.stringify({ success: true, message: 'No users to notify' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Get company name
      const { data: company } = await supabase
        .from('companies')
        .select('navn')
        .eq('id', companyId)
        .single();

      const companyName = company?.navn || 'Selskapet';

      const missionDate = new Date(mission.tidspunkt).toLocaleString('nb-NO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Get email template with fallback
      const templateResult = await getEmailTemplateWithFallback(
        companyId,
        'mission_notification',
        {
          mission_title: mission.tittel,
          mission_location: mission.lokasjon,
          mission_date: missionDate,
          mission_status: mission.status || 'Planlagt',
          mission_description: mission.beskrivelse || 'Ingen beskrivelse',
          company_name: companyName
        }
      );

      console.log(`Using ${templateResult.isCustom ? 'custom' : 'default'} mission notification template`);

      // Get template attachments
      const templateId = await getTemplateId(companyId, 'mission_notification');
      const emailAttachments = templateId ? await getTemplateAttachments(templateId) : [];
      console.log(`Found ${emailAttachments.length} attachments for template`);

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = emailConfig.fromName 
        ? `${emailConfig.fromName} <${emailConfig.fromEmail}>`
        : emailConfig.fromEmail;

      const client = new SMTPClient({
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

      let emailsSent = 0;
      for (const userId of usersToNotify) {
        const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
        if (userError || !user?.email) continue;

        console.log(`Sending new mission notification to ${user.email}`);

        const emailHeaders = getEmailHeaders();
        await client.send({
          from: senderAddress,
          to: user.email,
          subject: templateResult.subject,
          html: templateResult.content,
          date: emailHeaders.date,
          headers: emailHeaders.headers,
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        });

        emailsSent++;
      }

      await client.close();
      console.log(`Sent ${emailsSent} mission notification emails`);

      return new Response(
        JSON.stringify({ success: true, emailsSent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Handle new user notification to admins
    if (type === 'notify_admins_new_user' && companyId && newUser) {
      console.log(`Finding admins for new user notification in company ${companyId}`);

      const { data: adminRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'superadmin']);

      if (rolesError) throw rolesError;
      if (!adminRoles || adminRoles.length === 0) {
        console.log('No admin roles found');
        return new Response(
          JSON.stringify({ message: 'No admins found' }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const adminUserIds = adminRoles.map(role => role.user_id);

      const { data: adminProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id')
        .eq('company_id', companyId)
        .in('id', adminUserIds);

      if (profilesError) throw profilesError;
      if (!adminProfiles || adminProfiles.length === 0) {
        console.log('No admin profiles found in company');
        return new Response(
          JSON.stringify({ message: 'No admins in this company' }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const companyAdminIds = adminProfiles.map(profile => profile.id);

      const { data: preferences, error: prefsError } = await supabase
        .from('notification_preferences')
        .select('user_id')
        .in('user_id', companyAdminIds)
        .eq('email_new_user_pending', true);

      if (prefsError) throw prefsError;
      if (!preferences || preferences.length === 0) {
        console.log('No admins with notifications enabled');
        return new Response(
          JSON.stringify({ message: 'No admins with notifications enabled' }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get email template with fallback
      const templateResult = await getEmailTemplateWithFallback(
        companyId,
        'admin_new_user',
        {
          new_user_name: newUser.fullName,
          new_user_email: newUser.email,
          company_name: newUser.companyName
        }
      );

      console.log(`Using ${templateResult.isCustom ? 'custom' : 'default'} admin new user template`);

      // Get template attachments
      const templateId = await getTemplateId(companyId, 'admin_new_user');
      const emailAttachments = templateId ? await getTemplateAttachments(templateId) : [];
      console.log(`Found ${emailAttachments.length} attachments for template`);

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = emailConfig.fromName 
        ? `${emailConfig.fromName} <${emailConfig.fromEmail}>`
        : emailConfig.fromEmail;

      const client = new SMTPClient({
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

      let sentCount = 0;
      for (const pref of preferences) {
        const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(pref.user_id);
        
        if (userError || !user?.email) {
          console.error(`Could not get email for user ${pref.user_id}`);
          continue;
        }

        console.log(`Sending new user notification to ${user.email}`);

        const emailHeaders = getEmailHeaders();
        await client.send({
          from: senderAddress,
          to: user.email,
          subject: templateResult.subject,
          html: templateResult.content,
          date: emailHeaders.date,
          headers: emailHeaders.headers,
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        });
        sentCount++;
      }

      await client.close();

      console.log(`Sent ${sentCount} notification emails`);

      return new Response(
        JSON.stringify({ message: `Sent ${sentCount} notifications` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle followup assigned notification
    if (type === 'notify_followup_assigned' && companyId && followupAssigned) {
      console.log(`Sending followup assigned notification to ${followupAssigned.recipientId}`);

      // Check notification preferences
      const { data: prefs, error: prefsError } = await supabase
        .from("notification_preferences")
        .select("email_followup_assigned")
        .eq("user_id", followupAssigned.recipientId)
        .maybeSingle();

      if (prefsError) {
        console.error("Error fetching preferences:", prefsError);
        throw prefsError;
      }

      if (!prefs || !prefs.email_followup_assigned) {
        console.log(`User has disabled followup assigned notifications`);
        return new Response(
          JSON.stringify({ success: true, message: 'User has disabled this notification type' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Get recipient email
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(followupAssigned.recipientId);
      
      if (userError || !user?.email) {
        console.error("Error fetching user or email not found:", userError);
        throw new Error("User email not found");
      }

      // Get company name
      const { data: company } = await supabase
        .from('companies')
        .select('navn')
        .eq('id', companyId)
        .single();

      const companyName = company?.navn || 'Selskapet';

      // Get email template with fallback
      const templateResult = await getEmailTemplateWithFallback(
        companyId,
        'followup_assigned',
        {
          user_name: followupAssigned.recipientName,
          incident_title: followupAssigned.incidentTitle,
          incident_severity: followupAssigned.incidentSeverity,
          incident_location: followupAssigned.incidentLocation || 'Ikke oppgitt',
          incident_description: followupAssigned.incidentDescription || 'Ingen beskrivelse',
          company_name: companyName
        }
      );

      console.log(`Using ${templateResult.isCustom ? 'custom' : 'default'} followup assigned template`);

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = emailConfig.fromName 
        ? `${emailConfig.fromName} <${emailConfig.fromEmail}>`
        : emailConfig.fromEmail;

      const client = new SMTPClient({
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

      const emailHeaders = getEmailHeaders();
      await client.send({
        from: senderAddress,
        to: user.email,
        subject: templateResult.subject,
        html: templateResult.content,
        date: emailHeaders.date,
        headers: emailHeaders.headers,
      });

      await client.close();
      console.log(`Sent followup assigned notification to ${user.email}`);

      return new Response(
        JSON.stringify({ success: true, message: 'Email sent successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Handle bulk email to users
    if (type === 'bulk_email_users' && companyId && subject && htmlContent) {
      console.log(`Sending bulk email to users in company ${companyId}`);
      
      const { data: eligibleUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('company_id', companyId)
        .eq('approved', true)
        .not('email', 'is', null);

      if (usersError) {
        console.error('Error fetching users:', usersError);
        throw usersError;
      }

      if (!eligibleUsers || eligibleUsers.length === 0) {
        console.log('No approved users with email found in company');
        return new Response(
          JSON.stringify({ success: true, emailsSent: 0, message: 'No eligible users to email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = emailConfig.fromName 
        ? `${emailConfig.fromName} <${emailConfig.fromEmail}>`
        : emailConfig.fromEmail;

      const client = new SMTPClient({
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

      let emailsSent = 0;
      for (const user of eligibleUsers) {
        if (!user.email) continue;

        console.log(`Sending bulk email to user ${user.email}`);

        try {
          const emailHeaders = getEmailHeaders();
          await client.send({
            from: senderAddress,
            to: user.email,
            subject: subject,
            html: htmlContent,
            date: emailHeaders.date,
            headers: emailHeaders.headers,
          });
          emailsSent++;
        } catch (sendError) {
          console.error(`Failed to send to ${user.email}:`, sendError);
        }
      }

      await client.close();
      console.log(`Sent ${emailsSent} bulk user emails`);

      return new Response(
        JSON.stringify({ success: true, emailsSent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Handle bulk email to customers
    if (type === 'bulk_email_customers' && companyId && subject && htmlContent) {
      console.log(`Sending bulk email to customers in company ${companyId}`);
      
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id, navn, epost')
        .eq('company_id', companyId)
        .eq('aktiv', true)
        .not('epost', 'is', null);

      if (customersError) {
        console.error('Error fetching customers:', customersError);
        throw customersError;
      }

      if (!customers || customers.length === 0) {
        console.log('No active customers with email found in company');
        return new Response(
          JSON.stringify({ success: true, emailsSent: 0, message: 'No eligible customers to email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = emailConfig.fromName 
        ? `${emailConfig.fromName} <${emailConfig.fromEmail}>`
        : emailConfig.fromEmail;

      const client = new SMTPClient({
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

      let emailsSent = 0;
      for (const customer of customers) {
        if (!customer.epost) continue;

        console.log(`Sending bulk email to customer ${customer.epost}`);

        try {
          const emailHeaders = getEmailHeaders();
          await client.send({
            from: senderAddress,
            to: customer.epost,
            subject: subject,
            html: htmlContent,
            date: emailHeaders.date,
            headers: emailHeaders.headers,
          });
          emailsSent++;
        } catch (sendError) {
          console.error(`Failed to send to ${customer.epost}:`, sendError);
        }
      }

      await client.close();
      console.log(`Sent ${emailsSent} bulk customer emails`);

      return new Response(
        JSON.stringify({ success: true, emailsSent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Handle bulk email to all users across all companies (superadmin only)
    if (type === 'bulk_email_all_users' && subject && htmlContent) {
      console.log(`Sending bulk email to ALL users across all companies`);
      
      // Fetch all approved users with email from all companies
      const { data: allUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, company_id')
        .eq('approved', true)
        .not('email', 'is', null);

      if (usersError) {
        console.error('Error fetching all users:', usersError);
        throw usersError;
      }

      if (!allUsers || allUsers.length === 0) {
        console.log('No approved users with email found');
        return new Response(
          JSON.stringify({ success: true, emailsSent: 0, message: 'No eligible users to email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Use default email config (from the caller's company or global)
      const emailConfig = await getEmailConfig(companyId);
      const senderAddress = emailConfig.fromName 
        ? `${emailConfig.fromName} <${emailConfig.fromEmail}>`
        : emailConfig.fromEmail;

      const client = new SMTPClient({
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

      let emailsSent = 0;
      for (const user of allUsers) {
        if (!user.email) continue;

        console.log(`Sending bulk email to user ${user.email}`);

        try {
          const emailHeaders = getEmailHeaders();
          await client.send({
            from: senderAddress,
            to: user.email,
            subject: subject,
            html: htmlContent,
            date: emailHeaders.date,
            headers: emailHeaders.headers,
          });
          emailsSent++;
        } catch (sendError) {
          console.error(`Failed to send to ${user.email}:`, sendError);
        }
      }

      await client.close();
      console.log(`Sent ${emailsSent} bulk emails to all users`);

      return new Response(
        JSON.stringify({ success: true, emailsSent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Original single-recipient flow
    if (!recipientId || !subject || !htmlContent) {
      throw new Error('Missing required fields for single recipient email');
    }

    console.log(`Processing notification for user ${recipientId}, type: ${notificationType}`);

    const { data: prefs, error: prefsError } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", recipientId)
      .maybeSingle();

    if (prefsError) {
      console.error("Error fetching preferences:", prefsError);
      throw prefsError;
    }

    if (!prefs || (notificationType && !prefs[notificationType])) {
      console.log(`User has disabled notification type: ${notificationType}`);
      return new Response(
        JSON.stringify({ message: "User has disabled this notification type" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(recipientId);
    
    if (userError || !user?.email) {
      console.error("Error fetching user or email not found:", userError);
      throw new Error("User email not found");
    }

    console.log(`Sending email to ${user.email}`);

    const emailConfig = await getEmailConfig(companyId);
    const senderAddress = emailConfig.fromName 
      ? `${emailConfig.fromName} <${emailConfig.fromEmail}>`
      : emailConfig.fromEmail;

    const client = new SMTPClient({
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

    const emailHeaders = getEmailHeaders();
    await client.send({
      from: senderAddress,
      to: user.email,
      subject: subject,
      html: htmlContent,
      date: emailHeaders.date,
      headers: emailHeaders.headers,
    });

    await client.close();

    console.log("Email sent successfully");

    return new Response(
      JSON.stringify({ message: "Email sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
