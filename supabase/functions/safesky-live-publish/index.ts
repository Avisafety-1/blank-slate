import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAuthHeaders } from "../_shared/safesky-hmac.ts";
import { requireCronSecret } from "../_shared/cron.ts";
import { authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SAFESKY_UAV_SANDBOX_URL = 'https://sandbox-public-api.safesky.app/v1/uav';
const SAFESKY_UAV_PROD_URL = 'https://public-api.safesky.app/v1/uav';
const SAFESKY_UAV_PRIMARY_URL = 'https://uav-api.safesky.app/v1/uav';

// Positions older than this are ignored.
const POSITION_MAX_AGE_MS = 120_000;
// Terrain cache granularity: ~1 km grid.
const TERRAIN_GRID = 100; // 1/100 degree

interface BeaconPayload {
  id: string;
  call_sign: string;
  latitude: number;
  longitude: number;
  altitude: number;
  status: 'AIRBORNE' | 'GROUNDED';
  last_update: number;
  ground_speed: number;
  course: number;
}

function terrainKey(lat: number, lng: number): string {
  return `${Math.round(lat * TERRAIN_GRID) / TERRAIN_GRID},${Math.round(lng * TERRAIN_GRID) / TERRAIN_GRID}`;
}

/**
 * Terrain elevation for a set of grid keys.
 * Reads the shared terrain_elevation_cache table first, then fetches only
 * the missing cells in ONE Open-Meteo request and writes them back.
 */
// deno-lint-ignore no-explicit-any
async function resolveTerrain(supabase: any, keys: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const unique = [...new Set(keys)];
  if (unique.length === 0) return result;

  try {
    const { data: cached } = await supabase
      .from('terrain_elevation_cache')
      .select('lat_lng_key, elevation')
      .in('lat_lng_key', unique);

    for (const row of cached ?? []) {
      result.set(row.lat_lng_key, Number(row.elevation) || 0);
    }
  } catch (err) {
    console.warn('Terrain cache read failed:', err);
  }

  const missing = unique.filter(k => !result.has(k));
  if (missing.length === 0) return result;

  try {
    const lats = missing.map(k => k.split(',')[0]).join(',');
    const lngs = missing.map(k => k.split(',')[1]).join(',');
    const resp = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`);
    if (resp.ok) {
      const data = await resp.json();
      const elevations: number[] = data.elevation ?? [];
      const rows: { lat_lng_key: string; elevation: number }[] = [];
      missing.forEach((key, i) => {
        const elev = typeof elevations[i] === 'number' ? elevations[i] : 0;
        result.set(key, elev);
        rows.push({ lat_lng_key: key, elevation: elev });
      });
      if (rows.length > 0) {
        await supabase.from('terrain_elevation_cache').upsert(rows, { onConflict: 'lat_lng_key' });
      }
    } else {
      console.warn(`Open-Meteo elevation API error: ${resp.status}`);
      missing.forEach(k => result.set(k, 0));
    }
  } catch (err) {
    console.warn('Terrain lookup failed, using 0:', err);
    missing.forEach(k => result.set(k, 0));
  }

  return result;
}

/**
 * Resolve SafeSky callsigns for a set of companies in bulk (same rules as advisory).
 */
// deno-lint-ignore no-explicit-any
async function resolveCallsigns(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  companyIds: string[],
  droneIdsByCompany: Map<string, Set<string>>,
): Promise<Map<string, string>> {
  const callsigns = new Map<string, string>(); // key: `${companyId}:${droneId}`
  if (companyIds.length === 0) return callsigns;

  const { data: companies } = await supabase
    .from('companies')
    .select('id, navn, parent_company_id, safesky_callsign_prefix, safesky_callsign_variable')
    .in('id', companyIds);

  const companyById = new Map<string, any>((companies ?? []).map((c: any) => [c.id, c]));

  const parentIds = [...new Set((companies ?? [])
    .map((c: any) => c.parent_company_id)
    .filter((id: string | null): id is string => !!id))];

  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('companies')
      .select('id, navn, safesky_callsign_prefix, safesky_callsign_variable')
      .in('id', parentIds);
    for (const p of parents ?? []) companyById.set(p.id, { ...(companyById.get(p.id) ?? {}), ...p });
  }

  // Bulk drone registrations (only needed for variable = drone_registration)
  const allDroneIds = [...new Set([...droneIdsByCompany.values()].flatMap(s => [...s]))];
  const droneById = new Map<string, any>();
  if (allDroneIds.length > 0) {
    const { data: drones } = await supabase
      .from('drones')
      .select('id, registration_number')
      .in('id', allDroneIds);
    for (const d of drones ?? []) droneById.set(d.id, d);
  }

  for (const companyId of companyIds) {
    const company = companyById.get(companyId);
    let companyName = company?.navn || 'avisafe';
    let prefix = company?.safesky_callsign_prefix as string | null | undefined;
    let variable = (company?.safesky_callsign_variable as string | undefined) || 'counter';

    const parent = company?.parent_company_id ? companyById.get(company.parent_company_id) : null;
    if (parent) {
      if (parent.navn) companyName = parent.navn;
      if (!prefix && parent.safesky_callsign_prefix) prefix = parent.safesky_callsign_prefix;
      if (!company?.safesky_callsign_variable && parent.safesky_callsign_variable) {
        variable = parent.safesky_callsign_variable;
      }
    }

    const rawPrefix = (prefix && prefix.trim()) ? prefix.trim() : companyName.toLowerCase();
    const sanitized = rawPrefix.replace(/[^a-zA-Z0-9._-]/g, '') || 'avisafe';

    // Company-level fallback so we never fall back to the generic "avisafe01"
    callsigns.set(`${companyId}:`, sanitized + (variable === 'none' ? '' : '01'));

    for (const droneId of droneIdsByCompany.get(companyId) ?? []) {
      let suffix = '01';
      if (variable === 'none') {
        suffix = '';
      } else if (variable === 'drone_registration') {
        const drone = droneById.get(droneId);
        // Registration number only — never fall back to the serial number.
        const reg = (drone?.registration_number || '') as string;
        suffix = reg.replace(/[^a-zA-Z0-9._-]/g, '') || '01';
      }
      callsigns.set(`${companyId}:${droneId}`, sanitized + suffix);
    }
  }

  return callsigns;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try { requireCronSecret(req); } catch (e) { return authErrorResponse(e, corsHeaders); }

  try {
    const SAFESKY_API_KEY = Deno.env.get('SAFESKY_API_KEY');
    const SAFESKY_PROD_API_KEY = Deno.env.get('SAFESKY_PROD_API_KEY');
    if (!SAFESKY_API_KEY && !SAFESKY_PROD_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'SafeSky API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1) All live flights sharing to SafeSky (one query)
    const { data: liveFlights, error: liveError } = await supabase
      .from('active_flights')
      .select('id, company_id, drone_id, dronetag_device_id')
      .eq('publish_mode', 'live_uav')
      .eq('safesky_published', true);

    if (liveError) {
      console.error('Error fetching live_uav flights:', liveError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch live flights' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DroneTag units broadcast on their own — skip to avoid duplicate beacons.
    const publishable = (liveFlights ?? []).filter((f: any) => !f.dronetag_device_id && f.drone_id);
    if (publishable.length === 0) {
      return new Response(
        JSON.stringify({ success: true, published: 0, candidates: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2) Latest fresh position for every drone (ONE query)
    const droneIds = [...new Set(publishable.map((f: any) => f.drone_id as string))];
    const sinceIso = new Date(Date.now() - POSITION_MAX_AGE_MS).toISOString();

    const { data: positions, error: posError } = await supabase
      .from('flighthub2_positions')
      .select('drone_id, lat, lng, height_m, altitude_m, ground_speed_ms, course_deg, flight_status, time_stamp')
      .in('drone_id', droneIds)
      .gte('time_stamp', sinceIso)
      .order('time_stamp', { ascending: false })
      .limit(2000);

    if (posError) {
      console.error('Error fetching live positions:', posError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch positions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const latestByDrone = new Map<string, any>();
    for (const p of positions ?? []) {
      if (!latestByDrone.has(p.drone_id)) latestByDrone.set(p.drone_id, p);
    }

    const withPosition = publishable.filter((f: any) => {
      const p = latestByDrone.get(f.drone_id);
      return p && p.lat !== null && p.lng !== null;
    });

    if (withPosition.length === 0) {
      console.log(`Live publish: ${publishable.length} candidate flight(s), none with a fresh position`);
      return new Response(
        JSON.stringify({ success: true, published: 0, candidates: publishable.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3) Terrain (batched + cached) only for positions missing AMSL
    const terrainKeys: string[] = [];
    for (const f of withPosition) {
      const p = latestByDrone.get(f.drone_id);
      if (p.altitude_m === null || p.altitude_m === undefined) {
        terrainKeys.push(terrainKey(Number(p.lat), Number(p.lng)));
      }
    }
    const terrain = await resolveTerrain(supabase, terrainKeys);

    // 4) Callsigns in bulk
    const droneIdsByCompany = new Map<string, Set<string>>();
    for (const f of withPosition) {
      if (!droneIdsByCompany.has(f.company_id)) droneIdsByCompany.set(f.company_id, new Set());
      droneIdsByCompany.get(f.company_id)!.add(f.drone_id);
    }
    const callsigns = await resolveCallsigns(supabase, [...droneIdsByCompany.keys()], droneIdsByCompany);

    // 5) Build ONE payload with all beacons
    const beacons: BeaconPayload[] = [];
    for (const f of withPosition) {
      const p = latestByDrone.get(f.drone_id);
      const fs = String(p.flight_status ?? '').toLowerCase();
      const gs = typeof p.ground_speed_ms === 'number' ? p.ground_speed_ms : 0;
      const isAirborne = fs === 'inflight' || fs === 'takeoff' || fs === 'flying' || gs > 1;

      let altAmsl = (p.altitude_m as number | null) ?? null;
      if (altAmsl === null) {
        const agl = (p.height_m as number | null) ?? 0;
        altAmsl = (terrain.get(terrainKey(Number(p.lat), Number(p.lng))) ?? 0) + agl;
      }

      let callSign = callsigns.get(`${f.company_id}:${f.drone_id}`);
      if (!callSign) {
        callSign = callsigns.get(`${f.company_id}:`);
        if (callSign) {
          console.warn(`Live publish: no drone-specific callsign for flight ${f.id} (company ${f.company_id}, drone ${f.drone_id}); using company callsign ${callSign}`);
        } else {
          callSign = 'avisafe01';
          console.warn(`Live publish: no company callsign settings for flight ${f.id} (company ${f.company_id}); falling back to ${callSign}`);
        }
      }

      beacons.push({
        id: callSign,
        call_sign: callSign,
        latitude: Number(Number(p.lat).toFixed(4)),
        longitude: Number(Number(p.lng).toFixed(4)),
        altitude: Math.round(altAmsl),
        status: isAirborne ? 'AIRBORNE' : 'GROUNDED',
        last_update: Math.floor(new Date(p.time_stamp as string).getTime() / 1000),
        ground_speed: Math.round(gs),
        course: Math.round((p.course_deg as number | null) ?? 0),
      });
    }

    // 6) Single POST to SafeSky with the full beacon list
    const body = JSON.stringify(beacons);
    const candidates = [
      { label: 'PROD uav-api', url: SAFESKY_UAV_PRIMARY_URL, key: SAFESKY_PROD_API_KEY },
      { label: 'PROD public-api', url: SAFESKY_UAV_PROD_URL, key: SAFESKY_PROD_API_KEY },
      { label: 'SANDBOX', url: SAFESKY_UAV_SANDBOX_URL, key: SAFESKY_API_KEY },
    ].filter(c => !!c.key);

    let published = 0;
    let endpoint = '';
    for (const c of candidates) {
      const authHeaders = await generateAuthHeaders(c.key as string, 'POST', c.url, body);
      const resp = await fetch(c.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': c.key as string,
          ...authHeaders,
        },
        body,
      });
      if (resp.ok) {
        published = beacons.length;
        endpoint = c.label;
        break;
      }
      console.warn(`SafeSky live publish via ${c.label} failed: ${resp.status} - ${(await resp.text()).slice(0, 200)}`);
    }

    if (published === 0) {
      console.error(`SafeSky live publish failed on all endpoints for ${beacons.length} beacon(s)`);
    } else {
      console.log(`SafeSky live publish: ${published} beacon(s) in 1 call (${endpoint})`);
    }

    return new Response(
      JSON.stringify({ success: published > 0, published, candidates: publishable.length, endpoint }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('SafeSky live publish error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
