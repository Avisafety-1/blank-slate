import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const safeDate = (val: any): string => {
  if (!val) return 'unknown';
  if (typeof val === 'number') return new Date(val * 1000).toISOString();
  return new Date(val).toISOString();
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SIGNING_SECRET is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      logStep("ERROR", { message: "No stripe-signature header" });
      return new Response(JSON.stringify({ error: "No signature" }), { status: 400, headers: corsHeaders });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStep("Signature verification failed", { message: msg });
      return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${msg}` }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    logStep("Event received", { type: event.type, id: event.id });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Checkout completed", {
          sessionId: session.id,
          customerEmail: session.customer_email,
          customerId: session.customer,
          subscriptionId: session.subscription,
        });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const periodEnd = (subscription as any).current_period_end || subscription.items?.data[0]?.current_period_end;
        logStep("Subscription created/updated", {
          subscriptionId: subscription.id,
          status: subscription.status,
          customerId: subscription.customer,
          cancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
          currentPeriodEnd: safeDate(periodEnd),
        });
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription cancelled", {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
        });
        break;
      }
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep(`Subscription ${event.type.split('.').pop()}`, {
          subscriptionId: subscription.id,
          status: subscription.status,
          customerId: subscription.customer,
        });
        break;
      }
      case "customer.subscription.pending_update_applied":
      case "customer.subscription.pending_update_expired": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep(`Subscription ${event.type.split('.').pop()}`, {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
        });
        break;
      }
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed":
      case "payment_intent.canceled":
      case "payment_intent.created":
      case "payment_intent.processing": {
        const pi = event.data.object as Stripe.PaymentIntent;
        logStep(`PaymentIntent ${event.type.split('.').pop()}`, {
          paymentIntentId: pi.id,
          status: pi.status,
          amount: pi.amount,
          currency: pi.currency,
          customerId: pi.customer,
        });
        break;
      }
      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
