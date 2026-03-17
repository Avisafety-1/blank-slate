

## Problemet: Header blinker ved sidebytte

### Årsak

`<Suspense fallback={<LoadingSpinner />}>` på linje 149 omslutter **hele** `<Routes>`, inkludert `AuthenticatedLayout` som inneholder `<Header />`.

Når du navigerer til en lazy-loaded side (f.eks. fra `/` til `/kart`), og React-chunken ikke er ferdig lastet ennå, suspender React hele treet under Suspense-grensen — altså **inkludert headeren** — og viser `<LoadingSpinner />` i stedet. Når chunken er lastet, remountes `AuthenticatedLayout` og `Header` fra scratch. Dette er "blinken."

Dette fungerte fint før fordi sidene kanskje allerede var cachet i nettleseren. Etter refaktoreringen av AuthContext og nye Suspense-fallbacks kan timingen ha blitt litt annerledes, noe som gjør blinken mer synlig.

### Løsning

Flytt `Suspense`-grensen **inn i** `AuthenticatedLayout`, slik at headeren aldri er del av Suspense-fallbacken:

**App.tsx:**
- Fjern den ytre `<Suspense>` rundt `<Routes>`
- Wrap individuelle route-elementer med `<Suspense>` der det trengs (offentlige ruter)

**AuthenticatedLayout (i App.tsx):**
- Wrap kun `<Outlet />` med `<Suspense fallback={<LoadingSpinner />}>` slik at headeren alltid forblir synlig mens sideinnholdet lastes

```text
Før:
  Suspense ← omslutter alt
    Routes
      AuthenticatedLayout
        Header        ← forsvinner under lazy load
        Outlet

Etter:
  Routes
    AuthenticatedLayout
      Header            ← alltid synlig
      Suspense          ← kun rundt sideinnhold
        Outlet
```

### Endringer

**`src/App.tsx`** — Én fil:
1. Fjern `<Suspense>` fra rundt `<Routes>` (linje 149/180)
2. I `AuthenticatedLayout`: Wrap `<Outlet />` med `<Suspense fallback={<LoadingSpinner />}>`  — på begge steder (kart-layout og standard-layout)
3. Offentlige ruter som ikke er inne i `AuthenticatedLayout` (auth, reset-password, installer, priser, osv.) wraps individuelt med `<Suspense>`

### Risiko
Svært lav. Ingen logikk endres, ingen auth-endringer, ingen database-endringer. Bare Suspense-grensene flyttes slik at headeren er utenfor lazy-load-sonen.

