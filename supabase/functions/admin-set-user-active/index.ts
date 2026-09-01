import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  user_id?: string;
  active?: boolean;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return json({ error: "Server misconfigured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ---- Authenticate requester ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requester }, error: requesterErr } = await admin.auth.getUser(token);
    if (requesterErr || !requester) {
      console.error("auth.getUser failed", requesterErr);
      return json({ error: "Unauthorized" }, 401);
    }

    // ---- Parse + validate body ----
    const body = (await req.json().catch(() => ({}))) as Body;
    const targetUserId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    const active = body.active;

    if (!targetUserId || typeof active !== "boolean") {
      return json({ error: "Missing or invalid user_id / active" }, 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
      return json({ error: "Invalid user_id" }, 400);
    }
    if (targetUserId === requester.id && active === false) {
      return json({ error: "Du kan ikke deaktivere din egen bruker" }, 400);
    }

    // ---- Authorization: admin or superadmin ----
    const { data: requesterRoleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", requester.id);

    if (roleErr) {
      console.error("Failed reading requester roles", roleErr);
      return json({ error: "Forbidden" }, 403);
    }

    const requesterRoles = new Set((requesterRoleRows ?? []).map((r: any) => r.role));
    const isSuperadmin = requesterRoles.has("superadmin");
    const isAdmin = requesterRoles.has("administrator") || requesterRoles.has("admin");

    if (!isSuperadmin && !isAdmin) {
      return json({ error: "Forbidden", detail: "Requester lacks admin role" }, 403);
    }

    // ---- Non-superadmin restrictions ----
    if (!isSuperadmin) {
      const { data: targetRoleRows } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId);

      if ((targetRoleRows ?? []).some((r: any) => r.role === "superadmin")) {
        return json({ error: "Forbidden", detail: "Cannot modify superadmin" }, 403);
      }

      const { data: targetProfile } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", targetUserId)
        .maybeSingle();

      if (!targetProfile?.company_id) {
        return json({ error: "Forbidden", detail: "Target has no company" }, 403);
      }

      const { data: visibleRows, error: visErr } = await admin.rpc(
        "get_user_visible_company_ids",
        { _user_id: requester.id },
      );
      if (visErr) {
        console.error("get_user_visible_company_ids failed", visErr);
        return json({ error: "Forbidden", detail: "Visibility lookup failed" }, 403);
      }
      const visible = (visibleRows ?? []).map((row: any) =>
        typeof row === "string" ? row : row.company_id ?? row.id ?? row,
      );
      if (!visible.includes(targetProfile.company_id)) {
        return json({ error: "Forbidden", detail: "Target user is outside requester's company hierarchy" }, 403);
      }
    }

    console.log("admin-set-user-active", { targetUserId, active, requestedBy: requester.id });

    // ---- Apply auth ban / unban (the real login block) ----
    const { error: authErr } = await admin.auth.admin.updateUserById(targetUserId, {
      ban_duration: active ? "none" : "876000h",
    } as any);

    if (authErr) {
      console.error("updateUserById failed", authErr);
      return json({ error: "Kunne ikke oppdatere innloggingstilgang", detail: authErr.message }, 500);
    }

    // ---- Terminate active sessions when deactivating ----
    if (!active) {
      const { error: signOutErr } = await admin.auth.admin.signOut(targetUserId, "global" as any);
      if (signOutErr) {
        console.error("admin.signOut failed (non-fatal)", signOutErr.message);
      }
    }

    // ---- Mirror state on the profile ----
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        is_active: active,
        deactivated_at: active ? null : new Date().toISOString(),
        deactivated_by: active ? null : requester.id,
      })
      .eq("id", targetUserId);

    if (profileErr) {
      console.error("profile update failed", profileErr);
      return json({ error: "Innloggingstilgang oppdatert, men profilen ble ikke oppdatert", detail: profileErr.message }, 500);
    }

    return json({ success: true, user_id: targetUserId, active });
  } catch (e: any) {
    console.error("admin-set-user-active unexpected error", e?.message ?? e);
    return json({ error: "Unexpected error", detail: String(e?.message ?? e) }, 500);
  }
});
