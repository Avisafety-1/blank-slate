// Shadow verification: compare legacy DK tables (dk_drone_zones, dk_nature_areas)
// against unified airspace_zones (DK) for a set of sample bboxes across Denmark.
// Observation-only: writes to airspace_shadow_comparisons. Does NOT affect any user-facing data.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Grid of sample bboxes across Denmark (roughly 54.5-57.8N, 8.0-15.2E)
function sampleBboxes(n = 24): Array<[number, number, number, number]> {
  const boxes: Array<[number, number, number, number]> = [];
  const cols = 6, rows = 4;
  const minLat = 54.5, maxLat = 57.8, minLng = 8.0, maxLng = 15.2;
  const dLat = (maxLat - minLat) / rows;
  const dLng = (maxLng - minLng) / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lat0 = minLat + r * dLat;
      const lng0 = minLng + c * dLng;
      boxes.push([lng0, lat0, lng0 + dLng, lat0 + dLat]);
    }
  }
  return boxes.slice(0, n);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const bboxes = sampleBboxes();
  const rows: any[] = [];
  let totalLegacy = 0, totalUnified = 0, overlapSum = 0;

  for (const [minLng, minLat, maxLng, maxLat] of bboxes) {
    // Legacy zones (dk_drone_zones)
    const { data: legacyDrone } = await supabase.rpc('get_dk_drone_zones_in_bounds', {
      min_lat: minLat, min_lng: minLng, max_lat: maxLat, max_lng: maxLng,
      p_layer_ids: ['bla', 'orange', 'rod', 'gron', 'gul'],
    });
    // Legacy nature
    const { data: legacyNature } = await supabase.rpc('get_dk_nature_areas_in_bounds', {
      min_lat: minLat, min_lng: minLng, max_lat: maxLat, max_lng: maxLng,
    });
    // Unified
    const { data: unified } = await supabase.rpc('airspace_zones_in_bbox', {
      p_min_lng: minLng, p_min_lat: minLat, p_max_lng: maxLng, p_max_lat: maxLat,
      p_zone_types: null, p_country_codes: ['DK'], p_layer_ids: null,
    });

    const legacyIds = new Set<string>([
      ...((legacyDrone ?? []) as any[]).map((z) => `drone:${z.external_id ?? z.id}`),
      ...((legacyNature ?? []) as any[]).map((z) => `nature:${z.external_id ?? z.id}`),
    ]);
    const unifiedIds = new Set<string>(
      ((unified ?? []) as any[]).map((z) => {
        const isNature = z.source === 'trafikstyrelsen_dk_nature';
        return `${isNature ? 'nature' : 'drone'}:${z.external_id ?? z.id}`;
      }),
    );

    const inter = [...legacyIds].filter((k) => unifiedIds.has(k));
    const onlyLegacy = [...legacyIds].filter((k) => !unifiedIds.has(k));
    const onlyUnified = [...unifiedIds].filter((k) => !legacyIds.has(k));
    const denom = Math.max(legacyIds.size, unifiedIds.size);
    const parity = denom === 0 ? 100 : (inter.length / denom) * 100;

    totalLegacy += legacyIds.size;
    totalUnified += unifiedIds.size;
    overlapSum += inter.length;

    rows.push({
      country_code: 'DK',
      context: `bbox:${minLng.toFixed(2)},${minLat.toFixed(2)},${maxLng.toFixed(2)},${maxLat.toFixed(2)}`,
      route_geojson: {
        type: 'Polygon',
        coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]],
      },
      buffer_m: 0,
      legacy_count: legacyIds.size,
      unified_count: unifiedIds.size,
      only_in_legacy: onlyLegacy.slice(0, 50),
      only_in_unified: onlyUnified.slice(0, 50),
      parity_pct: Number(parity.toFixed(2)),
      notes: 'shadow-verify-dk',
    });
  }

  if (rows.length) {
    const { error } = await supabase.from('airspace_shadow_comparisons').insert(rows);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const denom = Math.max(totalLegacy, totalUnified);
  const overallParity = denom === 0 ? 100 : (overlapSum / denom) * 100;

  return new Response(
    JSON.stringify({
      samples: rows.length,
      total_legacy: totalLegacy,
      total_unified: totalUnified,
      overlap: overlapSum,
      overall_parity_pct: Number(overallParity.toFixed(2)),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
