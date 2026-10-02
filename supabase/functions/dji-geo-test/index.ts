// dji-geo-test — engangs testfunksjon mot DJI Geo Zones API.
// IKKE koblet til UI. Skal slettes etter testing.
//
// Query-parametre:
//   lat, lng        (obligatorisk)
//   drone           (default "dji-mavic-3")
//   radius          (default 20000, maks 50000)
//   compare_drone   (valgfri — kjører geo-kallet også for denne modellen)
//
// Returnerer HTTP-status, antall areas, sammendrag per area, råsample av de
// første 3 areas, og listen over støttede droner fra flysafe-api.dji.com.

import { safeFetch } from "../_shared/http.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_HOSTS = ["www-api.dji.com", "flysafe-api.dji.com"];

const DJI_HEADERS = {
  "Referer": "https://fly-safe.dji.com/",
  "Origin": "https://fly-safe.dji.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

const TIMEOUT_MS = 10_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await safeFetch(url, { headers: DJI_HEADERS, signal: controller.signal }, ALLOWED_HOSTS);
  } finally {
    clearTimeout(timer);
  }
}

function summarizeArea(a: any) {
  return {
    name: a?.name ?? null,
    level: a?.level ?? null,
    color: a?.color ?? null,
    height: a?.height ?? null,
    shape: a?.shape ?? null,
    type: a?.type ?? null,
    has_polygon_points: Array.isArray(a?.polygon_points) && a.polygon_points.length > 0,
    has_sub_areas: Array.isArray(a?.sub_areas) && a.sub_areas.length > 0,
  };
}

async function fetchGeoAreas(lat: number, lng: number, drone: string, radius: number) {
  const url =
    `https://www-api.dji.com/api/geo/areas?drone=${encodeURIComponent(drone)}` +
    `&zones_mode=total&country=NO&level=0,1,2,3,4,6,7` +
    `&lat=${lat}&lng=${lng}&search_radius=${radius}`;

  const res = await fetchWithTimeout(url);
  const text = await res.text();
  console.log(`[dji-geo-test] geo raw (${drone}):`, text);

  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }

  const areas: any[] = Array.isArray(parsed?.areas) ? parsed.areas : [];

  return {
    request_url: url,
    status: res.status,
    response_headers: {
      "content-type": res.headers.get("content-type"),
      "server": res.headers.get("server"),
    },
    area_count: areas.length,
    areas: areas.map(summarizeArea),
    raw_sample: areas.slice(0, 3),
    ...(res.ok ? {} : { error_body: text.slice(0, 500) }),
    _area_names: areas.map((a: any) => a?.name).filter(Boolean) as string[],
  };
}

async function fetchDrones() {
  const url = "https://flysafe-api.dji.com/dji/drones";
  const res = await fetchWithTimeout(url);
  const text = await res.text();
  console.log("[dji-geo-test] drones raw:", text);

  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }

  const list: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];

  return {
    request_url: url,
    status: res.status,
    response_headers: {
      "content-type": res.headers.get("content-type"),
      "server": res.headers.get("server"),
    },
    drones: list,
    ...(res.ok ? {} : { error_body: text.slice(0, 500) }),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ error: "lat and lng are required and must be numbers" }, 400);
    }
    const drone = url.searchParams.get("drone") || "dji-mavic-3";
    const radius = Math.min(Math.max(Number(url.searchParams.get("radius")) || 20000, 1), 50000);
    const compareDrone = url.searchParams.get("compare_drone");

    const [geo, drones] = await Promise.all([
      fetchGeoAreas(lat, lng, drone, radius),
      fetchDrones(),
    ]);

    const response: any = { geo, drones };
    // _area_names er kun til intern sammenligning — fjernes fra responsen.
    const baseNames: string[] = geo._area_names;
    delete geo._area_names;

    if (compareDrone) {
      const geoCompare = await fetchGeoAreas(lat, lng, compareDrone, radius);
      const compareNames: string[] = geoCompare._area_names;
      delete geoCompare._area_names;
      const baseSet = new Set(baseNames);
      const compareSet = new Set(compareNames);
      response.geo_compare = {
        ...geoCompare,
        only_in_primary: baseNames.filter((n) => !compareSet.has(n)),
        only_in_compare: compareNames.filter((n) => !baseSet.has(n)),
      };
    }

    return json(response);
  } catch (e) {
    console.error("[dji-geo-test] fatal:", e);
    return json({ error: "Internal", details: String(e) }, 500);
  }
});
