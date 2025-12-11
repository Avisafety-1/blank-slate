import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SAFESKY_API_URL = 'https://sandbox-public-api.safesky.app/v1/uav';

interface RoutePoint {
  lat: number;
  lng: number;
}

interface MissionRoute {
  coordinates: RoutePoint[];
  totalDistance?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, missionId } = await req.json();
    
    console.log(`SafeSky UAV: action=${action}, missionId=${missionId}`);

    const SAFESKY_API_KEY = Deno.env.get('SAFESKY_API_KEY');
    if (!SAFESKY_API_KEY) {
      console.error('SAFESKY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'SAFESKY_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'publish' || action === 'refresh') {
      if (!missionId) {
        return new Response(
          JSON.stringify({ error: 'missionId is required for publish/refresh' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch mission data
      const { data: mission, error: missionError } = await supabase
        .from('missions')
        .select('id, tittel, route, latitude, longitude')
        .eq('id', missionId)
        .single();

      if (missionError || !mission) {
        console.error('Mission fetch error:', missionError);
        return new Response(
          JSON.stringify({ error: 'Mission not found', details: missionError }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get coordinates - either from route or from mission lat/lng
      let latitude: number;
      let longitude: number;
      const altitude = 120; // Default drone altitude in meters

      const route = mission.route as MissionRoute | null;
      if (route && route.coordinates && route.coordinates.length > 0) {
        latitude = route.coordinates[0].lat;
        longitude = route.coordinates[0].lng;
      } else if (mission.latitude && mission.longitude) {
        latitude = mission.latitude;
        longitude = mission.longitude;
      } else {
        return new Response(
          JSON.stringify({ error: 'No location data available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create simple UAV beacon payload matching the working curl example
      const beaconId = `AVS_${missionId.substring(0, 8)}`;
      const payload = [
        {
          id: beaconId,
          altitude: altitude,
          latitude: latitude,
          longitude: longitude
        }
      ];

      console.log('Sending UAV beacon:', JSON.stringify(payload));

      // Send to SafeSky with simple x-api-key auth
      const response = await fetch(SAFESKY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': SAFESKY_API_KEY,
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log(`SafeSky response: ${response.status} - ${responseText}`);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ 
            error: 'SafeSky API error', 
            status: response.status,
            details: responseText 
          }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          action,
          beaconId,
          message: `UAV beacon ${action === 'publish' ? 'published' : 'refreshed'} successfully`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete') {
      // UAV beacons expire automatically when not refreshed
      console.log('UAV beacon will expire automatically (no refresh)');
      return new Response(
        JSON.stringify({ success: true, action: 'delete', message: 'UAV beacon will expire automatically' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: publish, refresh, or delete' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SafeSky UAV error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
