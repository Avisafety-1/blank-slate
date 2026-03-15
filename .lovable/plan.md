

## Plan: Code splitting + Sentry error monitoring

Begge tiltakene er trygge og påvirker ikke funksjonalitet — de endrer kun *når* kode lastes og *logger* feil som allerede skjer.

### Tiltak 1: Code splitting med React.lazy

**Hva endres i `src/App.tsx`:**
- Erstatt alle statiske `import`-er for sider med `React.lazy(() => import(...))`
- Wrap alle `<Route element={...}>` med `<Suspense fallback={<LoadingSpinner />}>`
- Auth og NotFound beholdes som synkrone importer (trengs umiddelbart)
- Opprett en enkel `LoadingSpinner`-komponent som viser en subtil spinner (samme stil som appen)

**Sider som lazy-loades:** Index, Admin, Resources, Kart, Documents, Kalender, Hendelser, Status, Oppdrag, Installer, UserManualDownload, Statistikk, SoraProcess, Changelog, Marketing, Priser, ResetPassword

**Hvorfor dette er trygt:**
- `React.lazy` er en standard React-mekanisme — ingen funksjonalitet endres
- Suspense fallback vises kun i brøkdelen av et sekund mens chunken lastes (ofte fra service worker cache)
- Hvis en chunk feiler å laste, fanger ErrorBoundary det automatisk

### Tiltak 2: Sentry error monitoring

**Nye filer:**
- `src/lib/sentry.ts` — initialiserer Sentry med `Sentry.init()`, environment-deteksjon, og sample rates

**Endringer:**
- `src/components/ErrorBoundary.tsx` — legg til `Sentry.captureException(error)` i `componentDidCatch`
- `src/main.tsx` — importer `src/lib/sentry.ts` øverst (før alt annet)
- `.env` — legg til `VITE_SENTRY_DSN` (tom som default, Sentry aktiveres kun når DSN er satt)

**Hvorfor dette er trygt:**
- Sentry-init sjekker om DSN finnes — uten DSN gjør den ingenting
- `captureException` er en no-op uten DSN
- Ingen UI-endringer, ingen nye avhengigheter i kritisk path
- Sentry SDK lastes asynkront og påvirker ikke app-oppstart

**Ny dependency:** `@sentry/react` (legges til i package.json)

### Oppsummering

| Endring | Filer | Risiko |
|---------|-------|--------|
| Lazy loading | App.tsx + ny LoadingSpinner | Ingen — standard React |
| Sentry | main.tsx, ErrorBoundary, ny sentry.ts, .env | Ingen — no-op uten DSN |

