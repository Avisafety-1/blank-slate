// MediaMTX-hendelser for AviSafe live video.
//
// MediaMTX kaller denne via runOnPublish / runOnUnpublish slik at
// drone_live_streams markeres inaktiv med én gang strømmen stopper.
// Kallet autentiseres med en delt hemmelighet i header "x-event-secret".
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("LIVE_VIDEO_EVENT_SECRET") ??
    Deno.env.get("LIVE_VIDEO_TOKEN_SECRET");
  if (!expected) return json(500, { error: "not_configured" });
  if (req.headers.get("x-event-secret") !== expected) {
    return json(401, { error: "unauthorized" });
  }

  let body: { event?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const path = (body.path ?? "").replace(/^\/+/, "").trim();
  const event = body.event ?? "";
  if (!path) return json(400, { error: "missing_path" });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date().toISOString();
  if (event === "unpublish") {
    const { error } = await service
      .from("drone_live_streams")
      .update({ active: false, last_seen_at: now })
      .eq("stream_path", path);
    if (error) {
      console.error("kunne ikke avslutte strøm", error.message);
      return json(500, { error: "update_failed" });
    }
  } else {
    const { error } = await service
      .from("drone_live_streams")
      .update({ active: true, last_seen_at: now })
      .eq("stream_path", path);
    if (error) {
      console.error("kunne ikke oppdatere strøm", error.message);
      return json(500, { error: "update_failed" });
    }
  }

  console.log("mediamtx-hendelse", { event, path });
  return json(200, { ok: true });
});
