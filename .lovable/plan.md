

## Plan: Fix intermittent auth issues on app return

### Problem 1: Registration dialog showing for existing Google users
In `Auth.tsx` (lines 98-176), `checkGoogleUserProfile` queries the profile via `maybeSingle()`. If the query fails transiently (network timeout, RLS hiccup), `profile` is null, and the code falls through to line 162-167 which shows the registration dialog — even though the user already has a complete profile. The `googleProfileCheckedRef` guard prevents retries, locking the user into this state.

### Problem 2: "Avventer godkjenning" screen on return
In `Index.tsx` (line 312), if `isApproved` is false after profile loads, the user sees the pending approval screen with "Prøv igjen" / "Tilbake" buttons. This happens when `refreshAuthState` in AuthContext completes but the profile query returned stale/empty data transiently, leaving `isApproved = false` for an already-approved user.

### Fixes

**File: `src/pages/Auth.tsx`** — Make Google profile check resilient to transient failures:
1. On profile query error (line 125-129), do NOT return early silently. Instead, retry once after a short delay.
2. If retry also fails, redirect to app domain anyway (let the app domain's AuthContext handle it) rather than showing the registration dialog.
3. Only show registration dialog when the query SUCCEEDS and returns no profile (or profile without `company_id`).
4. Reset `googleProfileCheckedRef` on error so subsequent effects can retry.

**File: `src/pages/Index.tsx`** — Add a grace period before showing "pending approval":
1. When `profileLoaded` becomes true but `isApproved` is false, wait ~2 seconds and then call `refetchUserInfo()` automatically once before showing the pending screen. This catches the case where a stale cache was applied first.
2. If the auto-retry still shows not approved, then display the screen as today.

### Technical details

Auth.tsx change (inside `checkGoogleUserProfile`):
```typescript
// Replace lines 125-129:
if (error) {
  console.error('Error checking profile:', error);
  // Retry once after 1s
  await new Promise(r => setTimeout(r, 1000));
  const { data: retryProfile, error: retryErr } = await supabase
    .from('profiles')
    .select('id, company_id, approved')
    .eq('id', user.id)
    .maybeSingle();
  
  if (retryErr || !retryProfile) {
    // Query still failing — redirect to app and let it handle auth
    console.warn('Profile check failed twice, redirecting to app domain');
    googleProfileCheckedRef.current = false; // allow future retry
    setCheckingGoogleUser(false);
    redirectToApp('/');
    return;
  }
  // Use retry result — fall through to existing logic
  profile = retryProfile; // need to change const to let
}
```

Index.tsx change — auto-retry on suspicious "not approved":
```typescript
// Add auto-retry effect before the render guard
const [approvalRetried, setApprovalRetried] = useState(false);

useEffect(() => {
  if (profileLoaded && !isApproved && !authRefreshing && !approvalRetried && user) {
    const timer = setTimeout(() => {
      setApprovalRetried(true);
      refetchUserInfo();
    }, 1500);
    return () => clearTimeout(timer);
  }
}, [profileLoaded, isApproved, authRefreshing, approvalRetried, user]);

// In the render guard, also block while auto-retry is pending:
if (!isApproved && !isOfflineWithCachedSession && !authRefreshing && approvalRetried) {
  // show pending approval screen
}
```

### Files
- `src/pages/Auth.tsx` — retry logic for Google profile check
- `src/pages/Index.tsx` — auto-retry before showing pending approval

