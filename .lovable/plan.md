

## Analysis

The user has configured these webhook events in Stripe Dashboard. The current handler covers:
- ✅ `customer.subscription.created`
- ✅ `customer.subscription.updated`
- ✅ `customer.subscription.deleted`
- ❌ `customer.subscription.paused`
- ❌ `customer.subscription.resumed`
- ❌ `customer.subscription.pending_update_applied`
- ❌ `customer.subscription.pending_update_expired`
- ❌ `payment_intent.canceled`
- ❌ `payment_intent.created`
- ❌ `payment_intent.payment_failed`
- ❌ `payment_intent.processing`
- ❌ `payment_intent.succeeded`

Also missing: `checkout.session.completed` is handled but not listed by the user (likely already configured separately).

## Plan

Update `supabase/functions/stripe-webhook/index.ts` to handle all the new event types:

1. Add `customer.subscription.paused` and `customer.subscription.resumed` cases with logging of subscription ID, status, and customer ID.
2. Add `customer.subscription.pending_update_applied` and `customer.subscription.pending_update_expired` cases.
3. Add `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `payment_intent.created`, and `payment_intent.processing` cases — all logging relevant PaymentIntent details (ID, status, amount, customer).
4. Remove the existing `invoice.payment_failed` case since the user didn't subscribe to invoice events (keep it only if you want, but the `payment_intent.payment_failed` now covers failure detection).

All cases will log details for now. No database writes needed at this stage — the webhook serves as an audit trail and can be extended later to trigger actions (e.g., pause access on `subscription.paused`).

