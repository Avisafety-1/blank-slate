import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const wfsUrl = new URL("https://kart.ssb.no/api/mapserver/v1/wfs/befolkning_paa_rutenett");
    wfsUrl.searchParams.set("service", "WFS");
    wfsUrl.searchParams.set("version", "2.0.0");
    wfsUrl.searchParams.set("request", "GetFeature");
    wfsUrl.searchParams.set("typeNames", "ms:befolkning_1km_2025");
    wfsUrl.searchParams.set("outputFormat", "application/json");
    wfsUrl.searchParams.set("srsName", "EPSG:4326");
    wfsUrl.searchParams.set("bbox", bbox);
    wfsUrl.searchParams.set("count", "10000");

    const resp = await fetch(wfsUrl.toString());
    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: `SSB WFS ${resp.status}`, details: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
