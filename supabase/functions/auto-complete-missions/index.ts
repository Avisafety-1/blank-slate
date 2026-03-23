import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting auto-complete missions check...');

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const oneDayAgoISO = oneDayAgo.toISOString();

    console.log(`Checking for missions with tidspunkt before: ${oneDayAgoISO}`);

    const { data: missionsToComplete, error: fetchError } = await supabase
      .from('missions')
      .select('id, tittel, tidspunkt, status, latitude, longitude')
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

    // Fetch weather snapshots for missions with coordinates
    const weatherSnapshots = new Map<string, any>();
    const weatherFetchPromises = missionsToComplete
      .filter(m => m.latitude && m.longitude)
      .map(async (m) => {
        try {
          const metUrl = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${m.latitude}&lon=${m.longitude}`;
          const metRes = await fetch(metUrl, {
            headers: { 'User-Agent': 'Avisafe/1.0 (kontakt@avisafe.no)' },
          });
          if (metRes.ok) {
            const metData = await metRes.json();
            const current = metData.properties?.timeseries?.[0]?.data?.instant?.details;
            const next1h = metData.properties?.timeseries?.[0]?.data?.next_1_hours;
            weatherSnapshots.set(m.id, {
              data: {
                current: {
                  temperature: current?.air_temperature || null,
                  wind_speed: current?.wind_speed || null,
                  wind_gust: current?.wind_speed_of_gust || null,
                  wind_direction: current?.wind_from_direction || null,
                  humidity: current?.relative_humidity || null,
                  dew_point: current?.dew_point_temperature ?? null,
                  precipitation: next1h?.details?.precipitation_amount || 0,
                  symbol: next1h?.summary?.symbol_code || 'unknown',
                },
              },
              captured_at: new Date().toISOString(),
              source: 'auto_complete',
            });
          }
        } catch (e) {
          console.warn(`Weather fetch failed for mission ${m.id}:`, e);
        }
      });

    await Promise.allSettled(weatherFetchPromises);

    // Update each mission individually to include weather snapshot if available
    let completedCount = 0;
    for (const mission of missionsToComplete) {
      const updatePayload: Record<string, any> = {
        status: 'Fullført',
        oppdatert_dato: new Date().toISOString(),
      };

      const snapshot = weatherSnapshots.get(mission.id);
      if (snapshot) {
        updatePayload.weather_data_snapshot = snapshot;
      }

      const { error: updateError } = await supabase
        .from('missions')
        .update(updatePayload)
        .eq('id', mission.id);

      if (updateError) {
        console.error(`Error updating mission ${mission.id}:`, updateError);
      } else {
        completedCount++;
        console.log(`  - ${mission.tittel} (${mission.id}) - status changed from ${mission.status} to Fullført${snapshot ? ' (with weather snapshot)' : ''}`);
      }
    }

    console.log(`Successfully auto-completed ${completedCount} missions`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Auto-completed ${completedCount} missions`,
        checked: missionsToComplete.length,
        completed: completedCount,
        with_weather: weatherSnapshots.size,
        missions: missionsToComplete.map(m => ({
          id: m.id,
          tittel: m.tittel,
          previous_status: m.status,
          has_weather: weatherSnapshots.has(m.id),
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
