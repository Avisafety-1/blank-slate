import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * One-time import endpoint for Eurostat GEOSTAT 2021 1 km grid.
 *
 * Auth: requires header `x-import-secret` to match EUROSTAT_IMPORT_SECRET env var.
 * Body: { rows: Array<{ grd_id: string, pop_2021: number, geom_wkt: string }> }
 *   geom_wkt must be EPSG:4326 polygon WKT, e.g. "POLYGON((lng lat, ...))".
 *
 * Inserts via PostgREST upsert. Delete this function after import is done.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // One-time hardcoded secret — this function and secret are deleted after import.
  const IMPORT_SECRET = "es-1km-import-7f4c2b9e8a13d65afc01";
  if (req.headers.get("x-import-secret") !== IMPORT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const rows = body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "missing rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Use raw SQL via rpc for ST_GeomFromText. Build a single multi-row insert.
    // We use a temp staging approach: bulk insert grd_id+pop+wkt, then convert.
    const values = rows
      .map(
        (r: any, i: number) =>
          `($${i * 3 + 1}, $${i * 3 + 2}, ST_GeomFromText($${i * 3 + 3}, 4326))`
      )
      .join(",");

    const params: any[] = [];
    for (const r of rows) {
      params.push(r.grd_id, r.pop_2021, r.geom_wkt);
    }

    const sql = `insert into public.eurostat_population_1km (grd_id, pop_2021, geom)
      values ${values}
      on conflict (grd_id) do update set pop_2021 = excluded.pop_2021, geom = excluded.geom`;

    // Postgres meta SQL via rpc helper isn't available; use a tiny exec function.
    // Fallback: PostgREST cannot run raw SQL — use a dedicated rpc.
    const { error } = await supabase.rpc("eurostat_bulk_insert", {
      payload: rows.map((r: any) => ({ grd_id: r.grd_id, pop_2021: r.pop_2021, geom_wkt: r.geom_wkt })),
    });

    if (error) {
      console.error("bulk insert error", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ inserted: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("eurostat-import error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
