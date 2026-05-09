import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CUSTOMER-PORTAL] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Correlation id for log <-> client error mapping
  const correlationId = crypto.randomUUID();

  try {
    logStep("Function started", { correlationId });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error(`[CUSTOMER-PORTAL] STRIPE_SECRET_KEY not set (cid=${correlationId})`);
      return new Response(
        JSON.stringify({ error: "Billing-portal er midlertidig utilgjengelig. Prøv igjen senere.", correlationId }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Mangler innlogging" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "Ugyldig eller utløpt innlogging" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;
    logStep("User authenticated", { email: user.email });

    // Fail-closed billing-owner check (PT-11)
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profile?.company_id) {
      return new Response(
        JSON.stringify({ error: "Brukeren er ikke knyttet til et selskap." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: company } = await supabaseClient
      .from('companies')
      .select('billing_user_id')
      .eq('id', profile.company_id)
      .single();

    if (!company?.billing_user_id) {
      logStep("billing_user_id missing", { companyId: profile.company_id, correlationId });
      return new Response(
        JSON.stringify({
          error: "Ingen betalingsansvarlig er satt for selskapet. Kontakt administrator.",
          correlationId,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (company.billing_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Kun betalingsansvarlig kan administrere abonnementet." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let customerId: string;
    try {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length === 0) {
        logStep("No Stripe customer", { email: user.email, correlationId });
        return new Response(
          JSON.stringify({
            error: "Vi finner ikke ditt abonnement. Kontakt support.",
            correlationId,
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      customerId = customers.data[0].id;
      logStep("Found Stripe customer", { customerId });
    } catch (stripeErr) {
      console.error(`[CUSTOMER-PORTAL] Stripe customer lookup failed (cid=${correlationId}):`, stripeErr);
      return new Response(
        JSON.stringify({
          error: "Billing-portal er midlertidig utilgjengelig. Prøv igjen senere.",
          correlationId,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const origin = req.headers.get("origin") || "https://avisafev2.lovable.app";
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        configuration: "bpc_1TAwCORrLM8xOFbkaDYKNI3A",
        return_url: `${origin}/`,
      });
      logStep("Portal session created");
      return new Response(JSON.stringify({ url: portalSession.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (stripeErr) {
      console.error(`[CUSTOMER-PORTAL] Portal session creation failed (cid=${correlationId}):`, stripeErr);
      return new Response(
        JSON.stringify({
          error: "Billing-portal er midlertidig utilgjengelig. Prøv igjen senere.",
          correlationId,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error) {
    console.error(`[CUSTOMER-PORTAL] Unexpected error (cid=${correlationId}):`, error);
    return new Response(
      JSON.stringify({ error: "Intern feil. Prøv igjen senere.", correlationId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
