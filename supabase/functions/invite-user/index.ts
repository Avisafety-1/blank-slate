import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { getEmailTemplateWithFallback } from "../_shared/template-utils.ts";
import { resolveLanguage } from "../_shared/email-i18n.ts";

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: hasAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'administrator' });
    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { email, companyName, registrationCode } = body;
    if (!email || !registrationCode) {
      return new Response(JSON.stringify({ error: 'email and registrationCode are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Resolve target company + its default language BEFORE picking email language,
    // so invited users get the email in the target company's language even if the
    // sender's UI is set to a different one.
    let targetCompanyId: string | null = null;
    let targetCompanyLang: 'no' | 'en' | null = null;
    try {
      const { data: targetCompany } = await supabase.rpc('get_company_by_registration_code', { p_code: registrationCode });
      targetCompanyId = Array.isArray(targetCompany) && targetCompany.length > 0 ? targetCompany[0].company_id : null;
      if (targetCompanyId) {
        const { data: langRow } = await supabase
          .from('companies')
          .select('default_language')
          .eq('id', targetCompanyId)
          .maybeSingle();
        const dl = (langRow as any)?.default_language;
        targetCompanyLang = dl === 'en' ? 'en' : dl === 'no' ? 'no' : null;
      }
    } catch (resolveErr) {
      console.warn('Could not resolve target company language:', resolveErr);
    }

    // Target company's default language wins over the inviter's UI language,
    // since the email is sent to a recipient in that company.
    const language = targetCompanyLang ?? resolveLanguage(req, body);

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    const companyId = profile?.company_id;

    const variables = {
      company_name: companyName || 'AviSafe',
      registration_code: registrationCode,
      app_url: 'https://app.avisafe.no',
    };

    const template = await getEmailTemplateWithFallback(
      companyId || '',
      'user_invite',
      variables,
      language,
    );

    const emailConfig = await getEmailConfig(companyId || undefined);
    const fromName = emailConfig.fromName || companyName || 'AviSafe';
    const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

    await sendEmail({ from: senderAddress, to: email, subject: sanitizeSubject(template.subject), html: template.content });

    // Log invitation using the already-resolved target company id
    try {
      if (targetCompanyId) {
        await supabase.from('user_invitations').insert({
          email: email.toLowerCase(),
          target_company_id: targetCompanyId,
          invited_by: user.id,
          inviter_company_id: companyId || null,
          registration_code: registrationCode,
        });
      } else {
        console.warn(`Could not resolve target company for registration code ${registrationCode}`);
      }
    } catch (logErr) {
      console.error('Failed to log invitation:', logErr);
    }

    console.log(`✓ Invite email sent to ${email} from company ${companyName}`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
