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

    // Type mapping: OpenAIP type -> zone_type
    const typeMap: Record<number, string> = {
      0: "P",  // Prohibited (other/unknown mapped to P)
      1: "R",  // Restricted  
      2: "D",  // Danger
      3: "P",  // Prohibited
      4: "R",  // Restricted
      5: "D",  // Danger
    };

    // OpenAIP airspace types for Norway:
    // type 1 = Other, 2 = Restricted, 3 = Danger, 4 = Prohibited
    // But the actual API uses different numbering - let's fetch all and filter
    const allAirspaces: any[] = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.core.openaip.net/api/airspaces?country=NO&type=1,2,3,4,5&limit=${limit}&page=${page}`;
      console.log(`Fetching page ${page}: ${url}`);

      const response = await fetch(url, {
        headers: {
          "x-openaip-client-id": OPENAIP_API_KEY,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAIP API error ${response.status}: ${errorText}`
        );
      }

      const data = await response.json();
      const items = data.items || [];
      allAirspaces.push(...items);

      console.log(`Page ${page}: got ${items.length} airspaces`);

      if (items.length < limit) {
        hasMore = false;
      } else {
        page++;
      }
    }

    console.log(`Total airspaces fetched: ${allAirspaces.length}`);

    let synced = 0;
    let errors = 0;
    const details: string[] = [];

    for (const airspace of allAirspaces) {
      try {
        const openaipId = airspace._id;
        const name = airspace.name || "Ukjent";
        const airspaceType = airspace.type;
        const geometry = airspace.geometry;

        if (!geometry) {
          console.warn(`Skipping ${name}: no geometry`);
          continue;
        }

        // Map type
        const zoneType = typeMap[airspaceType] || "D";

        // Extract zone_id from name (e.g., "EN-R102 OSLO" -> "EN-R102")
        const zoneIdMatch = name.match(/EN-[RPDA]\d+[A-Z]?/i);
        const zoneId = zoneIdMatch ? zoneIdMatch[0].toUpperCase() : `OPENAIP-${openaipId}`;

        // Format limits
        const upperLimit = airspace.upperLimit
          ? `${airspace.upperLimit.value} ${airspace.upperLimit.unit === 1 ? "ft" : "m"} ${airspace.upperLimit.referenceDatum === 1 ? "MSL" : "AGL"}`
          : null;
        const lowerLimit = airspace.lowerLimit
          ? `${airspace.lowerLimit.value} ${airspace.lowerLimit.unit === 1 ? "ft" : "m"} ${airspace.lowerLimit.referenceDatum === 1 ? "MSL" : "AGL"}`
          : null;

        // Upsert using RPC to handle PostGIS geometry
        const { error: upsertError } = await supabase.rpc(
          "upsert_openaip_airspace",
          {
            p_openaip_id: openaipId,
            p_zone_id: zoneId,
            p_zone_type: zoneType,
            p_name: name,
            p_geometry_geojson: JSON.stringify(geometry),
            p_upper_limit: upperLimit,
            p_lower_limit: lowerLimit,
            p_remarks: airspace.remarks || null,
            p_properties: JSON.stringify({
              openaip_type: airspaceType,
              country: airspace.country,
              icaoClass: airspace.icaoClass,
            }),
          }
        );

        if (upsertError) {
          console.error(`Error upserting ${zoneId}: ${upsertError.message}`);
          errors++;
          details.push(`❌ ${zoneId}: ${upsertError.message}`);
        } else {
          synced++;
          details.push(`✅ ${zoneId} (${name})`);
        }
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        details.push(`❌ ${airspace.name || "unknown"}: ${msg}`);
      }
    }

    const summary = {
      total_fetched: allAirspaces.length,
      synced,
      errors,
      details: details.slice(0, 50), // Limit details in response
    };

    console.log(`Sync complete: ${synced} synced, ${errors} errors`);

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
