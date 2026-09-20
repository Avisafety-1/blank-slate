// Henter eller fornyer en drones strømnøkkel og returnerer den ferdige
// RTMP(S)-adressen som limes inn i DJI Pilot 2 eller FlightHub 2.
//
// Nøkkelen vises i klartekst kun her; i databasen lagres bare SHA-256-hashen.
// action "get":      returnerer adressen hvis nøkkelen finnes, ellers lager den en
// action "rotate":   lager ny nøkkel (gammel slutter å virke umiddelbart)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateStreamKey, sha256Hex, streamPathFor } from "../_shared/liveVideo.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const ADMIN_ROLES = ["administrator", "admin", "superadmin"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: roleRows } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roleRows ?? []).some((r: { role: string }) =>
    ADMIN_ROLES.includes(r.role)
  );
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { action?: string; drone_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = body.action ?? "get";
  const droneId = body.drone_id;
  if (!droneId) return json({ error: "missing_drone_id" }, 400);
  if (action !== "get" && action !== "rotate") {
    return json({ error: "invalid_action" }, 400);
  }

  const { data: canView } = await service.rpc("can_view_drone_video", {
    _user_id: userId,
    _drone_id: droneId,
  });
  if (!canView) return json({ error: "forbidden" }, 403);

  const { data: drone } = await service
    .from("drones")
    .select("id, company_id, serienummer")
    .eq("id", droneId)
    .maybeSingle();
  if (!drone) return json({ error: "drone_not_found" }, 404);

  const { data: existing } = await service
    .from("drone_stream_keys")
    .select("id, key_prefix, enabled, updated_at")
    .eq("drone_id", droneId)
    .maybeSingle();

  let plainKey: string | null = null;

  if (action === "rotate" || !existing) {
    plainKey = generateStreamKey();
    const payload = {
      drone_id: droneId,
      company_id: drone.company_id,
      key_hash: await sha256Hex(plainKey),
      key_prefix: plainKey.slice(0, 6),
      enabled: true,
    };
    const { error: saveErr } = await service
      .from("drone_stream_keys")
      .upsert(payload, { onConflict: "drone_id" });
    if (saveErr) return json({ error: saveErr.message }, 500);

    // Gammel strøm gjelder ikke lenger
    await service
      .from("drone_live_streams")
      .update({ active: false })
      .eq("drone_id", droneId);
  }

  const scheme = Deno.env.get("LIVE_VIDEO_RTMP_SCHEME") ?? "rtmps";
  const host = (Deno.env.get("LIVE_VIDEO_RTMP_HOST") ?? "video-server-app.fly.dev")
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
  const port = Deno.env.get("LIVE_VIDEO_RTMP_PORT") ?? "1936";

  if (!plainKey) {
    // Nøkkelen finnes, men kan ikke vises igjen – klienten må rotere.
    return json({
      has_key: true,
      key_visible: false,
      key_prefix: existing?.key_prefix ?? null,
      updated_at: existing?.updated_at ?? null,
      enabled: existing?.enabled ?? true,
      rtmp_scheme: scheme,
      rtmp_host: host,
      rtmp_port: port,
    });
  }

  const path = streamPathFor(plainKey);
  return json({
    has_key: true,
    key_visible: true,
    key_prefix: plainKey.slice(0, 6),
    enabled: true,
    stream_path: path,
    rtmp_scheme: scheme,
    rtmp_host: host,
    rtmp_port: port,
    rtmp_url: `${scheme}://${host}:${port}/${path}`,
    rtmp_url_plain: `rtmp://${host}:1935/${path}`,
  });
});
