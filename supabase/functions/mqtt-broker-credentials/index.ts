// Server-to-server endpoint for the external Fly.io mosquitto broker.
// Returns every active MQTT credential set together with the serial numbers
// that set is allowed to publish on (own drones + drones the group's personnel
// are authorised to fly through the cross-company drone_personnel link).
//
// Auth: shared secret in the x-broker-secret header (MQTT_BROKER_API_SECRET).
// No user session is involved.
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const expected = Deno.env.get("MQTT_BROKER_API_SECRET");
  if (!expected) return json({ error: "not_configured" }, 500);
  const provided = req.headers.get("x-broker-secret") ?? "";
  if (!provided || !timingSafeEqual(provided, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  const encKey = Deno.env.get("FH2_ENCRYPTION_KEY");
  if (!encKey) return json({ error: "FH2_ENCRYPTION_KEY not configured" }, 500);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await service.rpc("get_all_mqtt_broker_credentials", {
    p_key: encKey,
  });
  if (error) {
    console.error("get_all_mqtt_broker_credentials failed", error);
    return json({ error: error.message }, 500);
  }

  const credentials = (data ?? []).map((row: Record<string, unknown>) => ({
    username: row.username,
    password: row.password,
    owner_company_id: row.owner_company_id,
    company_ids: row.company_ids ?? [],
    serial_numbers: row.serial_numbers ?? [],
  }));

  return json({ generated_at: new Date().toISOString(), credentials });
});
