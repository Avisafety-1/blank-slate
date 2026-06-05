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

function bytesToHex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

function tryBase64Decode(s: string): Uint8Array | null {
  try {
    let t = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = t.length % 4;
    if (pad) t += "=".repeat(4 - pad);
    if (!/^[A-Za-z0-9+/]+=*$/.test(t)) return null;
    const bin = atob(t);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function tryHexDecode(s: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2 !== 0) return null;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

async function hmacSha256(keyBytes: Uint8Array, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
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

interface Candidate {
  variant: string;
  secretForm: "raw" | "base64" | "hex";
  encoding: "hex" | "base64" | "base64nopad";
  sig: string;
  stringToSign: string;
}

async function buildAllCandidates(
  secretStr: string,
  method: string,
  path: string,
  url: URL,
  req: Request,
  parts: SsHmacParts,
  bodyText: string | null,
): Promise<{ candidates: Candidate[]; canonicalRequest: string }> {
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

  const variants: { name: string; s: string }[] = [
    { name: "alg|date|nonce|crHash", s: `${alg}\n${xSsDate}\n${xSsNonce}\n${crHash}` },
    { name: "alg|date|crHash", s: `${alg}\n${xSsDate}\n${crHash}` },
    { name: "alg|date|nonce|cr", s: `${alg}\n${xSsDate}\n${xSsNonce}\n${canonicalRequest}` },
    { name: "date|nonce|crHash", s: `${xSsDate}\n${xSsNonce}\n${crHash}` },
    { name: "alg|credential|date|nonce|crHash", s: `${alg}\n${parts.credential}\n${xSsDate}\n${xSsNonce}\n${crHash}` },
  ];

  const secretForms: { form: "raw" | "base64" | "hex"; bytes: Uint8Array | null }[] = [
    { form: "raw", bytes: new TextEncoder().encode(secretStr) },
    { form: "base64", bytes: tryBase64Decode(secretStr) },
    { form: "hex", bytes: tryHexDecode(secretStr) },
  ];

  const candidates: Candidate[] = [];
  for (const sf of secretForms) {
    if (!sf.bytes) continue;
    for (const v of variants) {
      const macBytes = await hmacSha256(sf.bytes, v.s);
      const hex = bytesToHex(macBytes);
      const b64 = bytesToBase64(macBytes);
      const b64nopad = b64.replace(/=+$/, "");
      candidates.push({ variant: v.name, secretForm: sf.form, encoding: "hex", sig: hex, stringToSign: v.s });
      candidates.push({ variant: v.name, secretForm: sf.form, encoding: "base64", sig: b64, stringToSign: v.s });
      candidates.push({ variant: v.name, secretForm: sf.form, encoding: "base64nopad", sig: b64nopad, stringToSign: v.s });
    }
  }
  return { candidates, canonicalRequest };
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

      let triedSummary: { variant: string; secretForm: string; encoding: string; sig: string }[] = [];
      let lastStringToSign = "";
      let canonical = "";
      let matchedInfo: { variant: string; secretForm: string; encoding: string } | null = null;

      for (const row of rows) {
        const { candidates, canonicalRequest } = await buildAllCandidates(
          row.secret, req.method, rawPath, url, req, parts, bodyText,
        );
        canonical = canonicalRequest;
        // base64 er case-sensitiv; hex tåler case-insensitiv sammenligning
        const recv = parts.signature;
        const recvLower = recv.toLowerCase();
        const hit = candidates.find((c) => {
          if (c.encoding === "hex") return constantTimeEqual(c.sig.toLowerCase(), recvLower);
          return constantTimeEqual(c.sig, recv);
        });
        if (hit) {
          companyId = row.company_id;
          matched = true;
          failureReason = "ok";
          matchedInfo = { variant: hit.variant, secretForm: hit.secretForm, encoding: hit.encoding };
          diagnostic = JSON.stringify({
            reason: "ok",
            matched: matchedInfo,
            secret_prefix: row.secret.slice(0, 4),
            secret_length: row.secret.length,
          }).slice(0, 1900);
          break;
        }
        // Behold kompakt diagnostikk fra siste forsøk
        triedSummary = candidates.map((c) => ({
          variant: c.variant,
          secretForm: c.secretForm,
          encoding: c.encoding,
          sig: c.sig.slice(0, 24),
        }));
        lastStringToSign = candidates[0]?.stringToSign ?? "";
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
            tried_candidates_count: triedSummary.length,
            received_signature: parts.signature,
            received_signature_length: parts.signature.length,
            received_credential_prefix: parts.keyId.slice(0, 6),
            received_credential_length: parts.keyId.length,
            sample_string_to_sign: lastStringToSign.slice(0, 300),
            canonicalRequest: canonical.slice(0, 500),
            tried: triedSummary,
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
