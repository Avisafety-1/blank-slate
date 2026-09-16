// Self-service MQTT credentials for "Live posisjonsdata fra FH2".
// A company admin can read and regenerate the MQTT username/password that is
// pasted into DJI FlightHub 2's "Configure Telemetry Data" / Sync page.
//
// One credential set per company group: the credential is always stored on the
// group's root company (parent_company_id when present), so parent + departments
// that share a single FH2 organisation share a single credential pair.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const ADMIN_ROLES = ["administrator", "admin", "superadmin"];

function randomString(length: number, alphabet: string): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const encKey = Deno.env.get("FH2_ENCRYPTION_KEY");
  if (!encKey) return json({ error: "FH2_ENCRYPTION_KEY not configured" }, 500);

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

  const { data: profile } = await service
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.company_id) return json({ error: "no_company" }, 403);

  const { data: roleRows } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  if (!roles.some((r) => ADMIN_ROLES.includes(r))) {
    return json({ error: "forbidden" }, 403);
  }

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const action = body.action ?? "get";
  if (action !== "get" && action !== "regenerate") {
    return json({ error: "invalid_action" }, 400);
  }

  const read = async () => {
    const { data, error } = await service.rpc("get_company_mqtt_credentials", {
      p_company_id: profile.company_id,
      p_key: encKey,
    });
    if (error) throw new Error(error.message);
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  };

  try {
    let current = await read();

    if (action === "regenerate" || !current) {
      const { data: ownerId, error: ownerErr } = await service.rpc(
        "get_mqtt_credential_owner",
        { p_company_id: profile.company_id },
      );
      if (ownerErr) throw new Error(ownerErr.message);

      const username = current?.username ??
        `avisafe-${String(ownerId).replace(/-/g, "").slice(0, 10)}`;
      const password = randomString(28, PASSWORD_ALPHABET);

      const { error: saveErr } = await service.rpc(
        "save_company_mqtt_credentials",
        {
          p_company_id: profile.company_id,
          p_username: username,
          p_password: password,
          p_key: encKey,
        },
      );
      if (saveErr) throw new Error(saveErr.message);
      current = await read();
    }

    if (!current) return json({ error: "not_found" }, 404);

    return json({
      username: current.username,
      password: current.password,
      enabled: current.enabled,
      created_at: current.created_at,
      updated_at: current.updated_at,
      owner_company_id: current.owner_company_id,
      owner_company_name: current.owner_company_name,
      shared_company_names: current.shared_company_names ?? [],
      mqtt_host: Deno.env.get("MQTT_HOST") ?? null,
    });
  } catch (e) {
    console.error("mqtt-credentials error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
