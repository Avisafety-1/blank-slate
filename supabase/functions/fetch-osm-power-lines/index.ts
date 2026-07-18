// OSM Overpass proxy for power lines (DK/SE/DE/FI on-demand)
// Viewport-based, mirrors NVE-pattern for Norway.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Country bboxes to reject requests obviously outside supported area.
const COUNTRY_BOUNDS: Array<[number, number, number, number]> = [
  [54.4, 7.5, 58.2, 15.8],   // DK  [minLat, minLng, maxLat, maxLng]
  [55.0, 10.85, 69.4, 25.8], // SE
  [47.0, 5.5, 55.4, 15.7],   // DE
  [59.5, 19.0, 70.3, 32.2],  // FI
];

function bboxInSupportedCountry(south: number, west: number, north: number, east: number) {
  return COUNTRY_BOUNDS.some(([s, w, n, e]) => south <= n && north >= s && west <= e && east >= w);
}

async function overpassQuery(query: string): Promise<any> {
  let lastErr: unknown = null;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        lastErr = new Error(`${url} HTTP ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('All Overpass endpoints failed');
}

function osmToGeoJSON(osm: any) {
  const nodes = new Map<number, [number, number]>();
  const features: any[] = [];
  for (const el of osm.elements ?? []) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodes.set(el.id, [el.lon, el.lat]);
    }
  }
  for (const el of osm.elements ?? []) {
    if (el.type === 'way' && Array.isArray(el.nodes)) {
      const coords = el.nodes.map((id: number) => nodes.get(id)).filter(Boolean) as [number, number][];
      if (coords.length < 2) continue;
      features.push({
        type: 'Feature',
        id: `way/${el.id}`,
        geometry: { type: 'LineString', coordinates: coords },
        properties: el.tags ?? {},
      });
    } else if (el.type === 'node' && el.tags?.power) {
      features.push({
        type: 'Feature',
        id: `node/${el.id}`,
        geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
        properties: el.tags,
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const south = Number(body.south);
    const west = Number(body.west);
    const north = Number(body.north);
    const east = Number(body.east);
    if (![south, west, north, east].every(Number.isFinite)) {
      return new Response(JSON.stringify({ error: 'Invalid bbox' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Guard: reject overly large bboxes (Overpass will time out).
    if ((north - south) * (east - west) > 4) {
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!bboxInSupportedCountry(south, west, north, east)) {
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only high-voltage transmission (`power=line`) + substations. Skip `minor_line`
    // (LV distribution) to keep payload manageable at typical map zooms.
    const bbox = `${south},${west},${north},${east}`;
    const query = `[out:json][timeout:20];(
  way["power"="line"](${bbox});
  way["power"="cable"](${bbox});
  node["power"="tower"]["ref"](${bbox});
  node["power"="substation"](${bbox});
  way["power"="substation"](${bbox});
);out body geom;`;

    const osm = await overpassQuery(query);
    const geojson = osmToGeoJSON(osm);
    return new Response(JSON.stringify(geojson), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' },
    });
  } catch (err) {
    console.error('[fetch-osm-power-lines]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
