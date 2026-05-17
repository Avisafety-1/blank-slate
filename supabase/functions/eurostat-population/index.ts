import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Eurostat GEOSTAT 2021 v2 1 km grid population proxy.
 * Mirrors the shape of `ssb-population` so the frontend can swap sources.
 *
 * Input (POST body or query): { bbox: "minLng,minLat,maxLng,maxLat" }
 * Output: { features: [{ pop_tot, centroidLat, centroidLng, polygon, densityPerKm2 }] }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const bbox = url.searchParams.get("bbox") || body?.bbox;
    if (!bbox) {
      return new Response(JSON.stringify({ error: "Missing bbox parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parts = bbox.split(",").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return new Response(JSON.stringify({ error: "Invalid bbox" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const [minLng, minLat, maxLng, maxLat] = parts;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase.rpc("eurostat_pop_in_bbox", {
      min_lng: minLng,
      min_lat: minLat,
      max_lng: maxLng,
      max_lat: maxLat,
    });

    if (error) {
      console.error("eurostat rpc error", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const features = (data ?? []).map((row: any) => {
      let polygon: Array<{ lat: number; lng: number }> = [];
      try {
        const gj = typeof row.geom_json === "string" ? JSON.parse(row.geom_json) : row.geom_json;
        // GeoJSON Polygon: coordinates[0] = outer ring of [lng,lat]
        const ring = gj?.coordinates?.[0] ?? [];
        polygon = ring.map((c: number[]) => ({ lat: c[1], lng: c[0] }));
      } catch (_) {
        // ignore malformed geometry
      }
      return {
        pop_tot: row.pop_2021,
        centroidLat: row.centroid_lat,
        centroidLng: row.centroid_lng,
        polygon,
        // 1 km² cell, density per km² == population
        densityPerKm2: row.pop_2021,
      };
    });

    return new Response(JSON.stringify({ features, source: "eurostat-1km-2021" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("eurostat-population error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
