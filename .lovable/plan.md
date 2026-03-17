

## Analysis

The auth logs reveal the root cause is **not client-side code** -- it's Supabase backend performance issues:

1. **`/callback` timeout (504)**: The Google OAuth callback took 10+ seconds and timed out twice, with error `"context deadline exceeded"`
2. **`/user` endpoint timeouts**: Multiple `/user` requests hit 504 (10s timeout), and one returned 500 with `"unable to fetch records: timeout: context canceled"`
3. **`invalid_grant` error**: After the callback timed out, the retry got `oauth2: "invalid_grant" "Bad Request"` because the authorization code had already been consumed by the first (timed-out) attempt
4. **Massive `/user` call burst**: After login, there are ~50+ `/user` calls within seconds from IP `89.8.224.142` -- this is the client hammering the backend

The client-side code itself (`handleGoogleSignIn`) is simple and correct. The slowness comes from:
- **Supabase backend latency** on the `/callback` and `/user` endpoints (likely database pressure or cold starts)
- **Client-side `/user` call storm** after login -- the `AuthContext` `getUser()` call combined with `checkSubscription` and other hooks all calling the auth API simultaneously

### What we can fix client-side

The biggest actionable improvement: **reduce the `/user` call storm** after Google login. The auth logs show ~50 `/user` calls in 2 seconds from the same IP. This happens because:

1. `AuthContext.fetchUserInfo()` calls `supabase.auth.getUser()` (1 call)
2. `checkSubscription()` runs immediately on session change
3. Multiple React re-renders trigger duplicate effects
4. The `checkGoogleUserProfile` effect in `Auth.tsx` also queries the database

## Plan

### 1. Throttle `getUser()` calls in AuthContext

Cache the `getUser()` result for 10 seconds. If a valid result exists in cache, skip the network call. This prevents the burst of 50+ `/user` requests that overwhelm the Supabase auth endpoint after Google login.

### 2. Add loading indicator during Google OAuth redirect

Show a clear "Redirecting to Google..." state so users know the app is working during the slow OAuth round-trip. Currently `setLoading(true)` is set but the page may not reflect it clearly enough.

### 3. Guard `checkGoogleUserProfile` against premature runs

The effect runs on every `[user, authLoading]` change. If `authLoading` flips multiple times during token refresh, the profile check runs repeatedly. Add a `hasCheckedRef` guard to ensure it runs only once per user session.

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Cache `getUser()` result with 10s TTL to prevent call storms |
| `src/pages/Auth.tsx` | Add ref guard to prevent duplicate Google profile checks; improve loading UX during OAuth flow |

### Note on backend

The 504 timeouts on `/callback` and `/user` are Supabase infrastructure issues. If this persists, consider checking the Supabase dashboard for database performance (slow queries, connection pool exhaustion) or upgrading the project plan for better compute.

