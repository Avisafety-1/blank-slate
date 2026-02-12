import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  user_id?: string;
  email?: string;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requester },
      error: requesterErr,
    } = await admin.auth.getUser(token);

    if (requesterErr || !requester) {
      console.error("auth.getUser failed", requesterErr);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const userIdFromBody = typeof body.user_id === "string" ? body.user_id.trim() : "";
    const emailFromBody = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!userIdFromBody && !emailFromBody) {
      return new Response(
        JSON.stringify({ error: "Missing user_id or email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    // Authorization: allow superadmin to delete anyone.
    // Allow admin to delete users within their own company (only when user_id is provided).
    const { data: requesterRoleRows, error: requesterRoleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", requester.id);

    if (requesterRoleErr) {
      console.error("Failed reading requester roles", requesterRoleErr);
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
      );
    }

    const requesterRoles = new Set((requesterRoleRows ?? []).map((r) => r.role));
    const isSuperadmin = requesterRoles.has("superadmin");
    const isAdmin = requesterRoles.has("admin");

    if (!isSuperadmin && !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
      );
    }

    // Resolve target user id
    let targetUserId = userIdFromBody;

    if (!targetUserId && emailFromBody) {
      if (!isSuperadmin) {
        return new Response(
          JSON.stringify({ error: "Forbidden - superadmin only" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
        );
      }

      // Try profiles first
      const { data: prof, error: profErr } = await admin
        .from("profiles")
        .select("id")
        .eq("email", emailFromBody)
        .maybeSingle();

      if (profErr) {
        console.error("Failed lookup profile by email", profErr);
      }

      if (prof?.id) {
        targetUserId = prof.id;
      } else {
        // Fallback: search auth users
        const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000, page: 1 });
        if (listErr) {
          console.error("admin.listUsers failed", listErr);
          return new Response(
            JSON.stringify({ error: "Failed to lookup user" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
          );
        }
        const match = (listData?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === emailFromBody);
        if (!match?.id) {
          return new Response(
            JSON.stringify({ error: "User not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
          );
        }
        targetUserId = match.id;
      }
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
      );
    }

    // If requester is only admin (not superadmin), enforce same-company deletion
    if (!isSuperadmin) {
      const { data: requesterProfile, error: requesterProfileErr } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", requester.id)
        .maybeSingle();

      const { data: targetProfile, error: targetProfileErr } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", targetUserId)
        .maybeSingle();

      if (requesterProfileErr || targetProfileErr || !requesterProfile?.company_id || !targetProfile?.company_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
        );
      }

      if (requesterProfile.company_id !== targetProfile.company_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
        );
      }
    }

    console.log("admin-delete-user: deleting", { targetUserId, requestedBy: requester.id, email: emailFromBody || undefined });

    // ---- Delete/nullify data in public schema (best effort) ----

    // 1. Tables referencing profiles that the original code missed
    await admin.from("mission_risk_assessments").delete().eq("pilot_id", targetUserId);
    await admin.from("mission_personnel").delete().eq("profile_id", targetUserId);
    await admin.from("personnel_competencies").delete().eq("profile_id", targetUserId);
    await admin.from("flight_log_personnel").delete().eq("profile_id", targetUserId);
    await admin.from("drone_personnel").delete().eq("profile_id", targetUserId);

    // 2. Tables referencing auth.users
    await admin.from("incident_comments").delete().eq("user_id", targetUserId);
    await admin.from("push_subscriptions").delete().eq("user_id", targetUserId);
    await admin.from("map_viewer_heartbeats").delete().eq("user_id", targetUserId);
    await admin.from("calendar_subscriptions").delete().eq("user_id", targetUserId);

    // 3. SET NULL on columns where we want to keep the row but remove the reference
    await admin.from("mission_sora").update({ prepared_by: null }).eq("prepared_by", targetUserId);
    await admin.from("mission_sora").update({ approved_by: null }).eq("approved_by", targetUserId);
    await admin.from("missions").update({ approved_by: null }).eq("approved_by", targetUserId);
    await admin.from("incidents").update({ oppfolgingsansvarlig_id: null }).eq("oppfolgingsansvarlig_id", targetUserId);
    await admin.from("profiles").update({ approved_by: null }).eq("approved_by", targetUserId);

    // ---- Original cleanup ----

    // Flight logs + join tables
    const { data: flightLogs } = await admin
      .from("flight_logs")
      .select("id")
      .eq("user_id", targetUserId);

    const flightLogIds = (flightLogs ?? []).map((r: { id: string }) => r.id);

    if (flightLogIds.length) {
      await admin.from("flight_log_equipment").delete().in("flight_log_id", flightLogIds);
      await admin.from("flight_log_personnel").delete().in("flight_log_id", flightLogIds);
      await admin.from("flight_logs").delete().eq("user_id", targetUserId);
    }

    // Drones + dependent tables
    const { data: drones } = await admin
      .from("drones")
      .select("id")
      .eq("user_id", targetUserId);

    const droneIds = (drones ?? []).map((r: { id: string }) => r.id);

    if (droneIds.length) {
      await admin.from("drone_equipment").delete().in("drone_id", droneIds);
      await admin.from("drone_personnel").delete().in("drone_id", droneIds);
      await admin.from("drone_accessories").delete().in("drone_id", droneIds);
      await admin.from("drone_inspections").delete().in("drone_id", droneIds);
      await admin.from("drone_log_entries").delete().in("drone_id", droneIds);
      await admin.from("drones").delete().eq("user_id", targetUserId);
    }

    // Equipment + dependent tables
    const { data: equipments } = await admin
      .from("equipment")
      .select("id")
      .eq("user_id", targetUserId);

    const equipmentIds = (equipments ?? []).map((r: { id: string }) => r.id);

    if (equipmentIds.length) {
      await admin.from("drone_equipment").delete().in("equipment_id", equipmentIds);
      await admin.from("equipment_log_entries").delete().in("equipment_id", equipmentIds);
      await admin.from("equipment").delete().eq("user_id", targetUserId);
    }

    // Other user-owned tables
    await admin.from("active_flights").delete().eq("profile_id", targetUserId);
    await admin.from("calendar_events").delete().eq("user_id", targetUserId);
    await admin.from("customers").delete().eq("user_id", targetUserId);
    await admin.from("documents").delete().eq("user_id", targetUserId);
    await admin.from("incidents").delete().eq("user_id", targetUserId);
    await admin.from("missions").delete().eq("user_id", targetUserId);
    await admin.from("news").delete().eq("user_id", targetUserId);
    await admin.from("notification_preferences").delete().eq("user_id", targetUserId);
    await admin.from("dronetag_devices").delete().eq("user_id", targetUserId);

    // roles + profile
    await admin.from("user_roles").delete().eq("user_id", targetUserId);
    await admin.from("profiles").delete().eq("id", targetUserId);

    // Finally: delete auth user
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delAuthErr) {
      console.error("auth.admin.deleteUser failed", delAuthErr);
      return new Response(
        JSON.stringify({ error: "Failed to delete auth user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    console.log("admin-delete-user: deleted", { targetUserId });

    return new Response(
      JSON.stringify({ success: true, user_id: targetUserId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: unknown) {
    console.error("Error in admin-delete-user:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
