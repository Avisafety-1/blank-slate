

# Fix: WebAuthn Edge Function — `getClaims` does not exist

## Problem
The `webauthn` edge function calls `supabaseUser.auth.getClaims()` which is **not a method** on the Supabase JS client. This causes a runtime error, and since `verify_jwt = false`, the error happens silently with no logs visible.

## Solution
Replace all `getClaims()` calls with `supabaseUser.auth.getUser()`, which is the correct way to get the authenticated user from a JWT token in Supabase Edge Functions.

## Changes

**`supabase/functions/webauthn/index.ts`** — Two places to fix:

1. **register-options** (line ~65): Replace `getClaims` with `getUser`
2. **register-verify** (line ~115): Same fix

```ts
// Before (broken):
const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(...);
const userId = claimsData.claims.sub;
const userEmail = claimsData.claims.email;

// After (working):
const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
if (userError || !user) return json({ error: "Unauthorized" }, 401);
const userId = user.id;
const userEmail = user.email || "";
```

After code changes, the edge function will be redeployed.

