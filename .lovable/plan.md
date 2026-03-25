

## Problem: `stripeExempt` state is stale when `fireSubscriptionCheck` runs

On line 508, `setStripeExempt(profileData.stripeExempt)` is called, and then on line 531, `fireSubscriptionCheck(userId, myVersion)` is called immediately after. But React state updates are asynchronous -- so when `fireSubscriptionCheck` checks `if (stripeExempt)` on line 573, it reads the **old** value (`false`), not the newly set `true`.

This means stripe_exempt companies always fall through to the Stripe API call on every login.

The same issue applies to `companyId` -- it's read from state inside `fireSubscriptionCheck` but may not yet reflect the value just set via `setCompanyId`.

## Fix

Pass `stripeExempt` and `companyId` as parameters to `fireSubscriptionCheck` instead of reading them from React state.

### Changes in `src/contexts/AuthContext.tsx`

1. **Update `fireSubscriptionCheck` signature** to accept `stripeExemptVal: boolean` and `effectiveCompanyId: string | null` as parameters
2. **Update the function body** to use these parameters instead of `stripeExempt` and `companyId` from state
3. **Update all call sites** (lines ~444, ~531, ~744, ~812) to pass the current values:
   - From `refreshAuthState`: pass `profileData.stripeExempt` and `profileData.companyId`
   - From cached profile path: pass the cached values
   - From `onAuthStateChange` / visibility listeners: pass current state values (these run after state has settled)

This is a minimal, targeted fix that eliminates the race condition without restructuring the auth flow.
