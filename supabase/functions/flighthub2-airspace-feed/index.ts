// FlightHub 2 "Third-Party Airspace Data" feed (pull-modell).
// DJI FH2 kaller dette endepunktet med SS-HMAC-SHA256-V1 signatur
// (AWS-SigV4-variant). Vi parser Authorization, slår opp selskapets
// secret via keyId i Credential, og verifiserer signaturen.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ENC_KEY = Deno.env.get("FH2_ENCRYPTION_KEY") ?? "";

function headersToObject(req: Request, maskAuth: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    if (maskAuth && k.toLowerCase() === "authorization") {
      // Behold scheme + Credential + SignedHeaders, masker Signature
      out[k] = v.replace(/Signature=[^,\s]+/i, "Signature=***");
    } else {
      out[k] = v;
    }
  });
  return out;
}

interface SsHmacParts {
  scheme: string;
  credential: string; // raw, f.eks. "abc123/v1"
  keyId: string; // "abc123"
  signedHeaders: string[]; // ["host","x-ss-date","x-ss-nonce"]
  signature: string; // hex
}

function parseAuthorization(auth: string | null): SsHmacParts | null {
  if (!auth) return null;
  const m = auth.match(/^(\S+)\s+(.*)$/);
  if (!m) return null;
  const scheme = m[1];
  const rest = m[2];
  const params: Record<string, string> = {};
  for (const part of rest.split(",")) {
    const p = part.trim();
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  const credential = params["credential"] ?? "";
  const signedHeaders = (params["signedheaders"] ?? "")
    .split(";")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const signature = params["signature"] ?? "";
  const keyId = credential.split("/")[0] ?? "";
  if (!keyId || !signature) return null;
  return { scheme, credential, keyId, signedHeaders, signature };
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalQuery(url: URL): string {
  const pairs: [string, string][] = [];
  for (const [k, v] of url.searchParams.entries()) {
    pairs.push([encodeURIComponent(k), encodeURIComponent(v)]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function buildSignatures(
  secret: string,
  method: string,
  path: string,
  url: URL,
  req: Request,
  parts: SsHmacParts,
  bodyText: string | null,
): Promise<{ candidates: { name: string; sig: string; stringToSign: string; canonical: string }[] }> {
  const cq = canonicalQuery(url);
  const payloadHash = await sha256Hex(bodyText ?? "");
  const xSsDate = req.headers.get("x-ss-date") ?? "";
  const xSsNonce = req.headers.get("x-ss-nonce") ?? "";
  const alg = req.headers.get("x-ss-alg") ?? "SS-HMAC-SHA256-V1";

  const canonicalHeaders = parts.signedHeaders
    .map((h) => `${h}:${(req.headers.get(h) ?? "").trim()}\n`)
    .join("");
  const signedHeadersStr = parts.signedHeaders.join(";");

  const canonicalRequest = [
    method.toUpperCase(),
    path,
    cq,
    canonicalHeaders,
    signedHeadersStr,
    payloadHash,
  ].join("\n");
  const crHash = await sha256Hex(canonicalRequest);

  // Prøv flere varianter — DJIs nøyaktige string-to-sign er udokumentert.
  const variants = [
    { name: "alg|date|nonce|crHash", s: `${alg}\n${xSsDate}\n${xSsNonce}\n${crHash}` },
    { name: "alg|date|crHash", s: `${alg}\n${xSsDate}\n${crHash}` },
    { name: "alg|date|nonce|cr", s: `${alg}\n${xSsDate}\n${xSsNonce}\n${canonicalRequest}` },
    { name: "date|nonce|crHash", s: `${xSsDate}\n${xSsNonce}\n${crHash}` },
    { name: "alg|credential|date|nonce|crHash", s: `${alg}\n${parts.credential}\n${xSsDate}\n${xSsNonce}\n${crHash}` },
  ];

  const candidates = [];
  for (const v of variants) {
    candidates.push({
      name: v.name,
      sig: await hmacSha256Hex(secret, v.s),
      stringToSign: v.s,
      canonical: canonicalRequest,
    });
  }
  return { candidates };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const fnPrefix = "/flighthub2-airspace-feed";
  const internalPath = url.pathname.startsWith(fnPrefix)
    ? (url.pathname.slice(fnPrefix.length) || "/")
    : url.pathname;
  const rawPath = url.pathname; // bevart for HMAC-kanonisering

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Health check (uten auth)
  if (req.method === "GET" && (internalPath === "/" || internalPath === "/health")) {
    return new Response("OK", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  let bodyText: string | null = null;
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      bodyText = await req.text();
    }
  } catch {
    bodyText = null;
  }

  const auth = req.headers.get("authorization");
  const parts = parseAuthorization(auth);

  let companyId: string | null = null;
  let matched = false;
  let diagnostic: string | null = null;
  let failureReason = "no_auth";

  if (parts && ENC_KEY) {
    failureReason = "no_active_secrets";
    try {
      const { data: secretRows, error: secretsErr } = await supabase.rpc(
        "get_active_fh2_feed_secrets",
        { p_enc_key: ENC_KEY },
      );
      if (secretsErr) throw secretsErr;
      const rows = (secretRows ?? []) as Array<{ company_id: string; secret: string }>;

      let triedCandidates: { name: string; sig: string; stringToSign: string }[] = [];
      let canonical = "";
      for (const row of rows) {
        const { candidates } = await buildSignatures(
          row.secret, req.method, rawPath, url, req, parts, bodyText,
        );
        const hit = candidates.find((c) =>
          constantTimeEqual(c.sig.toLowerCase(), parts.signature.toLowerCase())
        );
        if (hit) {
          companyId = row.company_id;
          matched = true;
          failureReason = "ok";
          break;
        }
        // Behold siste forsøk for diagnostikk
        triedCandidates = candidates.map((c) => ({
          name: c.name, sig: c.sig, stringToSign: c.stringToSign,
        }));
        canonical = candidates[0]?.canonical ?? "";
      }

      if (!matched) {
        if (rows.length === 0) {
          failureReason = "no_active_secrets";
          diagnostic = JSON.stringify({
            reason: "no_active_secrets",
            hint: "Ingen aktive feed-nøkler lagret. Gå til Admin → Mitt selskap → FlightHub 2 Airspace Data og trykk Generér.",
            received_credential_prefix: parts.keyId.slice(0, 6),
            received_credential_length: parts.keyId.length,
          }).slice(0, 1900);
        } else {
          failureReason = "signature_mismatch";
          diagnostic = JSON.stringify({
            reason: "signature_mismatch",
            tried_secrets_count: rows.length,
            received_signature: parts.signature,
            received_credential_prefix: parts.keyId.slice(0, 6),
            received_credential_length: parts.keyId.length,
            tried_variants: triedCandidates,
            canonicalRequest: canonical,
          }).slice(0, 1900);
        }
      }
    } catch (e) {
      console.error("verify error", e);
      failureReason = "verify_exception";
      diagnostic = JSON.stringify({ reason: "verify_exception", error: String(e) }).slice(0, 1900);
    }
  } else if (!parts) {
    failureReason = "auth_parse_failed";
    diagnostic = JSON.stringify({
      reason: "auth_parse_failed",
      received_auth_header: auth ? auth.slice(0, 80) : null,
    }).slice(0, 1900);
  } else if (!ENC_KEY) {
    failureReason = "missing_enc_key";
    diagnostic = JSON.stringify({ reason: "missing_enc_key" });
  }

  const status = matched ? 200 : 401;

  try {
    await supabase.from("fh2_airspace_feed_log").insert({
      company_id: companyId,
      method: req.method,
      path: internalPath,
      query: url.search || null,
      headers: headersToObject(req, true),
      body_preview: diagnostic ?? (bodyText ? bodyText.slice(0, 2000) : `reason=${failureReason}`),
      remote_ip: req.headers.get("x-forwarded-for"),
      status_returned: status,
      matched_key: matched,
    });
  } catch (e) {
    console.error("feed log insert error", e);
  }

  if (!matched) {
    return new Response(
      JSON.stringify({ code: 401, message: `invalid_signature:${failureReason}` }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    await supabase.rpc("touch_fh2_feed_request", { p_company_id: companyId });
  } catch {
    /* noop */
  }

  // DJI forventer { code:0, message:"success", data:[] }
  return new Response(
    JSON.stringify({ code: 0, message: "success", data: [] }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
