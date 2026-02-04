import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Norway bounding box for beacon fetching
const NORWAY_VIEWPORT = "57.5,4.0,71.5,31.5";
const SAFESKY_HOST = "public-api.safesky.app";
const SAFESKY_PATH = "/v1/beacons";
const SAFESKY_QUERY = `viewport=${NORWAY_VIEWPORT}`;
const SAFESKY_BEACONS_URL = `https://${SAFESKY_HOST}${SAFESKY_PATH}?${SAFESKY_QUERY}`;

// How long a heartbeat is considered "active" (10 seconds)
const HEARTBEAT_TIMEOUT_MS = 10000;

// How old beacons should be before deletion (30 seconds)
const BEACON_MAX_AGE_MS = 30000;

interface SafeSkyBeacon {
  id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  course?: number;
  ground_speed?: number;
  vertical_speed?: number;
  beacon_type?: string;
  callsign?: string;
}

// ============ HMAC Authentication Helpers ============

// Convert ArrayBuffer to hex string
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert ArrayBuffer to base64 string
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert ArrayBuffer to base64url string
function bufferToBase64Url(buffer: ArrayBuffer): string {
  return bufferToBase64(buffer)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Derive KID from API key: base64url(SHA256("kid:" + api_key)[0:16])
async function deriveKid(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode("kid:" + apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const first16Bytes = hashBuffer.slice(0, 16);
  return bufferToBase64Url(first16Bytes);
}

// Derive HMAC key using HKDF-SHA256
async function deriveHmacKey(apiKey: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  
  // Import the API key as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiKey),
    'HKDF',
    false,
    ['deriveKey']
  );
  
  // Derive the HMAC key using HKDF
  const salt = encoder.encode('safesky-hmac-salt-v1');
  const info = encoder.encode('auth-v1');
  
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: info,
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign']
  );
}

// Generate UUID v4
function generateNonce(): string {
  return crypto.randomUUID();
}

// Generate ISO8601 timestamp with milliseconds
function generateTimestamp(): string {
  return new Date().toISOString(); // Returns format: YYYY-MM-DDTHH:MM:SS.sssZ
}

// Generate SHA256 hash of body as hex string
async function hashBody(body: string): Promise<string> {
  if (!body) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

// Generate HMAC signature (base64 encoded)
async function generateSignature(hmacKey: CryptoKey, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(data));
  return bufferToBase64(signature);
}

// Build canonical request string
// Format from SafeSky docs:
// METHOD\n/path\nquery_string\nhost:hostname\nx-ss-date:timestamp\nx-ss-nonce:nonce\n\nbody_hash_sha256_hex
function buildCanonicalRequest(
  method: string,
  path: string,
  query: string,
  host: string,
  timestamp: string,
  nonce: string,
  bodyHash: string
): string {
  return [
    method,
    path,
    query,
    `host:${host}`,
    `x-ss-date:${timestamp}`,
    `x-ss-nonce:${nonce}`,
    '',
    bodyHash
  ].join('\n');
}

// Generate all authentication headers
async function generateAuthHeaders(
  apiKey: string,
  method: string,
  path: string,
  query: string,
  host: string,
  body: string = ''
): Promise<Record<string, string>> {
  const kid = await deriveKid(apiKey);
  const hmacKey = await deriveHmacKey(apiKey);
  
  const timestamp = generateTimestamp();
  const nonce = generateNonce();
  const bodyHash = await hashBody(body);
  
  const canonicalRequest = buildCanonicalRequest(method, path, query, host, timestamp, nonce, bodyHash);
  
  console.log('KID:', kid);
  console.log('Timestamp:', timestamp);
  console.log('Nonce:', nonce);
  console.log('Canonical request:', JSON.stringify(canonicalRequest));
  
  const signature = await generateSignature(hmacKey, canonicalRequest);
  
  console.log('Signature (base64):', signature);
  
  const authorization = `SS-HMAC Credential=${kid}/v1, SignedHeaders=host;x-ss-date;x-ss-nonce, Signature=${signature}`;
  
  console.log('Authorization header:', authorization);
  
  return {
    'Authorization': authorization,
    'X-SS-Date': timestamp,
    'X-SS-Nonce': nonce,
    'X-SS-Alg': 'SS-HMAC-SHA256-V1',
  };
}

// ============ Main Handler ============

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('SafeSky beacons fetch started');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Check if there are active map viewers (heartbeat within last 10 seconds)
    const heartbeatCutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS).toISOString();
    
    const { data: activeViewers, error: viewersError } = await supabase
      .from('map_viewer_heartbeats')
      .select('id')
      .gt('last_seen', heartbeatCutoff)
      .limit(1);

    if (viewersError) {
      console.error('Error checking for active viewers:', viewersError);
      return new Response(
        JSON.stringify({ error: 'Failed to check for active viewers', details: viewersError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no active viewers, skip API call to save quota
    if (!activeViewers || activeViewers.length === 0) {
      console.log('No active map viewers - skipping SafeSky API call');
      
      // Still clean up old beacons
      const beaconCutoff = new Date(Date.now() - BEACON_MAX_AGE_MS).toISOString();
      const { data: deletedBeacons } = await supabase
        .from('safesky_beacons')
        .delete()
        .lt('updated_at', beaconCutoff)
        .select('id');
      
      const deletedCount = deletedBeacons?.length || 0;
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old beacons`);
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          skipped: true,
          reason: 'No active map viewers',
          beaconsDeleted: deletedCount
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${activeViewers.length}+ active map viewer(s) - fetching beacons from SafeSky`);

    // Step 2: Fetch beacons from SafeSky production API with HMAC authentication
    const SAFESKY_BEACONS_API_KEY = Deno.env.get('SAFESKY_BEACONS_API_KEY');
    if (!SAFESKY_BEACONS_API_KEY) {
      console.error('SAFESKY_BEACONS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'SAFESKY_BEACONS_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log API key prefix for debugging (don't log the full key!)
    console.log('API key prefix:', SAFESKY_BEACONS_API_KEY.substring(0, 15) + '...');

    // Generate HMAC authentication headers
    const authHeaders = await generateAuthHeaders(
      SAFESKY_BEACONS_API_KEY,
      'GET',
      SAFESKY_PATH,
      SAFESKY_QUERY,
      SAFESKY_HOST,
      '' // No body for GET request
    );

    console.log('Generated HMAC auth headers, calling SafeSky API...');
    console.log('Request URL:', SAFESKY_BEACONS_URL);

    const response = await fetch(SAFESKY_BEACONS_URL, {
      method: 'GET',
      headers: authHeaders
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SafeSky API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: 'SafeSky API error', status: response.status, details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const beaconsData = await response.json();
    console.log(`Received ${beaconsData?.length || 0} beacons from SafeSky`);

    // Step 3: Transform and upsert beacons
    const beacons: SafeSkyBeacon[] = [];
    if (Array.isArray(beaconsData)) {
      for (const beacon of beaconsData) {
        const beaconId = beacon.id || `beacon_${beacon.latitude}_${beacon.longitude}`;
        beacons.push({
          id: beaconId,
          latitude: beacon.latitude,
          longitude: beacon.longitude,
          altitude: beacon.altitude || null,
          course: beacon.course || null,
          ground_speed: beacon.ground_speed || null,
          vertical_speed: beacon.vertical_speed || null,
          beacon_type: beacon.beacon_type || beacon.type || null,
          callsign: beacon.callsign || beacon.call_sign || null,
        });
      }
    }

    let beaconsUpserted = 0;
    if (beacons.length > 0) {
      const beaconsWithTimestamp = beacons.map(b => ({
        ...b,
        updated_at: new Date().toISOString()
      }));

      const { error: upsertError } = await supabase
        .from('safesky_beacons')
        .upsert(beaconsWithTimestamp, { onConflict: 'id' });

      if (upsertError) {
        console.error('Error upserting beacons:', upsertError);
      } else {
        beaconsUpserted = beacons.length;
        console.log(`Upserted ${beaconsUpserted} beacons`);
      }
    }

    // Step 4: Delete old beacons (older than 30 seconds)
    const beaconCutoff = new Date(Date.now() - BEACON_MAX_AGE_MS).toISOString();
    const { data: deletedBeacons, error: deleteError } = await supabase
      .from('safesky_beacons')
      .delete()
      .lt('updated_at', beaconCutoff)
      .select('id');

    if (deleteError) {
      console.error('Error deleting old beacons:', deleteError);
    }

    const beaconsDeleted = deletedBeacons?.length || 0;
    if (beaconsDeleted > 0) {
      console.log(`Deleted ${beaconsDeleted} old beacons`);
    }

    console.log(`SafeSky beacons fetch complete: ${beaconsUpserted} upserted, ${beaconsDeleted} deleted`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        beaconsUpserted,
        beaconsDeleted,
        activeViewers: activeViewers.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SafeSky beacons fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
