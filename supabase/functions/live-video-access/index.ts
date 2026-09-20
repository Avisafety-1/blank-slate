// Gir en innlogget bruker en kortlevd WHEP-URL for en drones videostrøm.
//
// action "watch":  { drone_id } -> { whep_url, stream_path, expires_at }
// action "ended":  { stream_path } -> markerer strømmen som avsluttet når
//                  spilleren ikke finner den lenger.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { signPlaybackToken } from "../_shared/liveVideo.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const TOKEN_TTL_SECONDS = 60;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("LIVE_VIDEO_TOKEN_SECRET");
  const baseUrl = Deno.env.get("LIVE_VIDEO_BASE_URL");
  if (!secret || !baseUrl) return json({ error: "not_configured" }, 500);

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

  let body: { action?: string; drone_id?: string; stream_path?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = body.action ?? "watch";

  if (action === "ended") {
    const path = body.stream_path;
    if (!path) return json({ error: "missing_stream_path" }, 400);
    const { data: stream } = await service
      .from("drone_live_streams")
      .select("drone_id")
      .eq("stream_path", path)
      .maybeSingle();
    if (!stream) return json({ ok: true });
    const { data: canView } = await service.rpc("can_view_drone_video", {
      _user_id: userId,
      _drone_id: stream.drone_id,
    });
    if (!canView) return json({ error: "forbidden" }, 403);
    await service
      .from("drone_live_streams")
      .update({ active: false })
      .eq("stream_path", path);
    return json({ ok: true });
  }

  if (action !== "watch") return json({ error: "invalid_action" }, 400);

  const droneId = body.drone_id;
  if (!droneId) return json({ error: "missing_drone_id" }, 400);

  const { data: canView, error: accessErr } = await service.rpc(
    "can_view_drone_video",
    { _user_id: userId, _drone_id: droneId },
  );
  if (accessErr) return json({ error: accessErr.message }, 500);
  if (!canView) return json({ error: "forbidden" }, 403);

  const { data: stream } = await service
    .from("drone_live_streams")
    .select("stream_path, label, active, started_at, last_seen_at")
    .eq("drone_id", droneId)
    .eq("active", true)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Ingen aktiv strøm er en normal tilstand, ikke en feil – svar 200 slik at
  // klienten bare viser "ingen videostrøm" i stedet for å kaste en runtime-feil.
  if (!stream) return json({ status: "no_stream" }, 200);

  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = await signPlaybackToken(stream.stream_path, expiresAt, secret);
  const base = baseUrl.replace(/\/+$/, "");

  return json({
    stream_path: stream.stream_path,
    label: stream.label,
    started_at: stream.started_at,
    expires_at: expiresAt,
    whep_url: `${base}/${stream.stream_path}/whep?token=${encodeURIComponent(token)}`,
  });
});
