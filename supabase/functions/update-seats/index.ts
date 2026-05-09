import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { hasValidCronSecret } from "../_shared/cron.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAN_PRICE_IDS = new Set([
  "price_1TB9TARrLM8xOFbkzV267Soh",
  "price_1TB9TfRrLM8xOFbkV1ac0aY5",
  "price_1TB9DARrLM8xOFbkVWT7zgGW",
  // Legacy
  "price_1TAvyMRrLM8xOFbkg986ibK4",
  "price_1TB8rSRwSSSiRYeAcdc2KWfQ",
  "price_1TB8rnRwSSSiRYeAWCmvXJoP",
  "price_1TB8s3RwSSSiRYeAuD8W8KR2",
]);

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UPDATE-SEATS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const body = await req.json().catch(() => ({}));
    const companyId = body.company_id;
    if (!companyId) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PT-13: require either cron-secret (internal callers like approve-invited-user)
    // OR a logged-in admin/superadmin in the same company.
    if (!hasValidCronSecret(req)) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claims.claims.sub as string;

      const { data: profile } = await supabaseClient
        .from("profiles").select("company_id").eq("id", userId).maybeSingle();
      const { data: roles } = await supabaseClient
        .from("user_roles").select("role").eq("user_id", userId);
      const userRoles = (roles || []).map((r: any) => r.role);
      const isSuper = userRoles.includes("superadmin");
      const isAdminOfCompany = userRoles.includes("admin") && profile?.company_id === companyId;
      if (!isSuper && !isAdminOfCompany) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    // Count approved users
    const { count } = await supabaseClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('approved', true);

    const newSeatCount = count || 1;
    logStep("Seat count", { companyId, newSeatCount });

    // Get subscription
    const { data: sub } = await supabaseClient
      .from('company_subscriptions')
      .select('stripe_subscription_id')
      .eq('company_id', companyId)
      .maybeSingle();

    if (!sub?.stripe_subscription_id) {
      logStep("No subscription found, skipping");
      return new Response(JSON.stringify({ updated: false, reason: 'no_subscription' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);

    // Find the plan item (not addon)
    const planItem = subscription.items.data.find((item: any) => PLAN_PRICE_IDS.has(item.price.id));
    if (!planItem) {
      logStep("No plan item found in subscription");
      return new Response(JSON.stringify({ updated: false, reason: 'no_plan_item' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (planItem.quantity === newSeatCount) {
      logStep("Seat count unchanged", { current: planItem.quantity });
      return new Response(JSON.stringify({ updated: false, reason: 'no_change' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    await stripe.subscriptionItems.update(planItem.id, { quantity: newSeatCount });
    logStep("Seats updated", { from: planItem.quantity, to: newSeatCount });

    // Update local record
    await supabaseClient
      .from('company_subscriptions')
      .update({ seat_count: newSeatCount, updated_at: new Date().toISOString() })
      .eq('company_id', companyId);

    return new Response(JSON.stringify({ updated: true, seat_count: newSeatCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    // PT-18: do not leak Stripe error text to caller
    return new Response(JSON.stringify({ error: "Seat sync failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
