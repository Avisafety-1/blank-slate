

## Strukturell fix: Auth-state stabilitet og kartlag-recovery

### Diagnosen (ChatGPT har rett)

Kjerneproblemet er at **appen behandler midlertidig null-session som utlogging**, og at **kartlag ikke re-fetches når auth kommer tilbake**.

Spesifikt fant jeg disse tre feilene i koden:

**1. `else`-branchen i `onAuthStateChange` (linje 375-390) nuller ut session**

```typescript
} else {
  // ...
  setSession(session);        // session = null under refresh!
  setUser(session?.user ?? null); // user = null!
}
```

Når Supabase SDK sender en midlertidig event under token-refresh, settes `session` og `user` til `null`. Dette trigger en kaskade:
- `DomainGuard`: `!user && isAppDomain()` → redirect til login
- `AuthenticatedLayout`: `!user` → ingen Header, ingen admin
- `SubscriptionGate`: `!user` → blokkerer innhold
- `checkSubscription` effect: `!session` → `subscribed = false`

**2. `checkSubscription` effect (linje 719-733) reagerer på session-endring**

```typescript
useEffect(() => {
  if (!session) {
    setSubscribed(false);  // Nullstiller abonnement ved midlertidig null-session!
    ...
  }
}, [session, loading]);
```

Hver gang session blinker null (under refresh), mistes subscription-status. Når session kommer tilbake, tar `checkSubscription` (edge function) 0.5-2s å svare.

**3. Kart-lag re-fetches ikke ved auth-recovery**

OpenAIPMap sin `visibilitychange`-handler (linje 562-583) henter missions, telemetri og advisories på nytt, men **ikke OpenAIP-luftrom, hindringer, NSM-data eller RPAS-data**. Disse RLS-beskyttede lagene forblir tomme etter at token-refresh feiler midlertidig.

### Løsning (4 endringer)

**Endring 1: Ikke null ut session/user under refresh**

I `onAuthStateChange` sin `else`-branch: Hvis vi allerede har en user og session, og vi er online, ignorer null-session events. De er alltid midlertidige under token-refresh.

```typescript
} else {
  if (!session && user && navigator.onLine) {
    // Transient null during token refresh — keep existing state
    console.log('AuthContext: Ignoring transient null session during refresh');
    return;
  }
  // ... rest of existing logic
}
```

**Endring 2: Ikke nullstill subscription ved midlertidig null-session**

I `checkSubscription`-effecten: Behold eksisterende `subscribed`-verdi når session er null men vi har user (indikerer pågående refresh). Bare nullstill ved faktisk utlogging (`!user`).

```typescript
useEffect(() => {
  if (!session) {
    // Only clear subscription if truly signed out (no user)
    if (!user && !loading) {
      setSubscribed(false);
      setSubscriptionLoading(false);
    }
    return;
  }
  // ... rest unchanged
}, [session, user, loading]);
```

**Endring 3: Re-fetch ALLE kartlag ved visibility-recovery**

I OpenAIPMap sin `visibilitychange`-handler: Legg til re-fetch av luftrom, hindringer, NSM og RPAS — alle lagene som krever gyldig JWT.

```typescript
// Existing re-fetches:
fetchAndDisplayMissions(...)
fetchDroneTelemetry(...)
fetchActiveAdvisories(...)
fetchPilotPositions(...)

// ADD these — currently missing:
fetchAllAipZones(...)
fetchObstacles(...)
fetchNsmData(...)
fetchRpasData(...)
```

**Endring 4: DomainGuard — ikke redirect ved midlertidig null user**

Legg til en kort grace-period eller sjekk `profileLoaded` for å unngå redirect til login under token-refresh:

```typescript
// Don't redirect during potential token refresh
if (!user && isAppDomain() && requireAuth) {
  // Check if we have a cached session — might be mid-refresh
  const hasCachedSession = localStorage.getItem('avisafe_session_cache');
  if (hasCachedSession) {
    console.log('DomainGuard: Cached session exists, skipping redirect during refresh');
    return;
  }
  redirectToLogin('/auth');
}
```

### Filer som endres

- `src/contexts/AuthContext.tsx` — Endring 1 og 2
- `src/components/OpenAIPMap.tsx` — Endring 3
- `src/components/DomainGuard.tsx` — Endring 4

### Forventet effekt

- Admin-knapp, Header og kartlag forblir synlige under token-refresh
- OpenAIP/SafeSky-lag gjenopprettes automatisk etter bakgrunnsperiode
- Ingen redirect til login under midlertidig token-refresh
- Subscription-status blinker ikke til `false` under refresh

### Risiko

Lav. Endringene beskytter bare mot midlertidige null-sessions — faktisk utlogging (SIGNED_OUT event) håndteres fortsatt normalt. DomainGuard fallback sjekker cached session som allerede eksisterer.

