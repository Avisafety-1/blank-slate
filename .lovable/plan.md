

## Plan: Fiks flicker for ikke-godkjente brukere

### Rotårsak
`AuthenticatedLayout` (App.tsx linje 104) blokkerer unapproved brukere **kun** når `authRefreshing === false`. Når en refresh kjører (`authRefreshing = true`), faller logikken gjennom til full dashboard-rendering med Header. Når refreshen fullføres → `isApproved = false` → tilbake til uten Header → ny refresh trigger → dashboard vises igjen. Denne syklusen gjentas hvert sekund.

### Løsning

#### Steg 1: AuthenticatedLayout — blokker unapproved brukere konsekvent
**Fil: `src/App.tsx`**

Endre linje 104 slik at unapproved brukere aldri ser full dashboard, selv under refresh:

```typescript
// Nåværende (feil):
if (!isApproved && !isOfflineWithSession && !authRefreshing) {
  return <Outlet />;
}

// Nytt (riktig):
if (!isApproved && !isOfflineWithSession) {
  return <Outlet />;  // Alltid la Index.tsx håndtere approval-gating
}
```

Dette er trygt fordi Index.tsx allerede har sin egen approval-gate med retry-logikk. For allerede godkjente brukere under refresh vil `isApproved` forbli `true` (AuthContext bevarer eksisterende state under refresh).

#### Steg 2: Index.tsx — vis approval-skjerm raskere
**Fil: `src/pages/Index.tsx`**

Fjern kravet om `approvalRetried` før approval-skjermen vises. Vis den umiddelbart når `profileLoaded && !isApproved`, men behold auto-retry i bakgrunnen slik at den automatisk oppdaterer seg hvis brukeren godkjennes:

```typescript
// Vis approval-skjerm umiddelbart (ikke vent på retry)
if (!isApproved && !isOfflineWithCachedSession && !authRefreshing) {
  // ...approval screen (fjern && approvalRetried)
}
```

### Filer som endres
- `src/App.tsx` — fjern `&& !authRefreshing` fra approval-sjekk
- `src/pages/Index.tsx` — fjern `&& approvalRetried` fra approval-sjekk

