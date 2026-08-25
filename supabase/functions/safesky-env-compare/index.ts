// Isolated diagnostic: compares SafeSky SANDBOX vs PRODUCTION traffic for one
// small area. Read-only — performs NO database writes and is not called by any
// app code. Safe to delete once the comparison is done.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAuthHeaders } from "../_shared/safesky-hmac.ts";
import { safeFetch } from "../_shared/http.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SANDBOX_HOST = "sandbox-public-api.safesky.app";
const PROD_HOST = "public-api.safesky.app";
const UAV_HOST = "uav-api.safesky.app";
const ALLOWED_HOSTS = [SANDBOX_HOST, PROD_HOST, UAV_HOST];

// Default: the area from the SafeSky Live screenshot (Trondheimsfjorden / ENVA)
const DEFAULT_LAT = 63.55;
const DEFAULT_LON = 10.55;
const DEFAULT_RAD = 20000; // metres — SafeSky max

const DEFAULT_VIEWPORT = "47.0,5.0,72.0,32.0";

interface EnvResult {
  host: string;
  key: string;
  status: number | null;
  count: number | null;
  callsigns: string[];
  sources?: Record<string, number>;
  types?: Record<string, number>;
  bbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number } | null;
  error?: string;
}

function tally(arr: Record<string, unknown>[], field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of arr) {
    const k = String(b?.[field] ?? "unknown");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function bboxOf(arr: Record<string, unknown>[]) {
  const pts = arr
    .map((b) => [Number(b?.latitude), Number(b?.longitude)])
    .filter(([a, o]) => Number.isFinite(a) && Number.isFinite(o));
  if (!pts.length) return null;
  return {
    minLat: Math.min(...pts.map((p) => p[0])),
    minLon: Math.min(...pts.map((p) => p[1])),
    maxLat: Math.max(...pts.map((p) => p[0])),
    maxLon: Math.max(...pts.map((p) => p[1])),
  };
}

async function probeBeacons(
  host: string,
  keyLabel: string,
  apiKey: string | undefined,
  viewport: string,
  useHmac = false,
): Promise<EnvResult> {
  if (!apiKey) {
    return { host, key: keyLabel, status: null, count: null, callsigns: [], error: "no key configured" };
  }
  const url = `https://${host}/v1/beacons?viewport=${viewport}&return_grounded_traffic=true`;
  try {
    const authHeaders = useHmac ? await generateAuthHeaders(apiKey, "GET", url) : {};
    const res = await safeFetch(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Avisafe/1.0 (kontakt@avisafe.no)",
          "x-api-key": apiKey,
          ...authHeaders,
        },
      },
      ALLOWED_HOSTS,
    );
    const text = await res.text();
    if (!res.ok) {
      return { host, key: keyLabel, status: res.status, count: null, callsigns: [], error: text.slice(0, 300) };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { host, key: keyLabel, status: res.status, count: null, callsigns: [], error: "non-JSON response" };
    }
    const arr = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    return {
      host,
      key: keyLabel,
      status: res.status,
      count: arr.length,
      callsigns: arr.map((b) => String(b?.callsign ?? b?.id ?? "?")).slice(0, 30),
      sources: tally(arr, "source"),
      types: tally(arr, "beacon_type"),
      bbox: bboxOf(arr),
    };
  } catch (e) {
    return { host, key: keyLabel, status: null, count: null, callsigns: [], error: String(e).slice(0, 300) };
  }
}

async function probe(
  host: string,
  keyLabel: string,
  apiKey: string | undefined,
  lat: string,
  lon: string,
  rad: number,
): Promise<EnvResult> {
  if (!apiKey) {
    return { host, key: keyLabel, status: null, count: null, callsigns: [], error: "no key configured" };
  }
  const url = `https://${host}/v1/uav?lat=${lat}&lng=${lon}&rad=${rad}`;
  try {
    const authHeaders = await generateAuthHeaders(apiKey, "GET", url);
    const res = await safeFetch(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Avisafe/1.0 (kontakt@avisafe.no)",
          "x-api-key": apiKey,
          ...authHeaders,
        },
      },
      ALLOWED_HOSTS,
    );
    const text = await res.text();
    if (!res.ok) {
      return { host, key: keyLabel, status: res.status, count: null, callsigns: [], error: text.slice(0, 300) };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { host, key: keyLabel, status: res.status, count: null, callsigns: [], error: "non-JSON response" };
    }
    const arr = Array.isArray(data) ? data : [];
    const callsigns = arr
      .map((b: Record<string, unknown>) => String(b?.callsign ?? b?.id ?? "?"))
      .slice(0, 50);
    return { host, key: keyLabel, status: res.status, count: arr.length, callsigns };
  } catch (e) {
    return { host, key: keyLabel, status: null, count: null, callsigns: [], error: String(e).slice(0, 300) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Auth: Avisafe superadmin, or the internal diagnostic token ---------
    const diagToken = Deno.env.get("SAFESKY_COMPARE_TOKEN");
    const providedSecret = req.headers.get("x-diag-token");
    const secretOk = !!diagToken && providedSecret === diagToken;

    if (!secretOk) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(token);
      const user = userData?.user;
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAvisafe } = await supabase.rpc("is_avisafe_superadmin", { _user_id: user.id });
      if (!isAvisafe) {
        return new Response(JSON.stringify({ error: "Forbidden: superadmin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    // ---- Input --------------------------------------------------------------
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch { /* empty body allowed */ }

    const prodKeyEnv = Deno.env.get("SAFESKY_PROD_API_KEY");
    const sandboxKeyEnv = Deno.env.get("SAFESKY_API_KEY");

    // ---- Beacons mode: same endpoint/viewport as today's traffic fetch -------
    if (body.endpoint === "beacons") {
      const viewport = String(body.viewport ?? DEFAULT_VIEWPORT);
      const beaconsKey = Deno.env.get("SAFESKY_BEACONS_API_KEY") || sandboxKeyEnv;
      const [sandboxB, prodUavB, prodPubB, prodPubHmac, prodUavHmac, prodPubBeaconsKey] = await Promise.all([
        probeBeacons(SANDBOX_HOST, "SAFESKY_BEACONS_API_KEY", beaconsKey, viewport),
        probeBeacons(UAV_HOST, "SAFESKY_PROD_API_KEY", prodKeyEnv, viewport),
        probeBeacons(PROD_HOST, "SAFESKY_PROD_API_KEY", prodKeyEnv, viewport),
        probeBeacons(PROD_HOST, "SAFESKY_PROD_API_KEY+hmac", prodKeyEnv, viewport, true),
        probeBeacons(UAV_HOST, "SAFESKY_PROD_API_KEY+hmac", prodKeyEnv, viewport, true),
        probeBeacons(PROD_HOST, "SAFESKY_BEACONS_API_KEY", beaconsKey, viewport),
      ]);
      const sbSet = new Set(sandboxB.callsigns);
      const best = [prodUavB, prodPubB, prodPubHmac, prodUavHmac, prodPubBeaconsKey].find((r) => r.count != null);
      return new Response(
        JSON.stringify({
          query: { endpoint: "beacons", viewport },
          sandbox: sandboxB,
          productionUav: prodUavB,
          productionPublic: prodPubB,
          productionPublicHmac: prodPubHmac,
          productionUavHmac: prodUavHmac,
          productionPublicBeaconsKey: prodPubBeaconsKey,
          onlyInProduction: (best?.callsigns ?? []).filter((c) => !sbSet.has(c)),
        }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lat = Number(body.lat ?? DEFAULT_LAT).toFixed(4);
    const lon = Number(body.lon ?? DEFAULT_LON).toFixed(4);
    const rad = Math.min(Number(body.rad ?? DEFAULT_RAD) || DEFAULT_RAD, DEFAULT_RAD);

    // ---- A few single lightweight GETs, no DB writes -------------------------
    const prodKey = prodKeyEnv;
    const sandboxKey = sandboxKeyEnv;
    const [sandbox, production, productionUav, productionSandboxKey] = await Promise.all([
      probe(SANDBOX_HOST, "SAFESKY_API_KEY", sandboxKey, lat, lon, rad),
      probe(PROD_HOST, "SAFESKY_PROD_API_KEY", prodKey, lat, lon, rad),
      probe(UAV_HOST, "SAFESKY_PROD_API_KEY", prodKey, lat, lon, rad),
      probe(PROD_HOST, "SAFESKY_API_KEY", sandboxKey, lat, lon, rad),
    ]);


    const sandboxSet = new Set(sandbox.callsigns);
    const onlyInProduction = production.callsigns.filter((c) => !sandboxSet.has(c));

    return new Response(
      JSON.stringify({ query: { lat, lon, rad }, sandbox, production, productionUav, productionSandboxKey, onlyInProduction }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
