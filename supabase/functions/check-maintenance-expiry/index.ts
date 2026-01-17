import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { getEmailConfig, getEmailHeaders, encodeSubject, formatSenderAddress } from "../_shared/email-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MaintenanceItem {
  id: string;
  name: string;
  type: 'drone' | 'equipment' | 'accessory';
  expiryDate: Date;
  daysUntilExpiry: number;
  companyId: string;
}

async function sendPushNotifications(supabase: any, userId: string, title: string, body: string) {
  try {
    // Check if user has push enabled for maintenance reminders
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('push_enabled, push_maintenance_reminder')
      .eq('user_id', userId)
      .single();

    if (!prefs?.push_enabled || !prefs?.push_maintenance_reminder) {
      console.log(`Push not enabled for maintenance reminders for user ${userId}`);
      return false;
    }

    // Get push subscriptions for this user
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`No push subscriptions for user ${userId}`);
      return false;
    }

    console.log(`Sending push to ${subscriptions.length} subscriptions for user ${userId}`);

    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT');

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      console.error('VAPID keys not configured');
      return false;
    }

    const webPush = await import("https://esm.sh/web-push@3.6.7");
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      title,
      body,
      icon: '/pwa-192x192.png',
      badge: '/favicon.png',
      data: { url: '/resources' }
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
        console.log(`Push sent to subscription ${sub.id}`);
      } catch (pushError: any) {
        console.error(`Push error for subscription ${sub.id}:`, pushError);
        if (pushError.statusCode === 410 || pushError.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          console.log(`Removed invalid subscription ${sub.id}`);
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error sending push notifications:', error);
    return false;
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

    console.log('Checking for upcoming maintenance/inspections...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all drones with inspection dates
    const { data: drones, error: dronesError } = await supabase
      .from('drones')
      .select('id, modell, neste_inspeksjon, company_id, aktiv')
      .eq('aktiv', true)
      .not('neste_inspeksjon', 'is', null);

    if (dronesError) {
      console.error('Error fetching drones:', dronesError);
      throw dronesError;
    }

    // Fetch all equipment with maintenance dates
    const { data: equipment, error: equipmentError } = await supabase
      .from('equipment')
      .select('id, navn, neste_vedlikehold, company_id, aktiv')
      .eq('aktiv', true)
      .not('neste_vedlikehold', 'is', null);

    if (equipmentError) {
      console.error('Error fetching equipment:', equipmentError);
      throw equipmentError;
    }

    // Fetch all drone accessories with maintenance dates
    const { data: accessories, error: accessoriesError } = await supabase
      .from('drone_accessories')
      .select('id, navn, neste_vedlikehold, company_id')
      .not('neste_vedlikehold', 'is', null);

    if (accessoriesError) {
      console.error('Error fetching accessories:', accessoriesError);
      throw accessoriesError;
    }

    console.log(`Found ${drones?.length || 0} drones, ${equipment?.length || 0} equipment, ${accessories?.length || 0} accessories with dates`);

    // Fetch all users with inspection reminder enabled (email OR push)
    const { data: notificationPrefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('user_id, inspection_reminder_days, email_inspection_reminder, push_enabled, push_maintenance_reminder')
      .or('email_inspection_reminder.eq.true,and(push_enabled.eq.true,push_maintenance_reminder.eq.true)');

    if (prefsError) {
      console.error('Error fetching notification preferences:', prefsError);
      throw prefsError;
    }

    if (!notificationPrefs || notificationPrefs.length === 0) {
      console.log('No users with inspection reminder enabled');
      return new Response(
        JSON.stringify({ success: true, message: 'No users with reminders enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Found ${notificationPrefs.length} users with inspection reminders enabled`);

    // Get profiles for these users to find their company
    const userIds = notificationPrefs.map(p => p.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, company_id, full_name')
      .in('id', userIds)
      .eq('approved', true);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    // Get auth users for emails
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      console.error('Error fetching auth users:', authError);
      throw authError;
    }

    let totalEmailsSent = 0;
    let totalPushSent = 0;

    // Process each user
    for (const pref of notificationPrefs) {
      const profile = profiles?.find(p => p.id === pref.user_id);
      if (!profile) {
        console.log(`No approved profile found for user ${pref.user_id}`);
        continue;
      }

      const authUser = authUsers.users.find(u => u.id === pref.user_id);
      if (!authUser?.email) {
        console.log(`No email found for user ${pref.user_id}`);
        continue;
      }

      const reminderDays = pref.inspection_reminder_days || 14;
      const reminderDate = new Date(today);
      reminderDate.setDate(reminderDate.getDate() + reminderDays);

      const itemsNeedingAttention: MaintenanceItem[] = [];

      // Check drones for this company
      const companyDrones = drones?.filter(d => d.company_id === profile.company_id) || [];
      for (const drone of companyDrones) {
        const expiryDate = new Date(drone.neste_inspeksjon);
        expiryDate.setHours(0, 0, 0, 0);
        
        if (expiryDate <= reminderDate && expiryDate >= today) {
          const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          itemsNeedingAttention.push({
            id: drone.id,
            name: drone.modell,
            type: 'drone',
            expiryDate,
            daysUntilExpiry: daysUntil,
            companyId: drone.company_id,
          });
        }
      }

      // Check equipment for this company
      const companyEquipment = equipment?.filter(e => e.company_id === profile.company_id) || [];
      for (const equip of companyEquipment) {
        const expiryDate = new Date(equip.neste_vedlikehold);
        expiryDate.setHours(0, 0, 0, 0);
        
        if (expiryDate <= reminderDate && expiryDate >= today) {
          const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          itemsNeedingAttention.push({
            id: equip.id,
            name: equip.navn,
            type: 'equipment',
            expiryDate,
            daysUntilExpiry: daysUntil,
            companyId: equip.company_id,
          });
        }
      }

      // Check accessories for this company
      const companyAccessories = accessories?.filter(a => a.company_id === profile.company_id) || [];
      for (const acc of companyAccessories) {
        const expiryDate = new Date(acc.neste_vedlikehold);
        expiryDate.setHours(0, 0, 0, 0);
        
        if (expiryDate <= reminderDate && expiryDate >= today) {
          const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          itemsNeedingAttention.push({
            id: acc.id,
            name: acc.navn,
            type: 'accessory',
            expiryDate,
            daysUntilExpiry: daysUntil,
            companyId: acc.company_id,
          });
        }
      }

      if (itemsNeedingAttention.length === 0) {
        console.log(`No items needing attention for user ${authUser.email}`);
        continue;
      }

      console.log(`Found ${itemsNeedingAttention.length} items needing attention for user ${authUser.email}`);

      // Sort by days until expiry
      itemsNeedingAttention.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

      // Send push notification if enabled
      if (pref.push_enabled && pref.push_maintenance_reminder) {
        const pushTitle = 'Vedlikeholdspåminnelse';
        const pushBody = itemsNeedingAttention.length === 1
          ? `${itemsNeedingAttention[0].name} krever vedlikehold om ${itemsNeedingAttention[0].daysUntilExpiry} dager`
          : `${itemsNeedingAttention.length} ressurser krever vedlikehold snart`;

        const pushSent = await sendPushNotifications(supabase, pref.user_id, pushTitle, pushBody);
        if (pushSent) totalPushSent++;
      }

      // Send email if enabled
      if (!pref.email_inspection_reminder) {
        console.log(`Email not enabled for user ${authUser.email}, skipping email`);
        continue;
      }

      // Fetch company name
      const { data: companyData } = await supabase
        .from('companies')
        .select('navn')
        .eq('id', profile.company_id)
        .single();

      const companyName = companyData?.navn || 'Selskapet';

      // Get email config
      const emailConfig = await getEmailConfig(profile.company_id);

      // Check for custom template
      const { data: template } = await supabase
        .from('email_templates')
        .select('subject, content')
        .eq('company_id', profile.company_id)
        .eq('template_type', 'maintenance_reminder')
        .maybeSingle();

      // Create email client
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

      const typeLabels: Record<string, string> = {
        drone: 'Drone',
        equipment: 'Utstyr',
        accessory: 'Tilbehør',
      };

      // Build email content
      let emailHtml: string;
      let emailSubject: string;

      if (template) {
        // Use custom template
        const itemsList = itemsNeedingAttention.map(item => {
          const dateStr = item.expiryDate.toLocaleDateString('nb-NO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });
          return `${typeLabels[item.type]}: ${item.name} - ${dateStr} (om ${item.daysUntilExpiry} ${item.daysUntilExpiry === 1 ? 'dag' : 'dager'})`;
        }).join('\n');

        emailSubject = template.subject
          .replace(/\{\{company_name\}\}/g, companyName)
          .replace(/\{\{item_count\}\}/g, String(itemsNeedingAttention.length));

        emailHtml = template.content
          .replace(/\{\{company_name\}\}/g, companyName)
          .replace(/\{\{items_list\}\}/g, itemsList)
          .replace(/\{\{item_count\}\}/g, String(itemsNeedingAttention.length))
          .replace(/\{\{user_name\}\}/g, profile.full_name || 'Bruker');
      } else {
        // Use default template
        const itemsListHtml = itemsNeedingAttention.map(item => {
          const dateStr = item.expiryDate.toLocaleDateString('nb-NO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });

          const urgencyColor = item.daysUntilExpiry <= 3 ? '#ef4444' : item.daysUntilExpiry <= 7 ? '#f59e0b' : '#3b82f6';

          return `<div style="background:#f8f9fa;padding:15px;border-radius:8px;margin-bottom:15px;border-left:4px solid ${urgencyColor};"><h3 style="color:#333;font-size:16px;margin:0 0 8px 0;">${item.name}</h3><div style="margin-bottom:5px;"><strong style="color:#666;">Type:</strong><span style="color:#333;margin-left:8px;">${typeLabels[item.type]}</span></div><div><strong style="color:#666;">Vedlikehold/inspeksjon:</strong><span style="color:${urgencyColor};margin-left:8px;">${dateStr} (om ${item.daysUntilExpiry} ${item.daysUntilExpiry === 1 ? 'dag' : 'dager'})</span></div></div>`;
        }).join('');

        emailSubject = `Vedlikeholdspåminnelse: ${itemsNeedingAttention.length} ${itemsNeedingAttention.length === 1 ? 'ressurs' : 'ressurser'} krever oppmerksomhet`;

        emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;"><div style="max-width:600px;margin:0 auto;padding:20px;"><div style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);color:white;padding:30px 20px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="margin:0;font-size:24px;">Vedlikeholdspåminnelse</h1><p style="margin:10px 0 0 0;opacity:0.9;">${companyName}</p></div><div style="background:#ffffff;padding:30px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;"><p style="color:#666;margin-bottom:20px;">Hei${profile.full_name ? ' ' + profile.full_name : ''},</p><p style="color:#666;margin-bottom:20px;">Følgende ressurser har vedlikehold eller inspeksjon som nærmer seg:</p>${itemsListHtml}<p style="color:#666;margin-top:25px;">Logg inn i AviSafe for å se detaljer og registrere vedlikehold.</p></div><div style="text-align:center;padding:20px;color:#666;font-size:12px;"><p>Denne e-posten er sendt automatisk fra AviSafe.<br>Du kan justere varslingsinnstillingene i din profil.</p></div></div></body></html>`;
      }

      try {
        const senderAddress = formatSenderAddress(emailConfig.fromName || "AviSafe", emailConfig.fromEmail);
        const emailHeaders = getEmailHeaders();

        await emailClient.send({
          from: senderAddress,
          to: authUser.email,
          subject: encodeSubject(emailSubject),
          html: emailHtml,
          date: emailHeaders.date,
          headers: emailHeaders.headers,
        });

        totalEmailsSent++;
        console.log(`Email sent to ${authUser.email}`);
      } catch (emailError) {
        console.error(`Error sending email to ${authUser.email}:`, emailError);
      }

      await emailClient.close();
    }

    console.log(`Maintenance check complete. Sent ${totalEmailsSent} emails, ${totalPushSent} push notifications.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailsSent: totalEmailsSent,
        pushSent: totalPushSent,
        usersChecked: notificationPrefs.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Error in check-maintenance-expiry function:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
