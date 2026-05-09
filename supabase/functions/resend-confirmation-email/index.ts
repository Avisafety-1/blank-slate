import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // PT-8 #1: require auth (admin/superadmin in same company as target user)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const callerToken = authHeader.replace('Bearer ', '');
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(callerToken);
    if (callerErr || !callerData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const callerId = callerData.user.id;

    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Authorization: caller must be superadmin OR admin in target user's company
    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles').select('role').eq('user_id', callerId);
    const callerRoleSet = new Set((callerRoles ?? []).map((r: any) => r.role));
    const isSuperadmin = callerRoleSet.has('superadmin');
    const isAdmin = callerRoleSet.has('admin');

    if (!isSuperadmin) {
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Insufficient role' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      // admin: must be same company as target user
      const [{ data: callerProfile }, { data: targetProfile }] = await Promise.all([
        supabaseAdmin.from('profiles').select('company_id').eq('id', callerId).maybeSingle(),
        supabaseAdmin.from('profiles').select('company_id').eq('id', userId).maybeSingle(),
      ]);
      if (!callerProfile?.company_id || callerProfile.company_id !== targetProfile?.company_id) {
        return new Response(JSON.stringify({ error: 'Cross-company action not allowed' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const email = user.email;
    if (!email) {
      return new Response(JSON.stringify({ error: 'User has no email' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, company_id, companies(navn)')
      .eq('id', userId)
      .maybeSingle();

    const userName = profile?.full_name || email;
    const companyId = profile?.company_id || null;
    const companyName = (profile?.companies as any)?.navn || 'AviSafe';

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData?.properties?.action_link) {
      return new Response(JSON.stringify({ error: 'Failed to generate confirmation link' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const confirmationLink = linkData.properties.action_link;
    console.log(`Generated confirmation link for ${email}`);

    const confirmationSubject = `Bekreft e-postadressen din – ${companyName}`;
    const LOGO_URL = 'https://app.avisafe.no/avisafe-logo-text.png';
    const confirmationHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.logo { text-align: center; padding: 20px 20px 10px 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.button { display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
.info-box { background: #eff6ff; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #3b82f6; }
.footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="container">
  <div class="logo">
    <img src="${LOGO_URL}" alt="AviSafe" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;" />
  </div>
  <div class="header">
    <h1 style="margin: 0;">Bekreft e-postadressen din</h1>
  </div>
  <div class="content">
    <p>Hei ${userName},</p>
    <p>Klikk på knappen nedenfor for å bekrefte e-postadressen din og aktivere kontoen din hos <strong>${companyName}</strong>.</p>
    <p style="text-align: center;">
      <a href="${confirmationLink}" class="button">Bekreft e-postadresse</a>
    </p>
    <div class="info-box">
      <p style="margin: 0;"><strong>Viktig:</strong> Denne lenken er midlertidig og utløper etter en periode. Hvis lenken ikke fungerer, kan du kontakte administratoren din for en ny.</p>
    </div>
    <p>Hvis du ikke forventet å motta denne e-posten, kan du ignorere den.</p>
    <p>Med vennlig hilsen,<br>${companyName}</p>
    <div class="footer">
      <p>Dette er en automatisk generert e-post fra AviSafe.</p>
    </div>
  </div>
</div>
</body>
</html>`;

    const emailConfig = await getEmailConfig(companyId || undefined);
    const fromName = emailConfig.fromName || 'AviSafe';
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    await sendEmail({ from: senderAddress, to: email, subject: sanitizeSubject(confirmationSubject), html: confirmationHtml });

    console.log(`✓ Confirmation email sent to ${email}`);
    return new Response(JSON.stringify({ success: true, sentTo: email }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
