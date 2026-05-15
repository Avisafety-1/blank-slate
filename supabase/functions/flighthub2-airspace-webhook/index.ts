// FlightHub 2 Airspace Management webhook receiver
// Spec: https://fh.dji.com/user-manual/en/organization-management/airspace-management.html
//
// Verifies HMAC-SHA256(token, timestamp || nonce || rawBody) and stores received
// flight path points in public.flighthub2_positions.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateAuthHeaders } from "../_shared/safesky-hmac.ts";

const SAFESKY_UAV_URL = "https://sandbox-public-api.safesky.app/v1/uav";

const ENC = new TextEncoder();

interface FlightPath {
  order_id: string;
  sn: string;
  flight_status: string;
  manufacturer_id?: string;
  uas_id?: string;
  time_stamp: string; // UTC+8 yyyyMMddHHmmss
  uas_model?: string;
  coordinate?: number;
  longitude: number; // /1e7
  latitude: number; // /1e7
  height_type?: number;
  height: number; // /10
  altitude: number; // /10
  vs?: number; // /10
  gs?: number; // /10
  course?: number; // /10, -999 = no data
  remote_id_status?: number;
}

interface RequestBody {
  app_id?: string;
  flight_hub_organization_id: string;
  paths: FlightPath[];
}

function fail(code: string, result: string, status = 200) {
  return new Response(JSON.stringify({ code, result }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok() {
  return new Response(JSON.stringify({ code: "0", result: "success" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// UTC+8 yyyyMMddHHmmss → Date (UTC)
function parseUtc8(ts: string): Date | null {
  if (!/^\d{14}$/.test(ts)) return null;
  const y = +ts.slice(0, 4);
  const mo = +ts.slice(4, 6);
  const d = +ts.slice(6, 8);
  const h = +ts.slice(8, 10);
  const mi = +ts.slice(10, 12);
  const s = +ts.slice(12, 14);
  // The wall clock is UTC+8 → subtract 8h to get UTC.
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, s) - 8 * 3600 * 1000;
  const dt = new Date(utcMs);
  return isNaN(dt.getTime()) ? null : dt;
}

async function hmacSha256Hex(
  key: string,
  parts: Uint8Array[],
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    ENC.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  // Concatenate parts
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, buf);
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return fail("400", "method_not_allowed", 405);
  }

  try {
    const signature = req.headers.get("signature") ?? "";
    const timestamp = req.headers.get("timestamp") ?? "";
    const nonce = req.headers.get("nonce") ?? "";
    if (!signature || !timestamp || !nonce) {
      return fail("400", "missing_signature_headers");
    }

    // Optional anti-replay: reject if timestamp is more than 5 minutes off
    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) return fail("400", "invalid_timestamp");
    const skew = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
    if (skew > 300) return fail("400", "timestamp_skew_too_large");

    const rawBody = new Uint8Array(await req.arrayBuffer());

    let body: RequestBody;
    try {
      body = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return fail("400", "invalid_json");
    }
    if (!body?.flight_hub_organization_id || !Array.isArray(body.paths)) {
      return fail("400", "missing_required_fields");
    }

    const encKey = Deno.env.get("FH2_ENCRYPTION_KEY");
    if (!encKey) {
      console.error("FH2_ENCRYPTION_KEY not configured");
      return fail("400", "server_misconfigured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up token + company
    const { data: cfg, error: cfgErr } = await supabase.rpc(
      "get_fh2_webhook_token_by_org",
      { p_org_id: body.flight_hub_organization_id, p_key: encKey },
    );
    if (cfgErr) {
      console.error("get_fh2_webhook_token_by_org error", cfgErr);
      return fail("400", "lookup_failed");
    }
    const row = Array.isArray(cfg) ? cfg[0] : cfg;
    if (!row || !row.token) return fail("400", "unknown_organization");
    if (!row.enabled) return fail("400", "webhook_disabled");

    // Verify HMAC
    const expected = await hmacSha256Hex(row.token as string, [
      ENC.encode(timestamp),
      ENC.encode(nonce),
      rawBody,
    ]);
    if (!constantTimeEqual(expected, signature.toLowerCase())) {
      console.warn("Invalid signature for org", body.flight_hub_organization_id);
      return fail("400", "invalid_signature");
    }

    // Decode + insert positions
    const companyId = row.company_id as string;
    const rows: Array<Record<string, unknown>> = [];
    for (const p of body.paths) {
      if (
        !p?.order_id || !p?.sn || !p?.flight_status ||
        typeof p.latitude !== "number" || typeof p.longitude !== "number"
      ) continue;
      const ts = parseUtc8(p.time_stamp);
      if (!ts) continue;
      const course = typeof p.course === "number" && p.course !== -999
        ? p.course / 10
        : null;
      rows.push({
        company_id: companyId,
        order_id: p.order_id,
        sn: p.sn,
        manufacturer_id: p.manufacturer_id ?? null,
        uas_id: p.uas_id ?? null,
        uas_model: p.uas_model ?? null,
        flight_status: p.flight_status,
        time_stamp: ts.toISOString(),
        lat: p.latitude / 1e7,
        lng: p.longitude / 1e7,
        height_m: typeof p.height === "number" ? p.height / 10 : null,
        height_type: typeof p.height_type === "number" ? p.height_type : null,
        altitude_m: typeof p.altitude === "number" ? p.altitude / 10 : null,
        vert_speed_ms: typeof p.vs === "number" ? p.vs / 10 : null,
        ground_speed_ms: typeof p.gs === "number" ? p.gs / 10 : null,
        course_deg: course,
        remote_id_status: typeof p.remote_id_status === "number"
          ? p.remote_id_status
          : null,
        coordinate_system: typeof p.coordinate === "number"
          ? p.coordinate
          : null,
        raw: p,
      });
    }

    if (rows.length === 0) return ok();

    const { error: insErr } = await supabase
      .from("flighthub2_positions")
      .insert(rows);
    if (insErr) {
      console.error("Insert error", insErr);
      return fail("400", "persist_failed");
    }

    await supabase.rpc("touch_fh2_webhook_received", {
      p_company_id: companyId,
    });

    return ok();
  } catch (e) {
    console.error("Unhandled error", e);
    return fail("400", "internal_error");
  }
});
