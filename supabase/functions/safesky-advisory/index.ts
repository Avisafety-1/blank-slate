import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SAFESKY_UAV_URL = 'https://sandbox-public-api.safesky.app/v1/uav';
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
// Note: GeoJSON uses [longitude, latitude] order
function routeToPolygon(route: MissionRoute): number[][] {
  const coordinates = route.coordinates.map(p => [p.lng, p.lat]);
  
  // Close the polygon by adding the first point at the end
  if (coordinates.length > 0) {
    coordinates.push([...coordinates[0]]);
  }
  
  return coordinates;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, missionId, lat, lon, alt, speed, heading, altitudeDelta, verticalSpeed } = body;
    
    console.log(`SafeSky: action=${action}, missionId=${missionId}, lat=${lat}, lon=${lon}, alt=${alt}, speed=${speed}, altDelta=${altitudeDelta}, vSpeed=${verticalSpeed}`);

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

    // Handle live UAV position publishing (from GPS)
    if (action === 'publish_live_uav') {
      if (lat === undefined || lon === undefined) {
        return new Response(
          JSON.stringify({ error: 'lat and lon are required for live UAV publishing' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Determine AIRBORNE vs ON_GROUND status based on flight dynamics
      // AIRBORNE if: speed > 2 m/s, OR altitude delta > 5m, OR vertical speed > 0.5 m/s
      const groundSpeed = speed || 0;
      const altDelta = altitudeDelta || 0;
      const vSpeed = verticalSpeed || 0;
      
      const isAirborne = 
        groundSpeed > 2 ||              // Moving faster than 2 m/s (walking speed)
        altDelta > 5 ||                 // More than 5m above start altitude
        Math.abs(vSpeed) > 0.5;         // Climbing or descending > 0.5 m/s
      
      const status = isAirborne ? "AIRBORNE" : "ON_GROUND";
      
      console.log(`Flight status: ${status} (speed=${groundSpeed.toFixed(1)} m/s, altDelta=${altDelta.toFixed(1)}m, vSpeed=${vSpeed.toFixed(2)} m/s)`);

      // Create UAV beacon payload with status and dynamics
      const beaconId = `AVS_LIVE_${Date.now().toString(36)}`;
      const payload = [
        {
          id: beaconId,
          latitude: lat,
          longitude: lon,
          altitude: alt || 50,
          status: status,
          last_update: Math.floor(Date.now() / 1000),
          ground_speed: groundSpeed,
          course: heading || 0,
        }
      ];

      console.log('Sending live UAV beacon:', JSON.stringify(payload));

      const response = await fetch(SAFESKY_UAV_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': SAFESKY_API_KEY,
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log(`SafeSky live UAV response: ${response.status} - ${responseText}`);

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
          status,
          position: { lat, lon, alt: alt || 50 },
          dynamics: { speed: groundSpeed, altitudeDelta: altDelta, verticalSpeed: vSpeed },
          message: `Live UAV position published as ${status}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle Advisory publishing (GeoJSON polygon for planned operations)
    if (action === 'publish_advisory' || action === 'refresh_advisory') {
      if (!missionId) {
        return new Response(
          JSON.stringify({ error: 'missionId is required for advisory' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch mission data with route
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

      const route = mission.route as MissionRoute | null;
      
      // Advisory requires a route with at least 3 points to form a polygon
      if (!route || !route.coordinates || route.coordinates.length < 3) {
        return new Response(
          JSON.stringify({ error: 'Advisory requires a route with at least 3 points' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const advisoryId = `AVS_${missionId.substring(0, 8)}`;
      const polygonCoordinates = routeToPolygon(route);

      // Build GeoJSON FeatureCollection payload
      const payload: GeoJSONFeatureCollection = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {
            id: advisoryId,
            call_sign: `Avisafe: ${mission.tittel.substring(0, 20)}`,
            last_update: Math.floor(Date.now() / 1000), // Unix timestamp
            max_altitude: 120, // meters
            remarks: "Drone operation - planned route"
          },
          geometry: {
            type: "Polygon",
            coordinates: [polygonCoordinates]
          }
        }]
      };

      console.log('Advisory payload:', JSON.stringify(payload, null, 2));

      // Send to SafeSky Advisory endpoint with simple x-api-key
      const response = await fetch(SAFESKY_ADVISORY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': SAFESKY_API_KEY,
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log(`SafeSky Advisory response: ${response.status} - ${responseText}`);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ 
            error: 'SafeSky Advisory API error', 
            status: response.status,
            details: responseText,
            hint: response.status === 401 || response.status === 403 
              ? 'HMAC authentication may be required for /v1/advisory' 
              : undefined
          }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          action,
          advisoryId,
          message: `Advisory ${action === 'publish_advisory' ? 'published' : 'refreshed'} successfully`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle UAV beacon publishing (single point for live position from mission)
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

      // Create simple UAV beacon payload
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

      // Send to SafeSky UAV endpoint
      const response = await fetch(SAFESKY_UAV_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': SAFESKY_API_KEY,
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log(`SafeSky UAV response: ${response.status} - ${responseText}`);

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

    if (action === 'delete' || action === 'delete_advisory') {
      // UAV beacons and advisories expire automatically when not refreshed
      console.log('Beacon/advisory will expire automatically (no refresh)');
      return new Response(
        JSON.stringify({ success: true, action, message: 'Beacon/advisory will expire automatically' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: publish, refresh, publish_advisory, refresh_advisory, publish_live_uav, delete, or delete_advisory' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SafeSky error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
