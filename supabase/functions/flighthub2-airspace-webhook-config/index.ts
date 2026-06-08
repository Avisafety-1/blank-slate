// Companion to flighthub2-airspace-webhook: lets admins save the encrypted
// webhook token (the actual token never touches the client storage in
// plaintext after creation).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface SaveBody {
  action: "save";
  token: string;
  enabled?: boolean;
  safesky_forward?: boolean;
}

function decodeJwtOrgUuid(jwt: string): string {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return "";
    const payload = JSON.parse(atob(parts[1]));
    return (payload?.organization_uuid as string) || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth
    .getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.claims.sub;

  let body: SaveBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (
    body?.action !== "save" ||
    !body.token ||
    body.token.length < 32 ||
    body.token.length > 64
  ) {
    return new Response(JSON.stringify({ error: "invalid_input" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const encKey = Deno.env.get("FH2_ENCRYPTION_KEY");
  if (!encKey) {
    return new Response(
      JSON.stringify({ error: "FH2_ENCRYPTION_KEY not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Look up caller's company + admin role
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: profile } = await service
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.company_id) {
    return new Response(JSON.stringify({ error: "no_company" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: rolesData } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (rolesData ?? []).map((r: { role: string }) => r.role);
  const ADMIN_ROLES = ["administrator", "admin", "superadmin"];
  if (!roles.some((r) => ADMIN_ROLES.includes(r))) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auto-derive organization_uuid from the company's saved FH2 OAuth token.
  // Falls back to parent company if the company inherits FH2 credentials.
  const { data: company } = await service
    .from("companies")
    .select("parent_company_id, propagate_fh2_credentials")
    .eq("id", profile.company_id)
    .maybeSingle();

  const fetchFh2Jwt = async (cid: string): Promise<string> => {
    const { data } = await service.rpc("get_fh2_token", {
      p_company_id: cid,
      p_key: encKey,
    });
    return ((data as string) || "").trim().replace(/^bearer\s+/i, "");
  };

  let fh2Jwt = await fetchFh2Jwt(profile.company_id);
  if (!fh2Jwt && company?.parent_company_id) {
    fh2Jwt = await fetchFh2Jwt(company.parent_company_id);
  }
  if (!fh2Jwt) {
    return new Response(
      JSON.stringify({
        error:
          "FlightHub 2 er ikke koblet til. Koble til FH2 i selskapsinnstillinger først.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const orgUuid = decodeJwtOrgUuid(fh2Jwt);
  if (!orgUuid) {
    return new Response(
      JSON.stringify({
        error:
          "Kunne ikke lese organization_uuid fra FH2-token. Koble til FlightHub 2 på nytt.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { error: saveErr } = await service.rpc("save_fh2_webhook_token", {
    p_company_id: profile.company_id,
    p_org_id: orgUuid,
    p_token: body.token,
    p_key: encKey,
  });
  if (saveErr) {
    console.error("save_fh2_webhook_token error", saveErr);
    return new Response(JSON.stringify({ error: saveErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (typeof body.safesky_forward === "boolean") {
    updates.safesky_forward = body.safesky_forward;
  }
  if (Object.keys(updates).length > 0) {
    await service
      .from("flighthub2_webhook_config")
      .update(updates)
      .eq("company_id", profile.company_id);
  }

  return new Response(
    JSON.stringify({ ok: true, flight_hub_organization_id: orgUuid }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

