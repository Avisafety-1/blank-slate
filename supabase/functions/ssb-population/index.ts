import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Proxy for SSB WFS population grid data.
 * SSB MapServer only supports WFS 1.1.0 with GML output.
 * This function fetches GML, parses it, and returns JSON.
 *
 * Query param: bbox = minLng,minLat,maxLng,maxLat
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const bbox = url.searchParams.get("bbox");
    if (!bbox) {
      return new Response(JSON.stringify({ error: "Missing bbox parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // bbox expected: minLng,minLat,maxLng,maxLat
    // SSB WFS 1.1.0 with EPSG:4326 uses lon,lat order in bbox
    const wfsUrl = `https://kart.ssb.no/api/mapserver/v1/wfs/befolkning_paa_rutenett?service=WFS&version=1.1.0&request=GetFeature&typeNames=befolkning_1km_2025&srsName=EPSG:4326&bbox=${bbox}&maxFeatures=10000`;

    console.log("Fetching SSB WFS:", wfsUrl);

    const resp = await fetch(wfsUrl);
    if (!resp.ok) {
      const text = await resp.text();
      console.error("SSB WFS error:", resp.status, text);
      return new Response(JSON.stringify({ error: `SSB WFS ${resp.status}`, details: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gml = await resp.text();

    // Parse GML to extract population cells
    const features: Array<{ pop_tot: number; centroidLat: number; centroidLng: number }> = [];

    // Extract each featureMember block
    const memberRegex = /<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g;
    let match;
    while ((match = memberRegex.exec(gml)) !== null) {
      const block = match[1];

      // Extract pop_tot
      const popMatch = block.match(/<ms:pop_tot>(\d+)<\/ms:pop_tot>/);
      const pop = popMatch ? parseInt(popMatch[1], 10) : 0;
      if (pop <= 0) continue;

      // Extract centroid from posList (polygon coordinates)
      const posListMatch = block.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
      if (!posListMatch) continue;

      const coords = posListMatch[1].trim().split(/\s+/).map(Number);
      // posList is pairs of lat lng (WFS 1.1.0 EPSG:4326 axis order)
      let sumLat = 0, sumLng = 0, count = 0;
      for (let i = 0; i < coords.length - 2; i += 2) {
        sumLat += coords[i];
        sumLng += coords[i + 1];
        count++;
      }
      if (count === 0) continue;

      features.push({
        pop_tot: pop,
        centroidLat: sumLat / count,
        centroidLng: sumLng / count,
      });
    }

    console.log(`Parsed ${features.length} population cells from GML`);

    return new Response(JSON.stringify({ features }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("SSB population error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
