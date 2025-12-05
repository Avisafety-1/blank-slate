import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig } from "../_shared/email-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  recipientId?: string;
  notificationType?: 'email_new_incident' | 'email_new_mission' | 'email_document_expiry' | 'email_new_user_pending' | 'email_followup_assigned';
  subject?: string;
  htmlContent?: string;
  // Different notification modes
  type?: 'notify_admins_new_user' | 'notify_new_incident' | 'notify_new_mission';
  companyId?: string;
  // For new user notifications
  newUser?: {
    fullName: string;
    email: string;
    companyName: string;
  };
  // For new incident notifications
  incident?: {
    tittel: string;
    beskrivelse?: string;
    alvorlighetsgrad: string;
    lokasjon?: string;
  };
  // For new mission notifications
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

    const { recipientId, notificationType, subject, htmlContent, type, companyId, newUser, incident, mission }: EmailRequest = await req.json();

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

      const severityColors: Record<string, string> = {
        'Lav': '#22c55e',
        'Middels': '#eab308',
        'Høy': '#f97316',
        'Kritisk': '#ef4444'
      };

      const incidentHtml = `
        <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Ny hendelse rapportert</h1>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #333; font-size: 18px; margin-bottom: 15px;">${incident.tittel}</h2>
          <div style="margin-bottom: 10px;">
            <strong style="color: #666;">Alvorlighetsgrad:</strong>
            <span style="display: inline-block; background: ${severityColors[incident.alvorlighetsgrad] || '#666'}; color: white; padding: 4px 12px; border-radius: 4px; margin-left: 8px;">${incident.alvorlighetsgrad}</span>
          </div>
          ${incident.lokasjon ? `<div style="margin-bottom: 10px;"><strong style="color: #666;">Lokasjon:</strong> <span style="color: #333;">${incident.lokasjon}</span></div>` : ''}
          ${incident.beskrivelse ? `<div style="margin-top: 15px;"><strong style="color: #666;">Beskrivelse:</strong><p style="color: #333; margin-top: 5px;">${incident.beskrivelse}</p></div>` : ''}
        </div>
      `;

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

        await client.send({
          from: senderAddress,
          to: user.email,
          subject: `Ny hendelse: ${incident.tittel}`,
          html: incidentHtml,
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

      const missionDate = new Date(mission.tidspunkt).toLocaleString('nb-NO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const riskColors: Record<string, string> = {
        'Lav': '#22c55e',
        'Middels': '#eab308',
        'Høy': '#f97316',
        'Kritisk': '#ef4444'
      };

      const formatDistance = (meters?: number) => {
        if (!meters) return null;
        return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
      };

      const missionHtml = `
        <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Nytt oppdrag planlagt</h1>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #333; font-size: 18px; margin-bottom: 15px;">${mission.tittel}</h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            ${mission.status ? `<tr><td style="padding: 8px 0; color: #666; width: 120px;"><strong>Status:</strong></td><td style="padding: 8px 0;"><span style="background: #3b82f6; color: white; padding: 4px 12px; border-radius: 4px;">${mission.status}</span></td></tr>` : ''}
            ${mission.riskNiva ? `<tr><td style="padding: 8px 0; color: #666;"><strong>Risikonivå:</strong></td><td style="padding: 8px 0;"><span style="background: ${riskColors[mission.riskNiva] || '#666'}; color: white; padding: 4px 12px; border-radius: 4px;">${mission.riskNiva}</span></td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #666;"><strong>Lokasjon:</strong></td><td style="padding: 8px 0; color: #333;">${mission.lokasjon}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;"><strong>Tidspunkt:</strong></td><td style="padding: 8px 0; color: #333;">${missionDate}</td></tr>
            ${mission.kunde ? `<tr><td style="padding: 8px 0; color: #666;"><strong>Kunde:</strong></td><td style="padding: 8px 0; color: #333;">${mission.kunde}</td></tr>` : ''}
            ${mission.ruteLengde ? `<tr><td style="padding: 8px 0; color: #666;"><strong>Rutelengde:</strong></td><td style="padding: 8px 0; color: #333;">${formatDistance(mission.ruteLengde)}</td></tr>` : ''}
          </table>

          ${mission.beskrivelse ? `<div style="margin-top: 15px;"><strong style="color: #666;">Beskrivelse:</strong><p style="color: #333; margin-top: 5px;">${mission.beskrivelse}</p></div>` : ''}
          ${mission.merknader ? `<div style="margin-top: 15px;"><strong style="color: #666;">Merknader:</strong><p style="color: #333; margin-top: 5px;">${mission.merknader}</p></div>` : ''}
        </div>

        ${(mission.personell && mission.personell.length > 0) || (mission.droner && mission.droner.length > 0) || (mission.utstyr && mission.utstyr.length > 0) ? `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h3 style="color: #333; font-size: 16px; margin-bottom: 15px;">Ressurser</h3>
          ${mission.personell && mission.personell.length > 0 ? `<div style="margin-bottom: 10px;"><strong style="color: #666;">👤 Personell:</strong> <span style="color: #333;">${mission.personell.join(', ')}</span></div>` : ''}
          ${mission.droner && mission.droner.length > 0 ? `<div style="margin-bottom: 10px;"><strong style="color: #666;">🚁 Droner:</strong> <span style="color: #333;">${mission.droner.join(', ')}</span></div>` : ''}
          ${mission.utstyr && mission.utstyr.length > 0 ? `<div style="margin-bottom: 10px;"><strong style="color: #666;">🔧 Utstyr:</strong> <span style="color: #333;">${mission.utstyr.join(', ')}</span></div>` : ''}
        </div>
        ` : ''}

        <p style="margin-top: 20px; color: #666;">Logg inn i Avisafe for mer informasjon.</p>
      `;

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

        await client.send({
          from: senderAddress,
          to: user.email,
          subject: `Nytt oppdrag: ${mission.tittel}`,
          html: missionHtml,
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

      // Find all admins and superadmins in the company with notifications enabled
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

      // Get profiles for admins in the same company
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

      // Get notification preferences
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

      // Generate HTML content
      const html = `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.user-info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #1e40af; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Ny bruker venter på godkjenning</h1>
</div>
<div class="content">
<p>En ny bruker har registrert seg og venter på godkjenning.</p>
<div class="user-info">
<p><strong>Navn:</strong> ${newUser.fullName}</p>
<p><strong>E-post:</strong> ${newUser.email}</p>
<p><strong>Selskap:</strong> ${newUser.companyName}</p>
</div>
<p style="margin-top: 20px;">Logg inn i Avisafe for å godkjenne eller avslå denne brukeren.</p>
</div>
</div>
</body>
</html>`;

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

      // Send email to each admin
      let sentCount = 0;
      for (const pref of preferences) {
        const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(pref.user_id);
        
        if (userError || !user?.email) {
          console.error(`Could not get email for user ${pref.user_id}`);
          continue;
        }

        console.log(`Sending new user notification to ${user.email}`);

        await client.send({
          from: senderAddress,
          to: user.email,
          subject: 'Ny bruker venter på godkjenning',
          html: html,
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

    // Original single-recipient flow
    if (!recipientId || !subject || !htmlContent) {
      throw new Error('Missing required fields for single recipient email');
    }

    console.log(`Processing notification for user ${recipientId}, type: ${notificationType}`);

    // 1. Check notification preferences
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

    // 2. Get user's email address
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(recipientId);
    
    if (userError || !user?.email) {
      console.error("Error fetching user or email not found:", userError);
      throw new Error("User email not found");
    }

    console.log(`Sending email to ${user.email}`);

    // 3. Send email via SMTP
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

    await client.send({
      from: senderAddress,
      to: user.email,
      subject: subject,
      html: htmlContent,
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
