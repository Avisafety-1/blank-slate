import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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

// Helper to convert ArrayBuffer to base64url
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Derive KID from API key using SHA-256
async function deriveKid(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64Url(hashBuffer);
}

// Derive HMAC key from API key using HKDF
async function deriveHmacKey(apiKey: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiKey),
    'HKDF',
    false,
    ['deriveKey']
  );
  
  const hmacKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('safesky-hmac'),
      info: encoder.encode('hmac-signing-key'),
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign']
  );
  
  return hmacKey;
}

// Generate HMAC signature
async function generateSignature(
  hmacKey: CryptoKey,
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: string
): Promise<string> {
  const encoder = new TextEncoder();
  const canonicalRequest = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}`;
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    encoder.encode(canonicalRequest)
  );
  return arrayBufferToBase64Url(signatureBuffer);
}

// Generate all auth headers for SafeSky API
async function generateAuthHeaders(
  apiKey: string,
  method: string,
  url: string,
  body: string
): Promise<Record<string, string>> {
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  
  const kid = await deriveKid(apiKey);
  const hmacKey = await deriveHmacKey(apiKey);
  const signature = await generateSignature(hmacKey, method, path, timestamp, nonce, body);
  
  return {
    'Authorization': `HMAC-SHA256 Credential=${kid},Signature=${signature}`,
    'X-SS-Date': timestamp,
    'X-SS-Nonce': nonce,
    'X-SS-Alg': 'HMAC-SHA256',
  };
}

// Convert route points to a buffered GeoJSON Polygon coordinates
function routeToPolygonCoords(route: MissionRoute): number[][][] {
  const coords = route.coordinates;
  
  if (coords.length === 0) {
    throw new Error('Route has no coordinates');
  }
  
  // Buffer distance in degrees (approximately 500m at Norwegian latitudes)
  const bufferDeg = 0.005;
  
  if (coords.length === 1) {
    // Single point - create a square around it
    const p = coords[0];
    return [[
      [p.lng - bufferDeg, p.lat - bufferDeg],
      [p.lng + bufferDeg, p.lat - bufferDeg],
      [p.lng + bufferDeg, p.lat + bufferDeg],
      [p.lng - bufferDeg, p.lat + bufferDeg],
      [p.lng - bufferDeg, p.lat - bufferDeg],
    ]];
  }
  
  // For multiple points, create a buffered polygon around all points
  const lats = coords.map(c => c.lat);
  const lngs = coords.map(c => c.lng);
  
  const minLat = Math.min(...lats) - bufferDeg;
  const maxLat = Math.max(...lats) + bufferDeg;
  const minLng = Math.min(...lngs) - bufferDeg;
  const maxLng = Math.max(...lngs) + bufferDeg;
  
  return [[
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ]];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, missionId, advisoryId } = await req.json();
    
    console.log(`SafeSky Advisory: action=${action}, missionId=${missionId}, advisoryId=${advisoryId}`);

    // Check for API key
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

      // Create GeoJSON polygon coordinates from route
      const polygonCoords = routeToPolygonCoords(route);
      
      // Build GeoJSON FeatureCollection payload for SafeSky
      const advisoryPayload = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            id: mission.id,
            max_altitude: 120,
            last_update: Math.floor(Date.now() / 1000),
            call_sign: `Avisafe: ${mission.tittel || 'Drone operation'}`,
            remarks: 'UAS operation - Avisafe',
          },
          geometry: {
            type: 'Polygon',
            coordinates: polygonCoords
          }
        }]
      };

      const bodyString = JSON.stringify(advisoryPayload);
      console.log('Publishing advisory:', bodyString);

      // Generate HMAC auth headers
      const authHeaders = await generateAuthHeaders(SAFESKY_API_KEY, 'POST', SAFESKY_API_URL, bodyString);
      console.log('Auth headers generated:', Object.keys(authHeaders));

      // Post to SafeSky API
      const safeskyResponse = await fetch(SAFESKY_API_URL, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: bodyString
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
