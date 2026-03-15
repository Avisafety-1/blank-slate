

## Fix: Fjern "blink" av betalingssiden ved innlasting

### Problem
Ved sideinnlasting skjer dette:
1. `session` er `null` og `subscriptionLoading` er `true` (children vises)
2. useEffect ser `session=null` → setter `subscriptionLoading=false` og `subscribed=false`  
3. SubscriptionGate ser loading ferdig + ikke abonnert → **viser betalingssiden**
4. Auth-listener setter session → `checkSubscription` kjører → setter `subscribed=true`

Steg 3 skaper "blinket" — betalingssiden vises i et kort øyeblikk før abonnementet er sjekket.

### Løsning

**`src/contexts/AuthContext.tsx`** (linje 536-541):

Ikke sett `subscriptionLoading=false` når `session` er null **og** `loading` (auth-loading) fortsatt er `true`. Da vet vi at session kanskje kommer snart. Bare sett den til false når vi vet at brukeren faktisk ikke har en session.

```typescript
useEffect(() => {
  if (!session) {
    setSubscribed(false);
    setSubscriptionEnd(null);
    // Only clear loading if auth itself is done loading
    if (!loading) {
      setSubscriptionLoading(false);
    }
    return;
  }
  setSubscriptionLoading(true);  // Reset while checking
  checkSubscription();
  ...
}, [session, loading]);
```

Også sett `subscriptionLoading=true` når session endres til en ny verdi, slik at gaten venter på svaret fra `check-subscription` før den viser noe.

### Én fil endres
- `src/contexts/AuthContext.tsx`

