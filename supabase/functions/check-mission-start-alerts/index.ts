import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { requireCronSecret } from "../_shared/cron.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function normalizeMsisdn(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^\d{8}$/.test(digits) && /^[49]/.test(digits)) digits = '47' + digits;
  if (!/^\d{8,15}$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

const LOGO_URL = 'https://app.avisafe.no/avisafe-logo-text.png';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireCronSecret(req);
  } catch (e) {
    const status = (e as any)?.status ?? 401;
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = Date.now();
    const horizon = new Date(now + 24 * 60 * 60 * 1000).toISOString();

    // Kommende oppdrag innenfor 24 t som ikke er avsluttet/avbrutt
    const { data: missions, error: missionsError } = await supabase
      .from('missions')
      .select('id, tittel, tidspunkt, company_id, status')
      .in('status', ['Planlagt', 'Pågående'])
      .gt('tidspunkt', new Date(now).toISOString())
      .lt('tidspunkt', horizon);

    if (missionsError) throw missionsError;
    if (!missions || missions.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const missionIds = missions.map((m) => m.id);

    // Mottakere = tildelt personell på oppdraget (IKKE oppretteren)
    const { data: personnel, error: personnelError } = await supabase
      .from('mission_personnel')
      .select('mission_id, profile_id')
      .in('mission_id', missionIds);
    if (personnelError) throw personnelError;

    const pairs = (personnel ?? []).filter((p) => !!p.profile_id);
    if (pairs.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userIds = [...new Set(pairs.map((p) => p.profile_id as string))];

    const [
      { data: prefs, error: prefsError },
      { data: profiles, error: profilesError },
      { data: alreadySent, error: sendsError },
    ] = await Promise.all([
      supabase
        .from('notification_preferences')
        .select('user_id, mission_start_alert_minutes, mission_start_alert_email, mission_start_alert_sms')
        .in('user_id', userIds),
      supabase.from('profiles').select('id, full_name, email, telefon, preferred_language').in('id', userIds),
      supabase
        .from('mission_start_alert_sends')
        .select('mission_id, user_id')
        .in('mission_id', missionIds),
    ]);

    if (prefsError) console.error('prefs query failed:', prefsError);
    if (profilesError) console.error('profiles query failed:', profilesError);
    if (sendsError) console.error('sends query failed:', sendsError);

    const prefByUser = new Map((prefs ?? []).map((p) => [p.user_id, p]));
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const sentKeys = new Set((alreadySent ?? []).map((r) => `${r.mission_id}:${r.user_id}`));
    const missionById = new Map(missions.map((m) => [m.id, m]));

    let sent = 0;

    for (const pair of pairs) {
      const userId = pair.profile_id as string;
      const mission = missionById.get(pair.mission_id);
      if (!mission) continue;
      const key = `${mission.id}:${userId}`;
      if (sentKeys.has(key)) {
        console.log(`[skip] ${key}: already sent`);
        continue;
      }

      const pref = prefByUser.get(userId);
      const wantsEmail = pref?.mission_start_alert_email === true;
      const wantsSms = pref?.mission_start_alert_sms === true;
      if (!wantsEmail && !wantsSms) {
        console.log(`[skip] ${key}: no channels enabled`);
        continue;
      }

      const leadMinutes = Number(pref?.mission_start_alert_minutes ?? 30) || 30;
      const minutesUntil = Math.round((new Date(mission.tidspunkt).getTime() - now) / 60000);
      if (minutesUntil > leadMinutes) continue;

      let emailOk = false;
      let smsOk = false;

      const profile = profileById.get(userId);
      const isEn = String(profile?.preferred_language ?? '').toLowerCase().startsWith('en');
      const missionName = mission.tittel || (isEn ? 'mission' : 'oppdrag');
      const startFormatted = new Date(mission.tidspunkt).toLocaleString(isEn ? 'en-GB' : 'nb-NO', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      });

      const smsText = isEn
        ? `AviSafe: Your mission ${missionName} starts in ${minutesUntil} minutes. Remember to start it in AviSafe.`
        : `AviSafe: Ditt oppdrag ${missionName} starter om ${minutesUntil} minutter. Husk å starte det i AviSafe.`;

      // E-post
      if (wantsEmail) {
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(userId);
          const email = authUser?.user?.email ?? profile?.email;
          if (!email) console.warn(`[email] ${key}: no email address found`);
          if (email) {
            const emailConfig = await getEmailConfig(mission.company_id ?? undefined);
            const senderAddress = formatSenderAddress(emailConfig.fromName || 'AviSafe', emailConfig.fromEmail);
            const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align:center;padding:20px 20px 10px 20px;">
    <img src="${LOGO_URL}" alt="AviSafe" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;" />
  </div>
  <div style="background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 20px;">${isEn ? 'Mission starting soon' : 'Oppdrag starter snart'}</h1>
  </div>
  <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
    <p>${isEn ? 'Hi' : 'Hei'} ${profile?.full_name ?? ''},</p>
    <p>${isEn
      ? `Your mission <strong>${missionName}</strong> starts in <strong>${minutesUntil} minutes</strong> (${startFormatted}). Remember to start it in AviSafe.`
      : `Ditt oppdrag <strong>${missionName}</strong> starter om <strong>${minutesUntil} minutter</strong> (${startFormatted}). Husk å starte det i AviSafe.`}</p>
  </div>
</body></html>`;
            await sendEmail({
              from: senderAddress,
              to: email,
              subject: sanitizeSubject(isEn ? `Mission starts in ${minutesUntil} minutes` : `Oppdrag starter om ${minutesUntil} minutter`),
              html,
            });
          }
        } catch (err) {
          console.error(`Email failed for ${userId}:`, err);
        }
      }

      // SMS
      if (wantsSms) {
        try {
          const msisdn = normalizeMsisdn(profile?.telefon);
          const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
          const GATEWAYAPI_API_KEY = Deno.env.get('GATEWAYAPI_API_KEY');
          if (msisdn && LOVABLE_API_KEY && GATEWAYAPI_API_KEY) {
            const res = await fetch('https://connector-gateway.lovable.dev/gatewayapi/mobile/single', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                'X-Connection-Api-Key': GATEWAYAPI_API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                sender: 'AviSafe',
                recipient: msisdn,
                message: smsText,
                reference: `mission-start-${mission.id}-${userId}`,
              }),
            });
            if (!res.ok) {
              console.error(`SMS failed [${res.status}]: ${await res.text()}`);
            }
          }
        } catch (err) {
          console.error(`SMS failed for ${userId}:`, err);
        }
      }

      const { error: logError } = await supabase
        .from('mission_start_alert_sends')
        .insert({ mission_id: mission.id, user_id: userId });
      if (logError) console.error('Failed to log mission start alert:', logError);
      sentKeys.add(key);
      sent++;
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('check-mission-start-alerts error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
