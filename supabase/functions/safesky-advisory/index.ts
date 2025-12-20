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

interface GeoJSONPolygonFeature {
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

interface GeoJSONPointFeature {
  type: "Feature";
  properties: {
    id: string;
    call_sign: string;
    last_update: number;
    max_altitude: number;
    max_distance: number;
    remarks: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: (GeoJSONPolygonFeature | GeoJSONPointFeature)[];
}

// Advisory size limits
const MAX_ADVISORY_AREA_KM2 = 5; // Hard limit: 5 km²
const LARGE_ADVISORY_THRESHOLD_KM2 = 2; // Warning threshold: 2 km²

// Compute cross product of vectors OA and OB where O is origin
function cross(O: number[], A: number[], B: number[]): number {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
}

// Haversine formula to calculate distance between two points in km
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate polygon area using Shoelace formula (in km²)
// Coordinates are in [lng, lat] format (GeoJSON order)
function calculatePolygonAreaKm2(coordinates: number[][]): number {
  if (coordinates.length < 3) return 0;

  // Get centroid for local projection
  let centroidLat = 0, centroidLng = 0;
  const n = coordinates.length - 1; // Exclude closing point
  for (let i = 0; i < n; i++) {
    centroidLng += coordinates[i][0];
    centroidLat += coordinates[i][1];
  }
  centroidLat /= n;
  centroidLng /= n;

  // Convert to local Cartesian coordinates (km) centered on centroid
  const cosLat = Math.cos(centroidLat * Math.PI / 180);
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const lng = coordinates[i][0];
    const lat = coordinates[i][1];
    // Approximate conversion to km
    const x = (lng - centroidLng) * 111.32 * cosLat;
    const y = (lat - centroidLat) * 111.32;
    points.push([x, y]);
  }

  // Shoelace formula
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area) / 2;
}

// Compute convex hull using Andrew's monotone chain algorithm
// Returns a closed polygon (first point = last point) in counter-clockwise order
function computeConvexHull(points: number[][]): number[][] {
  if (points.length < 3) {
    // If less than 3 points, just close the polygon
    const result = [...points];
    if (result.length > 0) {
      result.push([...result[0]]);
    }
    return result;
  }

  // Sort points lexicographically (by x, then by y)
  const sorted = [...points].sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);

  // Build lower hull
  const lower: number[][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: number[][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  // Concatenate to form full hull
  const hull = [...lower, ...upper];
  
  // Close the polygon
  if (hull.length > 0) {
    hull.push([...hull[0]]);
  }

  return hull;
}

// Convert route coordinates to a valid convex polygon using convex hull
// This prevents self-intersecting polygons that SafeSky rejects
// Note: GeoJSON uses [longitude, latitude] order
function routeToPolygon(route: MissionRoute): number[][] {
  const coordinates = route.coordinates.map(p => [p.lng, p.lat]);
  return computeConvexHull(coordinates);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, missionId, lat, lon, lng, alt, speed, heading, altitudeDelta, verticalSpeed, pilotName } = body;
    
    console.log(`SafeSky: action=${action}, missionId=${missionId}, lat=${lat}, lng=${lng || lon}, pilotName=${pilotName}`);

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

    // Handle Point advisory publishing for live_uav mode (100m radius)
    if (action === 'publish_point_advisory' || action === 'refresh_point_advisory') {
      const latitude = lat;
      const longitude = lng || lon;
      
      if (latitude === undefined || longitude === undefined) {
        return new Response(
          JSON.stringify({ error: 'lat and lng are required for Point advisory' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const callSign = 'Pilot posisjon';
      const advisoryId = `AVS_LIVE_${Date.now().toString(36)}`;

      // Build Point GeoJSON FeatureCollection payload
      const payload: GeoJSONFeatureCollection = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {
            id: advisoryId,
            call_sign: callSign,
            last_update: Math.floor(Date.now() / 1000),
            max_altitude: 0,
            max_distance: 100, // 100m radius
            remarks: "Live drone operation"
          },
          geometry: {
            type: "Point",
            coordinates: [longitude, latitude] // GeoJSON uses [lng, lat]
          }
        }]
      };

      console.log('Point Advisory payload:', JSON.stringify(payload, null, 2));

      const response = await fetch(SAFESKY_ADVISORY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': SAFESKY_API_KEY,
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log(`SafeSky Point Advisory response: ${response.status} - ${responseText}`);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ 
            error: 'SafeSky Point Advisory API error', 
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
          advisoryId,
          callSign,
          position: { lat: latitude, lng: longitude },
          message: `Point advisory ${action === 'publish_point_advisory' ? 'published' : 'refreshed'} successfully`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle live UAV position publishing (from GPS)
    if (action === 'publish_live_uav') {
      if (lat === undefined || lon === undefined) {
        return new Response(
          JSON.stringify({ error: 'lat and lon are required for live UAV publishing' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Always GROUNDED status for live UAV pilot position
      const groundSpeed = speed || 0;
      const status = "GROUNDED";
      
      console.log(`Flight status: ${status} (speed=${Math.round(groundSpeed)} m/s)`);

      // Create UAV beacon payload with status and dynamics (all numeric values must be integers)
      const beaconId = `AVS_LIVE_${Date.now().toString(36)}`;
      const payload = [
        {
          id: beaconId,
          latitude: lat,
          longitude: lon,
          altitude: Math.round(alt || 50),
          status: status,
          last_update: Math.floor(Date.now() / 1000),
          ground_speed: Math.round(groundSpeed),
          course: Math.round(heading || 0),
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
          dynamics: { speed: groundSpeed },
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

      // Calculate and validate polygon area
      const areaKm2 = calculatePolygonAreaKm2(polygonCoordinates);
      console.log(`Advisory area: ${areaKm2.toFixed(3)} km²`);

      // Check for max size limit - return 200 with error info so client can handle gracefully
      if (areaKm2 > MAX_ADVISORY_AREA_KM2) {
        console.warn(`Advisory too large: ${areaKm2.toFixed(2)} km² exceeds max ${MAX_ADVISORY_AREA_KM2} km²`);
        return new Response(
          JSON.stringify({ 
            error: 'advisory_too_large',
            areaKm2,
            maxAreaKm2: MAX_ADVISORY_AREA_KM2,
            message: `Advisory area (${areaKm2.toFixed(2)} km²) exceeds maximum allowed (${MAX_ADVISORY_AREA_KM2} km²)`
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check for large advisory warning (requires confirmation from client)
      const isLargeAdvisory = areaKm2 > LARGE_ADVISORY_THRESHOLD_KM2;
      const forcePublish = body.forcePublish === true;
      
      if (isLargeAdvisory && !forcePublish) {
        console.log(`Large advisory detected: ${areaKm2.toFixed(2)} km², requires confirmation`);
        return new Response(
          JSON.stringify({ 
            warning: 'large_advisory',
            areaKm2,
            thresholdKm2: LARGE_ADVISORY_THRESHOLD_KM2,
            maxAreaKm2: MAX_ADVISORY_AREA_KM2,
            message: `Advisory area is ${areaKm2.toFixed(2)} km². Areas over ${LARGE_ADVISORY_THRESHOLD_KM2} km² may be impractical for other airspace users. Confirm to proceed.`,
            requiresConfirmation: true
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
          areaKm2,
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
