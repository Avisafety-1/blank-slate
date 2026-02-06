

# Fix: Automatisk utlogging ved offline-modus

## Rotarsak

Nar appen starter eller kjorer offline, prover Supabase-klienten a forny tilgangstokenet (access token) via et nettverkskall til `/token`. Nar dette feiler fordi enheten er offline, skjer folgende:

1. `supabase.auth.getSession()` returnerer `null` (fordi token-fornyelsen feilet)
2. `onAuthStateChange` fyrer en `SIGNED_OUT`-hendelse
3. AuthContext setter `user` til `null` og `isApproved` til `false`
4. Brukeren ser enten en blank side eller blir omdirigert til login

Dette er et kjent problem med Supabase JS v2 (bekreftet i GitHub issues #226 og #36906).

## Losning

Beskytte AuthContext mot falske utlogginger som skyldes nettverksfeil, ved a:

1. Cache brukerdata (User-objektet) i localStorage sammen med profildata
2. Ignorere `SIGNED_OUT`-hendelser nar enheten er offline
3. Gjenopprette brukerdata fra cache nar `getSession()` returnerer null offline

## Detaljert implementering

### Fil: `src/contexts/AuthContext.tsx`

**Endring 1: Utvid cache med User-objekt**

Legge til et eget cache-felt for brukerdata (user ID, email, metadata) slik at vi kan gjenopprette `user`-staten nar Supabase returnerer null offline.

```text
const SESSION_CACHE_KEY = 'avisafe_session_cache';

// Lagre ved vellykket innlogging/sesjonsinnhenting:
localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
  userId: user.id,
  email: user.email,
  user_metadata: user.user_metadata,
  app_metadata: user.app_metadata,
}));
```

**Endring 2: Beskytt onAuthStateChange mot offline SIGNED_OUT**

Nar vi mottar `SIGNED_OUT` og enheten er offline, sjekk om vi har cachet brukerdata. Hvis ja, behold eksisterende state i stedet for a nullstille alt:

```text
} else if (event === 'SIGNED_OUT') {
  // Offline guard: Supabase fires SIGNED_OUT when token
  // refresh fails offline - ignore it
  if (!navigator.onLine) {
    console.log('AuthContext: Ignoring SIGNED_OUT while offline');
    return; // <-- Ikke nullstill state
  }
  // Online: Ekte utlogging, nullstill alt
  setUser(null);
  setSession(null);
  // ... resten av nullstillingen
}
```

**Endring 3: Fallback i getSession()**

Nar `getSession()` returnerer null og enheten er offline, gjenopprett fra cache:

```text
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) {
    setSession(session);
    setUser(session.user);
    setLoading(false);
    fetchUserInfo(session.user.id);
  } else if (!navigator.onLine) {
    // Offline fallback: Restore from cache
    const cachedSession = localStorage.getItem(SESSION_CACHE_KEY);
    const cachedUserId = cachedSession ? JSON.parse(cachedSession).userId : null;
    if (cachedUserId) {
      // Create minimal user object from cache
      setUser(JSON.parse(cachedSession) as User);
      applyCachedProfile(cachedUserId);
      setLoading(false);
    } else {
      setLoading(false);
    }
  } else {
    setLoading(false);
  }
});
```

**Endring 4: Rydd cache ved ekte utlogging**

Nar brukeren logger ut med vilje (online), fjern bade sesjonscache og profilcache:

```text
const signOut = async () => {
  // Rydd cache for vi logger ut
  localStorage.removeItem(SESSION_CACHE_KEY);
  if (user) {
    localStorage.removeItem(PROFILE_CACHE_KEY(user.id));
  }
  await supabase.auth.signOut();
};
```

### Fil: `src/components/DomainGuard.tsx`

Allerede fikset med offline-bypass. Ingen ytterligere endringer nodvendig.

### Fil: `src/App.tsx`

Allerede fikset med `isOfflineWithSession`-sjekken. Ingen ytterligere endringer nodvendig.

## Endrede filer

| Fil | Endring |
|-----|---------|
| `src/contexts/AuthContext.tsx` | Cache User-objekt, ignorer offline SIGNED_OUT, fallback i getSession(), rydd cache ved ekte utlogging |

## Begrensninger

- Brukeren kan IKKE logge inn for forste gang uten nettverk (krever Supabase-autentisering)
- Hvis sesjonen har utlopt og brukeren har vaert offline i lang tid, ma de logge inn pa nytt nar nett er tilbake
- API-kall vil fortsatt feile offline, men brukergrensesnittet viser cachet data i stedet for a kaste brukeren ut

