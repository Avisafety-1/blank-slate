

## Plan: Instant auth state via cached accessibleCompanies + non-blocking subscription check

### Root Cause

`refreshAuthState` runs a `Promise.all` with 4 parallel calls:
1. Profile query (~fast)
2. Role query (~fast)
3. `get_user_accessible_companies` RPC (~medium)
4. `check-subscription` edge function (~slow, 2-5s)

All 4 must complete before ANY state is written. This means the company switcher, admin badge, and subscription gate all wait for the slowest call (check-subscription).

Additionally, `accessibleCompanies` is never cached in localStorage, so the company switcher is always empty until the RPC completes — even though profile/role/companyId ARE cached.

### Solution

#### 1. `src/contexts/AuthContext.tsx` — Cache accessibleCompanies + split refresh

**Cache accessibleCompanies in profile cache:**
- Add `accessibleCompanies` to the `CachedProfile` interface
- Save it in `saveCachedProfile`, restore it in `applyCachedProfile`
- This gives instant company switcher on page load

**Split Promise.all into two phases:**
- **Phase 1** (fast, blocks UI): profile + role + accessible companies
- **Phase 2** (slow, non-blocking): check-subscription edge function

Apply Phase 1 state immediately. Fire Phase 2 in background and apply when ready. This way companyId, isAdmin, accessibleCompanies are available within ~200ms instead of waiting 2-5s for subscription check.

```text
BEFORE:
  Promise.all([profile, role, companies, subscription])
  → wait for ALL → apply state (2-5s)

AFTER:
  Promise.all([profile, role, companies])        ← Phase 1
  → apply state immediately (~200ms)
  
  check-subscription (fire-and-forget)            ← Phase 2
  → apply subscription when ready
```

**Subscription loading state:** Keep `subscriptionLoading = true` until Phase 2 completes, but `authRefreshing` is set to false after Phase 1. SubscriptionGate already passes children through when `subscriptionLoading` or `authRefreshing` is true, so content is never blocked.

#### 2. Header company fetching for superadmins

The Header's `fetchCompanies()` for superadmins runs independently. No change needed — it already fires on mount. The cached `isSuperAdmin` from localStorage ensures it starts immediately.

### Files changed

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Cache accessibleCompanies, split refresh into fast+slow phases |

