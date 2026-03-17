

## Plan: Strukturell refaktorering av AuthContext med `refreshAuthState` og stale-write-beskyttelse

### Problemsammendrag

Koden har tre strukturelle feil som forårsaker "halvdød" tilstand:

1. **Deduplisering blokkerer refresh**: `fetchUserInfoPromiseRef` returnerer tidlig hvis en refresh allerede pågår — men den pågående refreshen kan ha stale userId eller utdatert data. Nye events (TOKEN_REFRESHED, visibilitychange) som burde trigge ny refresh, blir droppet.

2. **Subscription-state er frakoblet profil-state**: `checkSubscription` kjøres i en separat `useEffect` som reagerer på `session`-endring. Når session blinker null under token-refresh, nullstilles subscription. Når session kommer tilbake, tar edge-function-kallet 0.5-2s — i mellomtiden viser SubscriptionGate betalingsvegg.

3. **switchCompany refresher bare profil, ikke subscription**: Etter company-switch via Header/Admin forblir `subscribed`-state fra forrige selskap. Stripe-exemption og billing kan være forskjellig.

### Endringer

#### 1. `src/contexts/AuthContext.tsx` — Sentral `refreshAuthState`

**Erstatt `fetchUserInfo` + separat `checkSubscription`-effect med én `refreshAuthState`:**

```typescript
const refreshVersionRef = useRef(0);
const [authRefreshing, setAuthRefreshing] = useState(false);
const [authInitialized, setAuthInitialized] = useState(false);

const refreshAuthState = async (userId: string, reason: string = 'unknown') => {
  const myVersion = ++refreshVersionRef.current;
  setAuthRefreshing(true);
  
  try {
    // Fetch profile+company, role, accessible companies, subscription in parallel
    const [profileResult, roleResult, accessibleResult, subscriptionResult] = await Promise.all([
      supabase.from('profiles').select(`company_id, approved, companies (...)`).eq('id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      supabase.rpc('get_user_accessible_companies', { _user_id: userId }),
      supabase.functions.invoke('check-subscription'),
    ]);
    
    // Stale write guard — only apply if this is still the latest refresh
    if (myVersion !== refreshVersionRef.current) return;
    
    // Apply all state atomically (profile, role, subscription, companies)
    // ... set all state vars ...
    setProfileLoaded(true);
  } catch (error) {
    if (myVersion !== refreshVersionRef.current) return;
    // Fallback to cached profile
  } finally {
    if (myVersion === refreshVersionRef.current) {
      setAuthRefreshing(false);
      setAuthInitialized(true);
    }
  }
};
```

**Fjern `fetchUserInfoPromiseRef`-deduplisering** — erstattes av `refreshVersionRef` som tillater nye refreshes å overskrive gamle, men bare siste refresh får skrive state.

**Fjern den separate `checkSubscription` useEffect** (linje 724-739) — subscription hentes nå som del av `refreshAuthState`. Behold `checkSubscription` som eksponert funksjon for manuell bruk (checkout-success), men den skal også bruke version-guard.

**Bruk `refreshAuthState` fra alle steder:**
- `onAuthStateChange` SIGNED_IN → `refreshAuthState(user.id, 'signed-in')`
- `onAuthStateChange` TOKEN_REFRESHED → `refreshAuthState(user.id, 'token-refreshed')`  
- `visibilitychange` (>5s bakgrunn) → `refreshAuthState(user.id, 'visibility')`
- `online` event → `refreshAuthState(user.id, 'online')`
- `switchCompany()` → kaller `refreshAuthState` etter company_id-update

**Behold eksisterende beskyttelser:**
- Cached profile via `applyCachedProfile()` for instant UI
- Offline cache/restore
- Transient null-session ignorering
- backgroundUserCheck for deleted users

**Eksporter `authRefreshing` og `authInitialized`** via context.

#### 2. `src/contexts/AuthContext.tsx` — Atomisk `switchCompany`

```typescript
const switchCompany = async (newCompanyId: string) => {
  if (!user) return;
  
  const { data: canAccess, error: accessError } = await supabase.rpc('can_user_access_company', {
    _user_id: user.id,
    _company_id: newCompanyId,
  });
  if (accessError) throw accessError;
  if (!canAccess) throw new Error('No access');
  
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ company_id: newCompanyId })
    .eq('id', user.id);
  if (updateError) throw updateError;
  
  await ensureValidToken();
  await refreshAuthState(user.id, 'switch-company');
};
```

Oppdater også Header.tsx sin superadmin company-switch til å bruke `switchCompany` i stedet for direkte profile-update + `refetchUserInfo`.

#### 3. `src/components/DomainGuard.tsx` — Bruk auth-tilstand i stedet for localStorage

```typescript
const { user, session, loading, profileLoaded, authRefreshing, authInitialized } = useAuth();

// Don't redirect until auth is fully initialized
if (!isProductionDomain()) return <>{children}</>;
if (!authInitialized) return <>{children}</>;
if (loading || authRefreshing) return <>{children}</>;
if (isAuthPage) return <>{children}</>;

// Only redirect when we're certain user is actually signed out
if (!session && !user && isAppDomain() && requireAuth) {
  redirectToLogin('/auth');
  return null;
}
```

Fjern localStorage-sjekken som primær redirect-beskyttelse. Behold som ultimate fallback.

#### 4. `src/App.tsx` — AuthenticatedLayout stabilitet

Legg til `authRefreshing` i layoutens check:

```typescript
const { user, loading, isApproved, profileLoaded, authRefreshing } = useAuth();

// Keep showing header during refresh — don't flash to blank
if (loading || (!user && !authRefreshing)) {
  return <Outlet />;
}
```

#### 5. `src/components/SubscriptionGate.tsx` — Ikke gate under refresh

```typescript
const { ..., authRefreshing } = useAuth();

if (subscriptionLoading || !user || !profileLoaded || !isApproved || isSuperAdmin || subscribed || stripeExempt || authRefreshing) {
  return <>{children}</>;
}
```

### Filer som endres

| Fil | Endring |
|-----|---------|
| `src/contexts/AuthContext.tsx` | Ny `refreshAuthState` med version-guard, fjern fetchUserInfoPromiseRef, fjern separat subscription-effect, atomisk switchCompany, eksporter authRefreshing/authInitialized |
| `src/components/DomainGuard.tsx` | Bruk authRefreshing/authInitialized i stedet for localStorage |
| `src/App.tsx` | AuthenticatedLayout bruker authRefreshing |
| `src/components/SubscriptionGate.tsx` | Skip gate under authRefreshing |
| `src/components/Header.tsx` | Superadmin company-switch bruker switchCompany |

### Hva vi IKKE endrer

- Offline cache-logikk (fungerer)
- OpenAIPMap (allerede fiksede kartlag-recovery)
- Stripe/multi-company DB-struktur
- RLS-policyer
- Edge functions

### Forventet effekt

- Auth-state forblir stabil under token-refresh — ingen "halvdød" tilstand
- Subscription, profil og roller oppdateres atomisk
- Company-switch refresher alt inkludert subscription
- DomainGuard redirecter kun ved bekreftet utlogging
- Stale async writes kan aldri overskrive fersk data

