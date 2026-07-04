## Problem

Etter innlogging (og på /reset-password) refresher appen ~10 sekunder etter last. Årsaken er ikke Stripe/abonnement-sjekken, men service worker-registreringen.

### Rotårsak

`src/sw.ts` bruker `self.skipWaiting()` + `self.clients.claim()`, og `src/main.tsx` har:

```ts
navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (hasReloaded) return;
  hasReloaded = true;
  window.location.reload();
});
```

`controllerchange` fyres i to helt forskjellige situasjoner:

1. **Ekte oppdatering** — ny SW-versjon tar over fra en eksisterende controller. Reload er ønsket.
2. **Første gangs claim** — siden lastet uten controller (hard refresh, ny fane, første besøk, private mode, eller etter at cache/SW ble tømt) og SW-en claimer den etter ~5–10 sek. Da er den "nye" SW-en helt lik koden som allerede kjører, men vi tvinger likevel en full reload.

Case 2 forklarer begge symptomene:
- **Innlogging:** `signIn` navigerer til `/` → siden re-lastes fra nettverk uten controller → SW claimer → reload → "blink".
- **/reset-password:** Bruker åpner e-postlenken i ny fane. Siden starter uten controller, `verifyOtp` kjører, og midt i flyten claimer SW-en → reload. Token er allerede konsumert (engangs-token) → lenken framstår som ugyldig.

Stripe-sjekken (`checkSubscription` i `Index.tsx`) kjører også rundt samme tidspunkt, men den utløser ingen reload — den oppdaterer bare state. Så det er tilfeldig samtidighet.

## Endring

Kun `src/main.tsx`. Skill mellom "første claim" og "ekte SW-oppdatering", og hopp helt over reload på `/reset-password`.

```ts
if ("serviceWorker" in navigator) {
  // Snapshot om vi allerede hadde en aktiv controller ved oppstart.
  // Hvis ikke, betyr controllerchange bare "SW claimet siden første gang"
  // — koden er identisk med det som allerede kjører, ingen reload trengs.
  const hadControllerAtLoad = !!navigator.serviceWorker.controller;
  let hasReloaded = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloaded) return;
    if (!hadControllerAtLoad) return;               // første-gangs claim — ikke reload
    if (location.pathname.startsWith("/reset-password")) return;  // ikke avbryt recovery-flyt
    hasReloaded = true;
    window.location.reload();
  });
}
```

Ekte SW-oppdateringer (deploy av ny versjon) fungerer fortsatt: da finnes det en `controller` ved sidelast, en ny SW installeres, `controllerchange` fyres, og reload skjer som før. `useForceReload`-banneret er også uendret.

## Ingen andre filer trengs å endres

- `src/sw.ts`, `useForceReload.ts`, `AuthContext.tsx`, `Index.tsx`, `ResetPassword.tsx`: uendret.
- Ingen backend/RLS-endringer.

## Verifisering

1. Logg inn — ingen blink ~10 sek etter.
2. Åpne en fersk passord-tilbakestillingslenke — verifiser og sett nytt passord uten reload.
3. Deploy en ny versjon — banneret / reload på ekte oppdatering fungerer fortsatt.
