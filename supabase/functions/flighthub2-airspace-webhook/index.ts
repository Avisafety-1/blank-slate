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

  const url = new URL(req.url);
  console.log("[FH2-webhook] request", { method: req.method, path: url.pathname, search: url.search });

  // DJI FlightHub 2 Airspace verification probe + traffic queries.
  // DJI calls GET <webhook>/v1/uav?lat=..&lng=..&radius=.. to verify the API.
  // Respond with 200 + empty JSON array so verification passes.
  if (req.method === "GET") {
    if (url.pathname.endsWith("/v1/uav")) {
      const lat = url.searchParams.get("lat");
      const lng = url.searchParams.get("lng");
      const radius = url.searchParams.get("radius") ?? url.searchParams.get("rad");
      console.log("[FH2-webhook] DJI verify GET /v1/uav", { lat, lng, radius });
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, service: "flighthub2-airspace-webhook" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return fail("400", "method_not_allowed", 405);
  }

  try {
    const signature = req.headers.get("signature") ?? "";
    const timestamp = req.headers.get("timestamp") ?? "";
    const nonce = req.headers.get("nonce") ?? "";
    const allHeaderKeys = Array.from(req.headers.keys());
    console.log("[FH2-webhook] incoming", {
      method: req.method,
      headers: allHeaderKeys,
      hasSignature: !!signature,
      sigLen: signature.length,
      sigPrefix: signature.slice(0, 6),
      timestamp,
      nonceLen: nonce.length,
    });

    const rawBody = new Uint8Array(await req.arrayBuffer());
    const rawText = new TextDecoder().decode(rawBody);
    console.log("[FH2-webhook] body", { len: rawBody.length, preview: rawText.slice(0, 300) });

    if (!signature || !timestamp || !nonce) {
      return fail("400", "missing_signature_headers");
    }

    // Anti-replay: reject if timestamp is more than 5 minutes off (skip if body is empty -> treat as DJI verify ping)
    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) return fail("400", "invalid_timestamp");
    const skew = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
    if (skew > 300) {
      console.warn("[FH2-webhook] timestamp_skew_too_large", { skew });
      return fail("400", "timestamp_skew_too_large");
    }

    let body: RequestBody;
    try {
      body = JSON.parse(rawText);
    } catch {
      console.warn("[FH2-webhook] invalid_json");
      return fail("400", "invalid_json");
    }
    if (!body?.flight_hub_organization_id) {
      console.warn("[FH2-webhook] missing flight_hub_organization_id", { keys: Object.keys(body ?? {}) });
      return fail("400", "missing_required_fields");
    }
    if (!Array.isArray(body.paths)) {
      // DJI verify-call may send empty paths or no paths at all — accept it once HMAC is valid
      body.paths = [];
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
    if (!row || !row.token) {
      console.warn("[FH2-webhook] unknown_organization", { org: body.flight_hub_organization_id });
      return fail("400", "unknown_organization");
    }
    if (!row.enabled) {
      console.warn("[FH2-webhook] webhook_disabled", { org: body.flight_hub_organization_id });
      return fail("400", "webhook_disabled");
    }

    // Verify HMAC
    const tokenStr = (row.token as string) ?? "";
    const expected = await hmacSha256Hex(tokenStr, [
      ENC.encode(timestamp),
      ENC.encode(nonce),
      rawBody,
    ]);
    const sigLower = signature.toLowerCase();
    if (!constantTimeEqual(expected, sigLower)) {
      console.warn("[FH2-webhook] invalid_signature", {
        org: body.flight_hub_organization_id,
        tokenLen: tokenStr.length,
        tokenPrefix: tokenStr.slice(0, 4),
        tokenSuffix: tokenStr.slice(-4),
        expectedPrefix: expected.slice(0, 8),
        gotPrefix: sigLower.slice(0, 8),
        bodyLen: rawBody.length,
      });
      return fail("400", "invalid_signature");
    }
    console.log("[FH2-webhook] signature OK", { org: body.flight_hub_organization_id, paths: body.paths.length });

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

    // ---- Mirror latest position per SN into drone_telemetry + (optionally) SafeSky ----
    try {
      const latestBySn = new Map<string, typeof rows[number]>();
      for (const r of rows) {
        const sn = r.sn as string;
        const prev = latestBySn.get(sn);
        if (!prev || (r.time_stamp as string) > (prev.time_stamp as string)) {
          latestBySn.set(sn, r);
        }
      }

      const sns = Array.from(latestBySn.keys());
      const droneIdBySn = new Map<string, string>();
      if (sns.length > 0) {
        const { data: drones } = await supabase
          .from("drones")
          .select("id, serienummer")
          .eq("company_id", companyId)
          .in("serienummer", sns);
        (drones || []).forEach((d: { id: string; serienummer: string }) => {
          droneIdBySn.set(d.serienummer, d.id);
        });
      }

      const telemetryRows = Array.from(latestBySn.values()).map((r) => ({
        drone_id: droneIdBySn.get(r.sn as string) ?? null,
        lat: r.lat as number,
        lon: r.lng as number,
        alt: (r.altitude_m as number | null) ?? (r.height_m as number | null),
        raw: { source: "flighthub2", sn: r.sn, order_id: r.order_id, time_stamp: r.time_stamp },
      }));
      if (telemetryRows.length > 0) {
        const { error: telErr } = await supabase
          .from("drone_telemetry")
          .insert(telemetryRows);
        if (telErr) console.error("drone_telemetry insert error", telErr);
      }

      const safeskyKey = Deno.env.get("SAFESKY_API_KEY");
      if (row.safesky_forward && safeskyKey) {
        for (const r of latestBySn.values()) {
          const fs = String(r.flight_status ?? "").toLowerCase();
          const isAirborne = fs === "inflight" || fs === "takeoff" || fs === "flying" ||
            (typeof r.ground_speed_ms === "number" && (r.ground_speed_ms as number) > 1);
          const status = isAirborne ? "AIRBORNE" : "GROUNDED";
          const beaconId = `AVS_FH2_${(r.sn as string).slice(-8)}`;
          const payload = [{
            id: beaconId,
            latitude: r.lat,
            longitude: r.lng,
            altitude: Math.round((r.altitude_m as number | null) ?? (r.height_m as number | null) ?? 50),
            status,
            last_update: Math.floor(new Date(r.time_stamp as string).getTime() / 1000),
            ground_speed: Math.round((r.ground_speed_ms as number | null) ?? 0),
            course: Math.round((r.course_deg as number | null) ?? 0),
          }];
          try {
            const sbody = JSON.stringify(payload);
            const authHeaders = await generateAuthHeaders(safeskyKey, "POST", SAFESKY_UAV_URL, sbody);
            const resp = await fetch(SAFESKY_UAV_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: sbody,
            });
            if (!resp.ok) {
              console.warn("SafeSky forward non-OK", resp.status, await resp.text());
            }
          } catch (e) {
            console.warn("SafeSky forward failed", e);
          }
        }
      }
    } catch (mirrorErr) {
      console.error("Mirror/forward error (non-fatal)", mirrorErr);
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
