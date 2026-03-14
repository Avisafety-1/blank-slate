

## Problem

The `stripe-webhook` returns 500 with `"Invalid time value"` on line 66:
```typescript
new Date((subscription as any).current_period_end * 1000).toISOString()
```

Your Stripe account uses API version `2026-02-25.clover`, but the SDK is initialized with `2025-08-27.basil`. The webhook receives raw event data from Stripe at your account's API version, where `current_period_end` is likely an ISO string (e.g. `"2026-04-14T14:54:55Z"`) instead of a Unix timestamp. Multiplying a string by 1000 produces `NaN`, and `new Date(NaN).toISOString()` throws "Invalid time value".

The same bug exists in `check-subscription` (line 68).

## Fix

Create a safe date helper and use it in both files:

```typescript
const safeDate = (val: any): string => {
  if (!val) return 'unknown';
  if (typeof val === 'number') return new Date(val * 1000).toISOString();
  return new Date(val).toISOString();
};
```

### Changes

1. **`supabase/functions/stripe-webhook/index.ts`** line 66:
   - Add `safeDate` helper
   - Replace `new Date((subscription as any).current_period_end * 1000).toISOString()` with `safeDate((subscription as any).current_period_end)`

2. **`supabase/functions/check-subscription/index.ts`** line 68:
   - Add same `safeDate` helper
   - Replace `new Date(subscription.current_period_end * 1000).toISOString()` with `safeDate(subscription.current_period_end)`

3. **Deploy** both functions.

After deploying, resend the failed event from the Stripe Dashboard to verify.

