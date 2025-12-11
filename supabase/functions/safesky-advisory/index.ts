import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SAFESKY_API_URL = 'https://sandbox-public-api.safesky.app/v1/advisory';

interface RoutePoint {
  lat: number;
  lng: number;
}

interface MissionRoute {
  coordinates: RoutePoint[];
  totalDistance?: number;
}

interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

// Convert route points to a buffered GeoJSON Polygon
function routeToPolygon(route: MissionRoute): GeoJSONPolygon {
  const coords = route.coordinates;
  
  if (coords.length === 0) {
    throw new Error('Route has no coordinates');
  }
  
  // Buffer distance in degrees (approximately 500m at Norwegian latitudes)
  const bufferDeg = 0.005;
  
  if (coords.length === 1) {
    // Single point - create a square around it
    const p = coords[0];
    return {
      type: 'Polygon',
      coordinates: [[
        [p.lng - bufferDeg, p.lat - bufferDeg],
        [p.lng + bufferDeg, p.lat - bufferDeg],
        [p.lng + bufferDeg, p.lat + bufferDeg],
        [p.lng - bufferDeg, p.lat + bufferDeg],
        [p.lng - bufferDeg, p.lat - bufferDeg], // Close the polygon
      ]]
    };
  }
  
  // For multiple points, create a buffered polygon around all points
  const lats = coords.map(c => c.lat);
  const lngs = coords.map(c => c.lng);
  
  const minLat = Math.min(...lats) - bufferDeg;
  const maxLat = Math.max(...lats) + bufferDeg;
  const minLng = Math.min(...lngs) - bufferDeg;
  const maxLng = Math.max(...lngs) + bufferDeg;
  
  return {
    type: 'Polygon',
    coordinates: [[
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat], // Close the polygon
    ]]
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, missionId, advisoryId } = await req.json();
    
    console.log(`SafeSky Advisory: action=${action}, missionId=${missionId}, advisoryId=${advisoryId}`);

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

      // Fetch mission with route
      const { data: mission, error: missionError } = await supabase
        .from('missions')
        .select('id, tittel, route, tidspunkt, slutt_tidspunkt')
        .eq('id', missionId)
        .single();

      if (missionError || !mission) {
        console.error('Mission fetch error:', missionError);
        return new Response(
          JSON.stringify({ error: 'Mission not found', details: missionError }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const route = mission.route as MissionRoute | null;
      if (!route || !route.coordinates || route.coordinates.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Mission has no route' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create GeoJSON polygon from route
      const polygon = routeToPolygon(route);
      
      // Calculate time range (now + 2 hours if not specified)
      const now = new Date();
      const startTime = mission.tidspunkt ? new Date(mission.tidspunkt) : now;
      const endTime = mission.slutt_tidspunkt 
        ? new Date(mission.slutt_tidspunkt) 
        : new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // +2 hours

      // Build advisory payload
      const advisoryPayload = {
        type: 'drone',
        geometry: polygon,
        altitude_m: {
          min: 0,
          max: 120
        },
        time: {
          start: startTime.toISOString(),
          end: endTime.toISOString()
        },
        description: `Avisafe: ${mission.tittel || 'Drone operation'}`
      };

      console.log('Publishing advisory:', JSON.stringify(advisoryPayload, null, 2));

      // Post to SafeSky API
      const safeskyResponse = await fetch(SAFESKY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(advisoryPayload)
      });

      const responseText = await safeskyResponse.text();
      console.log(`SafeSky response status: ${safeskyResponse.status}, body: ${responseText}`);

      if (!safeskyResponse.ok) {
        return new Response(
          JSON.stringify({ 
            error: 'SafeSky API error', 
            status: safeskyResponse.status,
            details: responseText 
          }),
          { status: safeskyResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          action,
          advisoryId: responseData.id || responseData.advisory_id || null,
          data: responseData 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete') {
      // SafeSky advisories typically expire automatically
      // If they provide a delete endpoint, we would use it here
      console.log('Advisory delete requested - advisories expire automatically');
      
      return new Response(
        JSON.stringify({ success: true, action: 'delete', message: 'Advisory will expire automatically' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: publish, refresh, or delete' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SafeSky advisory error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
