import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SAFESKY_ADVISORY_URL = 'https://sandbox-public-api.safesky.app/v1/advisory';

interface RoutePoint {
  lat: number;
  lng: number;
}

interface MissionRoute {
  coordinates: RoutePoint[];
  totalDistance?: number;
}

interface GeoJSONFeature {
  type: "Feature";
  properties: {
    id: string;
    call_sign: string;
    last_update: number;
    max_altitude: number;
    remarks: string;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// Convert route coordinates to a closed polygon
function routeToPolygon(route: MissionRoute): number[][] {
  const coordinates = route.coordinates.map(p => [p.lng, p.lat]);
  if (coordinates.length > 0) {
    coordinates.push([...coordinates[0]]);
  }
  return coordinates;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('SafeSky cron refresh started');

  try {
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

    // Fetch all active flights with advisory mode
    const { data: activeFlights, error: flightsError } = await supabase
      .from('active_flights')
      .select('id, mission_id, profile_id')
      .eq('publish_mode', 'advisory')
      .not('mission_id', 'is', null);

    if (flightsError) {
      console.error('Error fetching active flights:', flightsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch active flights', details: flightsError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!activeFlights || activeFlights.length === 0) {
      console.log('No active advisory flights to refresh');
      return new Response(
        JSON.stringify({ success: true, message: 'No active advisory flights', refreshed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${activeFlights.length} active advisory flights to refresh`);

    const results: { missionId: string; success: boolean; error?: string }[] = [];

    // Process each active advisory flight
    for (const flight of activeFlights) {
      const missionId = flight.mission_id;
      if (!missionId) continue;

      try {
        // Fetch mission data with route
        const { data: mission, error: missionError } = await supabase
          .from('missions')
          .select('id, tittel, route')
          .eq('id', missionId)
          .single();

        if (missionError || !mission) {
          console.error(`Mission ${missionId} not found:`, missionError);
          results.push({ missionId, success: false, error: 'Mission not found' });
          continue;
        }

        const route = mission.route as MissionRoute | null;
        if (!route || !route.coordinates || route.coordinates.length < 3) {
          console.warn(`Mission ${missionId} has no valid route for advisory`);
          results.push({ missionId, success: false, error: 'No valid route' });
          continue;
        }

        const advisoryId = `AVS_${missionId.substring(0, 8)}`;
        const polygonCoordinates = routeToPolygon(route);

        const payload: GeoJSONFeatureCollection = {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: {
              id: advisoryId,
              call_sign: `Avisafe: ${mission.tittel.substring(0, 20)}`,
              last_update: Math.floor(Date.now() / 1000),
              max_altitude: 120,
              remarks: "Drone operation - planned route"
            },
            geometry: {
              type: "Polygon",
              coordinates: [polygonCoordinates]
            }
          }]
        };

        console.log(`Refreshing advisory for mission ${missionId} (${mission.tittel})`);

        const response = await fetch(SAFESKY_ADVISORY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': SAFESKY_API_KEY,
          },
          body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        console.log(`SafeSky response for ${missionId}: ${response.status} - ${responseText}`);

        if (!response.ok) {
          results.push({ missionId, success: false, error: `API error: ${response.status}` });
        } else {
          results.push({ missionId, success: true });
        }

      } catch (err) {
        console.error(`Error refreshing advisory for ${missionId}:`, err);
        results.push({ missionId, success: false, error: String(err) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Cron refresh complete: ${successCount}/${results.length} advisories refreshed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Refreshed ${successCount} of ${results.length} advisories`,
        refreshed: successCount,
        total: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SafeSky cron error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
