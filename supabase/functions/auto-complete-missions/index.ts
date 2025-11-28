import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting auto-complete missions check...');

    // Calculate date 1 day ago
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const oneDayAgoISO = oneDayAgo.toISOString();

    console.log(`Checking for missions with tidspunkt before: ${oneDayAgoISO}`);

    // Find missions that should be completed
    // - Status is not 'Fullført' or 'Avlyst'
    // - tidspunkt is more than 1 day ago
    const { data: missionsToComplete, error: fetchError } = await supabase
      .from('missions')
      .select('id, tittel, tidspunkt, status')
      .not('status', 'in', '("Fullført","Avlyst")')
      .lt('tidspunkt', oneDayAgoISO);

    if (fetchError) {
      console.error('Error fetching missions:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${missionsToComplete?.length || 0} missions to auto-complete`);

    if (!missionsToComplete || missionsToComplete.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No missions to auto-complete',
          checked: 0,
          completed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update missions to 'Fullført' status
    const missionIds = missionsToComplete.map(m => m.id);
    const { error: updateError } = await supabase
      .from('missions')
      .update({
        status: 'Fullført',
        oppdatert_dato: new Date().toISOString(),
      })
      .in('id', missionIds);

    if (updateError) {
      console.error('Error updating missions:', updateError);
      throw updateError;
    }

    console.log(`Successfully auto-completed ${missionsToComplete.length} missions`);

    // Log which missions were completed
    missionsToComplete.forEach(mission => {
      console.log(`  - ${mission.tittel} (${mission.id}) - status changed from ${mission.status} to Fullført`);
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Auto-completed ${missionsToComplete.length} missions`,
        checked: missionsToComplete.length,
        completed: missionsToComplete.length,
        missions: missionsToComplete.map(m => ({
          id: m.id,
          tittel: m.tittel,
          previous_status: m.status,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in auto-complete-missions function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
