

## Diagnosis

- **Backend is healthy**: 91 beacons in the database, edge function running correctly
- **RLS policy**: `safesky_beacons` SELECT requires `auth.role() = 'authenticated'`
- **Session replay shows you're on the login page** -- unauthenticated users get 0 beacons silently

The client code fetches beacons but doesn't distinguish between "0 beacons because none exist" and "0 beacons because auth token expired." When a Supabase auth token expires mid-session, queries return empty results without errors, so the reconnect logic never triggers.

## Plan

### 1. Add auth-aware fetch guard in `mapSafeSky.ts`

Before querying `safesky_beacons`, check `supabase.auth.getSession()`. If no valid session exists, skip the fetch and log a warning. This prevents silent failures from expired tokens.

### 2. Detect suspicious empty results

If the query succeeds but returns 0 rows for several consecutive polls (e.g., 5 times in a row), attempt to refresh the auth token via `supabase.auth.refreshSession()` before the next fetch. This handles the case where the token silently expires during long sessions.

### 3. Better logging

Add a log line when 0 beacons are returned from a successful query, distinguishing it from actual errors. This aids future debugging.

### Files changed

| File | Change |
|------|--------|
| `src/lib/mapSafeSky.ts` | Add session check before fetch, add empty-result counter with token refresh, improve logging |

