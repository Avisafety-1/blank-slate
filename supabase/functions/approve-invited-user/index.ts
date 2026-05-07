import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Caller must be Avisafe superadmin
    const { data: isAvisafe } = await supabase.rpc('is_avisafe_superadmin', { _user_id: user.id });
    if (!isAvisafe) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { user_id: targetUserId } = await req.json();
    if (!targetUserId) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Verify the target profile has a matching invitation from Avisafe
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, company_id, full_name, approved')
      .eq('id', targetUserId)
      .single();
    if (!profile) return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: invitation } = await supabase
      .from('user_invitations')
      .select('invited_by')
      .eq('accepted_user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let allowed = false;
    if (invitation?.invited_by) {
      const { data: inviterIsAvisafe } = await supabase.rpc('is_avisafe_superadmin', { _user_id: invitation.invited_by });
      allowed = inviterIsAvisafe === true;
    }
    if (!allowed) return new Response(JSON.stringify({ error: 'No matching Avisafe invitation' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Approve
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ approved: true, approved_at: new Date().toISOString(), approved_by: user.id })
      .eq('id', targetUserId);
    if (updErr) throw updErr;

    // Send approval email (best-effort)
    try {
      const { data: company } = await supabase.from('companies').select('navn').eq('id', profile.company_id).single();
      if (company && profile.email) {
        await supabase.functions.invoke('send-user-approved-email', {
          body: {
            user_id: targetUserId,
            user_name: profile.full_name || 'Bruker',
            user_email: profile.email,
            company_name: company.navn,
            company_id: profile.company_id,
          },
        });
      }
    } catch (e) {
      console.error('Approval email failed:', e);
    }

    // Sync seats (best-effort)
    supabase.functions.invoke('update-seats', { body: { company_id: profile.company_id } }).catch(() => {});

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('approve-invited-user error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
