import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // PT-8 fix: verify JWT signature via Supabase SDK (rejects alg=none and forged tokens)
    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "superadmin")
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: "Forbidden - superadmin only" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const url = new URL(req.url);
    let breakdown = url.searchParams.get("breakdown") === "true";
    if (!breakdown && req.method === "POST") {
      try {
        const body = await req.json();
        breakdown = body?.breakdown === true;
      } catch {}
    }

    if (breakdown) {
      const { data: companies, error: compError } = await supabase
        .from("companies").select("id, navn").order("navn");
      if (compError) throw compError;

      const { data: profiles, error: profError } = await supabase
        .from("profiles").select("company_id")
        .eq("approved", true).not("email", "is", null);
      if (profError) throw profError;

      const countMap: Record<string, number> = {};
      (profiles || []).forEach((p: any) => {
        if (p.company_id) countMap[p.company_id] = (countMap[p.company_id] || 0) + 1;
      });

      const result = (companies || []).map((c: any) => ({
        id: c.id, navn: c.navn, userCount: countMap[c.id] || 0,
      }));
      const total = Object.values(countMap).reduce((a: number, b: number) => a + b, 0);

      return new Response(
        JSON.stringify({ companies: result, total }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const { count, error: countError } = await supabase
      .from("profiles").select("*", { count: "exact", head: true })
      .eq("approved", true).not("email", "is", null);
    if (countError) throw countError;

    return new Response(
      JSON.stringify({ count: count || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error in count-all-users:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
