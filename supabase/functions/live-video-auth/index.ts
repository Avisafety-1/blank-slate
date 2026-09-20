// MediaMTX HTTP-authhook for AviSafe live video.
//
// MediaMTX kaller denne ved HVER publisering og avspilling.
// 2xx = tillatt, alt annet = avvist.
//
// Publisering: stien er "live/<strømnøkkel>[-etikett]". Nøkkelen slås opp
// hashet i drone_stream_keys, og strømmen registreres i drone_live_streams.
// Avspilling: query må inneholde et gyldig, kortlevd token fra
// live-video-access.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseStreamPath, sha256Hex, verifyPlaybackToken } from "../_shared/liveVideo.ts";

const deny = (reason: string) =>
  new Response(JSON.stringify({ error: reason }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

const allow = () => new Response("", { status: 200 });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return deny("method_not_allowed");

  const secret = Deno.env.get("LIVE_VIDEO_TOKEN_SECRET");
  if (!secret) {
    console.error("LIVE_VIDEO_TOKEN_SECRET mangler");
    return deny("not_configured");
  }

  let body: {
    action?: string;
    path?: string;
    query?: string;
    protocol?: string;
    ip?: string;
  };
  try {
    body = await req.json();
  } catch {
    return deny("invalid_json");
  }

  const action = body.action ?? "";
  const parsed = parseStreamPath(body.path ?? "");
  if (!parsed) return deny("invalid_path");

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- Avspilling ------------------------------------------------------
  if (action === "read") {
    const params = new URLSearchParams(body.query ?? "");
    const token = params.get("token") ?? "";
    if (!token) return deny("missing_token");
    const path = (body.path ?? "").replace(/^\/+/, "");
    if (!(await verifyPlaybackToken(path, token, secret))) {
      return deny("invalid_token");
    }
    await service
      .from("drone_live_streams")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("stream_path", path);
    return allow();
  }

  // --- Publisering -----------------------------------------------------
  if (action !== "publish") return deny("unsupported_action");

  const keyHash = await sha256Hex(parsed.key);
  const { data: keyRow, error } = await service
    .from("drone_stream_keys")
    .select("drone_id, company_id, enabled")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error) {
    console.error("oppslag av strømnøkkel feilet", error.message);
    return deny("lookup_failed");
  }
  if (!keyRow || !keyRow.enabled) {
    console.warn("ukjent eller sperret strømnøkkel", {
      prefix: parsed.key.slice(0, 6),
      ip: body.ip,
      protocol: body.protocol,
    });
    return deny("unknown_key");
  }

  const path = (body.path ?? "").replace(/^\/+/, "");
  const now = new Date().toISOString();
  const { error: upsertErr } = await service
    .from("drone_live_streams")
    .upsert(
      {
        drone_id: keyRow.drone_id,
        company_id: keyRow.company_id,
        stream_path: path,
        label: parsed.label,
        active: true,
        started_at: now,
        last_seen_at: now,
      },
      { onConflict: "stream_path" },
    );
  if (upsertErr) console.error("kunne ikke registrere strøm", upsertErr.message);

  console.log("publisering godkjent", { path, drone_id: keyRow.drone_id });
  return allow();
});
