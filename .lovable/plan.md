

## Fix: Vis loading-spinner i stedet for «Avventer godkjenning» under innlasting

### Problem
Når du logger inn tar det ~3 sekunder å hente profilen. I denne perioden vises «Avventer godkjenning»-skjermen selv om du faktisk er godkjent. Problemet oppstår fordi `isApproved` er `false` som default-verdi mens profilen lastes.

### Årsak
I `AuthenticatedLayout` (App.tsx) faller `!isApproved` gjennom til `<Outlet />` som rendrer Index.tsx direkte. Index.tsx sjekker `!isApproved && !authRefreshing` på linje 324, men `authRefreshing` kan allerede være `false` etter at den initielle profil-hentingen er ferdig — selv om brukeren faktisk er godkjent i databasen. Det skjer også et kort vindu mellom `profileLoaded = true` og den ferske profil-dataen der `isApproved` fortsatt er `false`.

### Løsning
**Fil: `src/pages/Index.tsx`** (linje 324-346)

Legg til en ekstra sjekk: Hvis brukeren nettopp logget inn (profilen ble nettopp lastet) og `isApproved` er false, vis en loading-spinner med AviSafe-logo i stedet for «Avventer godkjenning»-skjermen. Bruk `authInitialized` fra AuthContext for å avgjøre om auth-flyten er fullstendig initialisert.

Konkret endring:
- Hent `authInitialized` fra `useAuth()`
- Før «Avventer godkjenning»-blokken: Hvis `!isApproved && !authInitialized`, vis loading-skjerm med AviSafe-logo og spinner
- «Avventer godkjenning»-skjermen vises kun når `authInitialized` er `true` og `isApproved` fortsatt er `false`

```tsx
// Ny sjekk FØR pending approval
if (!isApproved && !authInitialized) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <img src="/avisafe-logo-text.png" alt="AviSafe" className="h-16 w-auto mx-auto mb-4" />
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    </div>
  );
}
```

### Én fil, én endring
Kun `src/pages/Index.tsx` endres. Ingen database- eller backend-endringer.

