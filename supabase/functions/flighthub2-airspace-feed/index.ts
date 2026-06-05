// FlightHub 2 "Third-Party Airspace Data" feed (pull-modell).
// DJI FlightHub 2 kaller dette endepunktet med en API-nøkkel for å hente
// sanntids sivil flytrafikk. Vi vet ikke ennå hvilken path/queryformat
// DJI bruker — derfor logger denne funksjonen ALT, slik at vi kan
// se nøyaktig hva som etterspørres etter Verify-knappen er trykket.
//
// Etter at vi har bekreftet kontrakten i fh2_airspace_feed_log,
// erstattes "tom liste"-svaret med en ekte SafeSky/BarentsWatch-feed.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ENC_KEY = Deno.env.get("FH2_ENCRYPTION_KEY") ?? "";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function extractKey(req: Request, url: URL): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const xKey =
    req.headers.get("x-api-key") ??
    req.headers.get("api-key") ??
    req.headers.get("apikey") ??
    req.headers.get("x-auth-token");
  if (xKey) return xKey.trim();
  const q =
    url.searchParams.get("api_key") ??
    url.searchParams.get("apikey") ??
    url.searchParams.get("key") ??
    url.searchParams.get("token");
  if (q) return q.trim();
  return null;
}

function headersToObject(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    // DIAGNOSE: logg full Authorization midlertidig for å se SS-HMAC-formatet
    // som DJI FH2 sender. Re-maskeres etter at vi har bekreftet kontrakten.
    out[k] = v;
  });
  return out;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Stripp funksjons-prefiks (/flighthub2-airspace-feed) slik at "path"
  // viser hva DJI faktisk kaller (f.eks. "/v1/uav" eller "/")
  const fnPrefix = "/flighthub2-airspace-feed";
  const path = url.pathname.startsWith(fnPrefix)
    ? (url.pathname.slice(fnPrefix.length) || "/")
    : url.pathname;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Health check (uten auth) — for å bekrefte at funksjonen lever
  if (req.method === "GET" && (path === "/" || path === "/health")) {
    await supabase.from("fh2_airspace_feed_log").insert({
      method: req.method,
      path,
      query: url.search || null,
      headers: headersToObject(req),
      body_preview: null,
      remote_ip: req.headers.get("x-forwarded-for"),
      status_returned: 200,
      matched_key: false,
    });
    return new Response("OK", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  // Les body for logging
  let bodyText: string | null = null;
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      bodyText = await req.text();
    }
  } catch {
    bodyText = null;
  }

  const key = extractKey(req, url);
  let companyId: string | null = null;
  let matched = false;

  if (key && ENC_KEY) {
    try {
      const { data } = await supabase.rpc("lookup_fh2_feed_company", {
        p_key: key,
        p_enc_key: ENC_KEY,
      });
      if (data) {
        companyId = data as string;
        matched = true;
      }
    } catch (e) {
      console.error("lookup_fh2_feed_company error", e);
    }
  }

  // Bestem responsstatus
  const status = matched ? 200 : (key ? 401 : 401);

  // Logg ALT — også uten match — så Tensio kan se hva DJI sendte
  try {
    await supabase.from("fh2_airspace_feed_log").insert({
      company_id: companyId,
      method: req.method,
      path,
      query: url.search || null,
      headers: headersToObject(req),
      body_preview: bodyText ? bodyText.slice(0, 2000) : null,
      remote_ip: req.headers.get("x-forwarded-for"),
      status_returned: status,
      matched_key: matched,
    });
  } catch (e) {
    console.error("feed log insert error", e);
  }

  if (!matched) {
    return new Response(
      JSON.stringify({ code: 401, message: "invalid_or_missing_api_key" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Oppdater last_request_at
  try {
    await supabase.rpc("touch_fh2_feed_request", { p_company_id: companyId });
  } catch {
    /* noop */
  }

  // Inntil vi vet eksakt format, returnér tom feed.
  // Vi sender BÅDE en flat array OG et standard "code/data"-objekt;
  // mange DJI-endepunkter forventer { code:0, data:[...] }.
  // DJI godtar typisk en av disse — vi raffinerer etter første ekte request.
  const empty = { code: 0, message: "success", data: [] };
  return new Response(JSON.stringify(empty), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
