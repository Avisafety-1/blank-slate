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
const ALLOWED_HOSTS = [SANDBOX_HOST, PROD_HOST];

// Default: the area from the SafeSky Live screenshot (Trondheimsfjorden / ENVA)
const DEFAULT_LAT = 63.55;
const DEFAULT_LON = 10.55;
const DEFAULT_RAD = 20000; // metres — SafeSky max

interface EnvResult {
  host: string;
  key: string;
  status: number | null;
  count: number | null;
  callsigns: string[];
  error?: string;
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

    const lat = Number(body.lat ?? DEFAULT_LAT).toFixed(4);
    const lon = Number(body.lon ?? DEFAULT_LON).toFixed(4);
    const rad = Math.min(Number(body.rad ?? DEFAULT_RAD) || DEFAULT_RAD, DEFAULT_RAD);

    // ---- Two single lightweight GETs, no DB writes ---------------------------
    const [sandbox, production] = await Promise.all([
      probe(SANDBOX_HOST, "SAFESKY_API_KEY", Deno.env.get("SAFESKY_API_KEY"), lat, lon, rad),
      probe(PROD_HOST, "SAFESKY_PROD_API_KEY", Deno.env.get("SAFESKY_PROD_API_KEY"), lat, lon, rad),
    ]);

    const sandboxSet = new Set(sandbox.callsigns);
    const onlyInProduction = production.callsigns.filter((c) => !sandboxSet.has(c));

    return new Response(
      JSON.stringify({ query: { lat, lon, rad }, sandbox, production, onlyInProduction }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
