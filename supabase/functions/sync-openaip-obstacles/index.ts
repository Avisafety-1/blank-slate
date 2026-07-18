import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAIP_API_KEY = Deno.env.get("OPENAIP_API_KEY");
    if (!OPENAIP_API_KEY) {
      throw new Error("OPENAIP_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let countries: string[] = ["NO", "DK", "SE", "DE", "FI"];
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (Array.isArray(body?.countries) && body.countries.length > 0) {
          countries = body.countries.map((c: string) => c.toUpperCase());
        }
      }
    } catch (_) { /* ignore */ }

    const limit = 1000;

    // Obstacle type mapping
    const obstacleTypeMap: Record<number, string> = {
      0: "other", 1: "cable", 2: "tower", 3: "chimney", 4: "mast",
      5: "wind_turbine", 6: "building", 7: "church", 8: "bridge",
      9: "natural", 10: "pole", 11: "catenary", 12: "antenna",
    };

    let totalFetched = 0;
    let synced = 0;
    let errors = 0;

    const upsertBatch = async (items: any[]) => {
      const rows = items
        .map((o) => {
          const g = o.geometry;
          if (!g?.coordinates) return null;
          const [lng, lat] = g.coordinates;
          return {
            openaip_id: o._id,
            name: o.name || null,
            type: obstacleTypeMap[o.type] || "other",
            geometry: `SRID=4326;POINT(${lng} ${lat})`,
            elevation: o.elevation?.value ?? null,
            height_agl: o.heightAgl?.value ?? o.height?.value ?? null,
            properties: {
              openaip_type: o.type,
              country: o.country,
              lighted: o.lighted,
            },
            synced_at: new Date().toISOString(),
          };
        })
        .filter(Boolean) as any[];

      if (rows.length === 0) return;
      const { error } = await supabase
        .from("openaip_obstacles")
        .upsert(rows, { onConflict: "openaip_id" });
      if (error) {
        console.error(`Batch upsert error: ${error.message}`);
        errors += rows.length;
      } else {
        synced += rows.length;
      }
    };

    for (const country of countries) {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const url = `https://api.core.openaip.net/api/obstacles?country=${country}&limit=${limit}&page=${page}`;
        console.log(`[${country}] page ${page}`);
        const response = await fetch(url, {
          headers: { "x-openaip-api-key": OPENAIP_API_KEY, Accept: "application/json" },
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAIP API error ${response.status} for ${country}: ${errorText}`);
        }
        const data = await response.json();
        const items = data.items || [];
        totalFetched += items.length;
        await upsertBatch(items);
        console.log(`[${country}] page ${page}: ${items.length} (synced=${synced})`);
        if (items.length < limit) hasMore = false;
        else page++;
      }
    }

    const summary = { total_fetched: totalFetched, synced, errors };
    console.log(`Done: ${JSON.stringify(summary)}`);
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Sync error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
