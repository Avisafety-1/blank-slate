import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseNotamCoordinates(text: string | null | undefined): object | null {
  if (!text) return null;
  const regex = /(\d{2})(\d{2})(\d{2})([NS])\s+(\d{3})(\d{2})(\d{2})([EW])/g;
  const coords: [number, number][] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const latDeg = parseInt(match[1]);
    const latMin = parseInt(match[2]);
    const latSec = parseInt(match[3]);
    const latDir = match[4];
    const lngDeg = parseInt(match[5]);
    const lngMin = parseInt(match[6]);
    const lngSec = parseInt(match[7]);
    const lngDir = match[8];
    let lat = latDeg + latMin / 60 + latSec / 3600;
    if (latDir === "S") lat = -lat;
    let lng = lngDeg + lngMin / 60 + lngSec / 3600;
    if (lngDir === "W") lng = -lng;
    coords.push([lng, lat]);
  }
  if (coords.length < 3) return null;
  // Close the ring
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([...first] as [number, number]);
  }
  return {
    type: "Polygon",
    coordinates: [coords],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const LAMINAR_API_KEY = Deno.env.get("LAMINAR_API_KEY");
  if (!LAMINAR_API_KEY) {
    return new Response(JSON.stringify({ error: "LAMINAR_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Fetch NOTAMs for Norway
    const apiUrl = `https://api.laminardata.aero/v2/countries/NOR/notams?user_key=${LAMINAR_API_KEY}`;
    const response = await fetch(apiUrl, {
      headers: {
        "Accept-Encoding": "gzip",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Laminar API error [${response.status}]:`, text);
      return new Response(JSON.stringify({ error: `Laminar API error: ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const features = data?.features;
    if (!Array.isArray(features)) {
      console.warn("No features array in response");
      return new Response(JSON.stringify({ fetched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let upserted = 0;
    let skipped = 0;

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < features.length; i += batchSize) {
      const batch = features.slice(i, i + batchSize);
      const rows = [];

      for (const feature of batch) {
        const props = feature.properties || {};
        const id = feature.id;
        if (!id) { skipped++; continue; }

        const effectiveEnd = props.effectiveEnd ? new Date(props.effectiveEnd) : null;
        const interpretation = props.effectiveEndInterpretation;

        // Skip expired NOTAMs (unless PERM/EST)
        if (effectiveEnd && effectiveEnd < now && interpretation !== "PERM" && interpretation !== "EST") {
          skipped++;
          continue;
        }

        // Extract center point
        const centerLat = props.lat ?? null;
        const centerLng = props.lon ?? null;

        // Store geometry as GeoJSON
        const geometryGeojson = feature.geometry || null;

        rows.push({
          notam_id: String(id),
          series: props.series || null,
          number: props.number ?? 0,
          year: props.year ?? 0,
          location: props.location || null,
          country_code: props.countryCode || null,
          qcode: props.qcode || null,
          scope: props.scope || null,
          traffic: props.traffic || null,
          purpose: props.purpose || null,
          notam_type: props.type || null,
          notam_text: props.text || null,
          effective_start: props.effectiveStart || null,
          effective_end: props.effectiveEnd || null,
          effective_end_interpretation: interpretation || null,
          minimum_fl: props.minimumFL ?? null,
          maximum_fl: props.maximumFL ?? null,
          center_lat: centerLat,
          center_lng: centerLng,
          geometry_geojson: geometryGeojson,
          properties: props,
          fetched_at: now.toISOString(),
        });
      }

      if (rows.length > 0) {
        const { error } = await supabase
          .from("notams")
          .upsert(rows, { onConflict: "notam_id" });

        if (error) {
          console.error("Upsert error:", error);
        } else {
          upserted += rows.length;
        }
      }
    }

    // Delete expired NOTAMs
    const { error: deleteError, count: deleteCount } = await supabase
      .from("notams")
      .delete({ count: "exact" })
      .lt("effective_end", now.toISOString())
      .not("effective_end_interpretation", "in", '("PERM","EST")');

    if (deleteError) {
      console.error("Delete expired error:", deleteError);
    }

    // Also delete very old NOTAMs without effective_end (stale data)
    const staleDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    await supabase
      .from("notams")
      .delete()
      .is("effective_end", null)
      .lt("fetched_at", staleDate.toISOString());

    console.log(`NOTAMs: upserted=${upserted}, skipped=${skipped}, deleted=${deleteCount || 0}`);

    return new Response(JSON.stringify({
      fetched: features.length,
      upserted,
      skipped,
      deleted: deleteCount || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-notams error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
