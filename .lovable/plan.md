

## Problem Analysis

When the PWA resumes from background, the following race condition occurs:

1. The visibility change handler fires `refreshAuthState`
2. During this refresh, if the profile query is slow or fails partially, the code builds a fresh `profileData` object with `isApproved: false` as the default
3. This overwrites the previously valid cached state where `isApproved: true`
4. The UI immediately shows "Avventer godkjenning" and the user is stuck
5. Only a hard reload or logout/login resolves it because that re-runs the full auth flow

The root cause: `refreshAuthState` resets `isApproved` to `false` in its default `profileData` object (line 430), and if the profile query returns but `approved` is somehow null, or if there's a partial failure, the user gets locked out. Additionally, the `AuthenticatedLayout` in `App.tsx` (line 103) and `Index.tsx` (line 312) both gate on `isApproved` without considering whether a refresh is in progress.

## Plan

### 1. Preserve previous `isApproved` during refresh (AuthContext.tsx)

Change the default `profileData` initialization to use the current state values instead of `false` defaults. If the fresh data comes back successfully, it overwrites. If queries fail, the previous valid state is preserved.

```
// Before
let profileData: CachedProfile = {
  ...
  isApproved: false,
  ...
};

// After
let profileData: CachedProfile = {
  ...
  isApproved: isApproved, // preserve current state as fallback
  ...
};
```

Apply the same pattern for `userRole`, `isAdmin`, `isSuperAdmin` so they don't reset to defaults during transient failures.

### 2. Guard "Avventer godkjenning" screen during auth refresh (Index.tsx + App.tsx)

Add `authRefreshing` to the approval check so the pending-approval screen is never shown while a refresh is in progress:

- **Index.tsx line 312**: Change `if (!isApproved && !isOfflineWithCachedSession)` to also check `!authRefreshing`
- **App.tsx line 103**: Already has some guards but add `authRefreshing` check alongside `isApproved`

### 3. Add pull-to-refresh / retry on the pending approval screen (Index.tsx)

Add a "Prøv igjen" (Retry) button on the pending approval screen that calls `refreshAuthState` instead of only offering "Tilbake til innlogging". This gives PWA users a way to recover without leaving the app.

### Files to modify
- `src/contexts/AuthContext.tsx` — preserve state defaults during refresh
- `src/pages/Index.tsx` — guard approval screen during refresh, add retry button
- `src/App.tsx` — guard AuthenticatedLayout approval check during refresh

