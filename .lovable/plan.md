## Hva som skjer

Når du logger inn ser den fullstendige render-flyten slik ut:

1. `SIGNED_IN` event fyrer → `applyCachedProfile` setter UI med cached data (umiddelbart).
2. `refreshAuthState('signed-in')` starter → henter profile/role/companies (≈1–2s) → setter `setProfileLoaded(true)`, `setAuthRefreshing(false)`, `setAuthInitialized(true)`.
3. **Phase 2** `fireSubscriptionCheck` kjøres → kaller `check-subscription` edge function (Stripe API, **5–10 sekunder**).
4. Når edge-funksjonen returnerer kalles `applySubscriptionData()` som setter `subscribed`, `subscriptionLoading=false`, `subscriptionPlan`, `seatCount` osv.

I tillegg lytter en realtime-kanal på `profiles`-tabellen (`current-profile-access-*`) og kjører `refreshAuthState('profile-access-change')` ved ENHVER UPDATE på profilraden din — også når en bakgrunnsprosess (f.eks. Resend-audience-trigger, dronelog-key-provisjon, sist innlogget-felt e.l.) oppdaterer profilen kort etter login.

## Hvorfor det "blinker"/lukker profilsiden

`AuthenticatedLayout` (`src/App.tsx` linje 100–108) bytter mellom `<Outlet />` direkte og `<Header><SubscriptionGate><Outlet /></SubscriptionGate>` basert på `loading`, `profileLoaded`, `isApproved`. Når `refreshAuthState` kjører på nytt setter den `setAuthRefreshing(true)` og deretter en rekke `setX(...)`-kall (linje 559–576). React batcher disse, men:

- `SubscriptionGate` re-evaluerer betingelsen sin når `subscriptionLoading` flipper fra `true` → `false`. Hvis `subscribed` ikke ble satt i samme batch (f.eks. ved feil i edge-funksjonen, eller en cache miss der `subscribed` står på initialverdien `false`), vises betalingsmuren et øyeblikk og siden under (Profile) **demonteres**. Det er det du opplever som blinking + at åpen modal/dialog forsvinner.
- I tillegg kan realtime-trigger (UPDATE på din egen profilrad) føre til en ekstra full re-render/refresh ~10s etter innlogging.

## Plan for fikser

### 1. Stabiliser `SubscriptionGate` så den aldri "flasher" paywall

Kun vurder gating når abonnementsstatus faktisk er kjent OG ikke er midt i en refresh. Endre vilkåret slik at siden ikke demonteres mens vi venter:

```ts
// SubscriptionGate.tsx
const { ..., authRefreshing } = useAuth();
if (!user || !profileLoaded || subscriptionLoading || authRefreshing
    || !isApproved || isSuperAdmin || subscribed || stripeExempt) {
  return <>{children}</>;
}
```

Dette forhindrer at en kortvarig flip i `subscribed` (f.eks. mens edge-funksjon kjører på nytt) demonterer barnetreet.

### 2. Ikke "demonter" layout under refresh

I `AuthenticatedLayout` returnerer vi `<Outlet />` uten Header når `!profileLoaded`. Det er greit ved første innlogging, men hvis `profileLoaded` noen gang midlertidig blir falsk vil hele Header/Suspense-treet remountes. Lås den slik at den kun gjelder før første gang `profileLoaded` ble satt (bruk en `useRef` "har vært loaded en gang" eller fjern sjekken når `authInitialized=true`).

### 3. Begrens realtime-triggeren på profilen

`current-profile-access-*` kanalen kjører `refreshAuthState` ved ENHVER UPDATE — også irrelevante kolonner (last_seen, resend_id osv.). Filtrer på relevante endringer i payload (f.eks. `approved`, `company_id`, `under_training`, `training_module_access`) før `refreshAuthState` kalles. Da unngås en uvedkommende refresh ~10s etter login.

### 4. Optimistisk subscription-cache

I `fireSubscriptionEdgeFunction`-feilsti settes `setSubscriptionLoading(false)` uten at `subscribed` justeres. Hvis vi har en `company_subscriptions`-cache, bruk den verdien som fallback når Stripe-kallet feiler, slik at `subscribed` aldri faller til initialverdien `false`.

## Tekniske detaljer (filer som endres)

- `src/components/SubscriptionGate.tsx` — legg til `authRefreshing`-sjekk i guard.
- `src/App.tsx` (`AuthenticatedLayout`) — bruk en "har vært ferdig lastet"-ref slik at Header ikke demonteres ved senere refresh.
- `src/contexts/AuthContext.tsx` — filtrer realtime-handler på relevante kolonner i payload, og la subscription-fallback beholde forrige `subscribed`-verdi når edge-funksjonen feiler.

## Verifikasjon

1. Logg inn, åpne profilsiden, vent 15 sekunder. Skal ikke blinke eller demontere modal.
2. Sjekk console: `AuthContext: refreshAuthState v...` skal kun fyres for relevante endringer.
3. Network: `check-subscription` skal kjøre én gang etter login og deretter kun ved manuell trigger eller 15-min periodisk refresh.