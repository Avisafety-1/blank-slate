import { safeFetch, fingerprintToken } from "../_shared/http.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED = ["public-api.safesky.app"];
const DEFAULT_VIEWPORT = "47.0,5.0,72.0,32.0";

async function probe(url: string, apiKey: string) {
  try {
    const res = await safeFetch(
      url,
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "Accept": "application/json",
          "User-Agent": "Avisafe/1.0 (kontakt@avisafe.no)",
        },
      },
      ALLOWED,
    );
    const text = await res.text();
    let count: number | null = null;
    try {
      const json = JSON.parse(text);
      count = Array.isArray(json) ? json.length : (Array.isArray(json?.beacons) ? json.beacons.length : null);
    } catch { /* non-json body */ }
    return { url, status: res.status, count, body: res.ok && count !== null ? undefined : text.slice(0, 300) };
  } catch (e) {
    return { url, status: null, count: null, body: String(e).slice(0, 300) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("SAFESKY_BEACONS_PROD_API_KEY")?.trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "SAFESKY_BEACONS_PROD_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let viewport = DEFAULT_VIEWPORT;
  try {
    const body = await req.json();
    if (typeof body?.viewport === "string" && body.viewport.length < 100) viewport = body.viewport;
  } catch { /* empty body allowed */ }

  const qs = `viewport=${viewport}`;
  const [withSlash, withoutSlash] = await Promise.all([
    probe(`https://public-api.safesky.app/v1/beacons/?${qs}`, apiKey),
    probe(`https://public-api.safesky.app/v1/beacons?${qs}`, apiKey),
  ]);

  return new Response(JSON.stringify({ viewport, key: { fingerprint: fingerprintToken(apiKey), length: apiKey.length }, results: [withSlash, withoutSlash] }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
