

## Problem

Two separate bugs:

### 1. `endDate` always shows "unknown"
The Stripe SDK (v18.5.0 with API `2025-08-27.basil`) moved `current_period_end` from the top-level subscription object to `items.data[0].current_period_end`. So `subscription.current_period_end` is `undefined`, and `safeDate(undefined)` returns `"unknown"`.

Confirmed by fetching the subscription directly:
- `subscription.current_period_end` → missing
- `subscription.items.data[0].current_period_end` → `1776178491` (Unix timestamp)

### 2. Cancellation status not shown
When a user cancels via Customer Portal with "cancel at period end", Stripe keeps `status: "active"` but sets `cancel_at_period_end: true`. The current code doesn't check or return this flag, so the profile page still shows "Aktivt" with no indication the subscription is ending.

## Fix

### `check-subscription/index.ts`
- Read `current_period_end` from `items.data[0]` as fallback
- Read `cancel_at_period_end` from the subscription
- Return new field `cancel_at_period_end` in the response

### `stripe-webhook/index.ts`
- Same fix for `current_period_end` path in logging

### `AuthContext.tsx`
- Add `cancelAtPeriodEnd` state from `check-subscription` response

### `ProfileDialog.tsx`
- When `subscribed && cancelAtPeriodEnd`: show orange "Avsluttes" badge instead of green "Aktivt"
- Change label from "Neste fornyelse" to "Utløper" when cancelling
- Show a "Reaktiver abonnement" hint (links to customer portal)

