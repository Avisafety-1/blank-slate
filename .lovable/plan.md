## Mål
Legg til en debug-bryter i opplastingsdialogen som lar superadmin i selskapet "Avisafe" velge:
1. **Loggtype**: `auto | DJI | ArduPilot` (overstyrer auto-deteksjon basert på filnavn)
2. **Parser**: `Standard (DroneLogAPI)` vs `Egen Rust (Fly.io)` — kun for DJI

Bryteren skal kun vises for superadmin i Avisafe og er ment for integrasjonstesting.

## Endringer

### 1. `src/components/UploadDroneLogDialog.tsx`
- Hent `companyName` (allerede tilgjengelig via `useAuth` indirekte; ellers via en `companies`-select). Bruk `useRoleCheck().isSuperAdmin`.
- Beregn `showDebugPanel = isSuperAdmin && companyName?.toLowerCase() === 'avisafe'`.
- Legg til UI-panel (kollapsbar boks med `AlertTriangle` + tekst "Kun for testing") på `step === 'upload'`, over fil-velgeren, som inneholder:
  - **RadioGroup loggtype**: Auto / DJI / ArduPilot (binder til eksisterende `logType`-state — utvid typen til `'auto' | 'dji' | 'ardupilot'`, allerede slik).
  - **RadioGroup parser**: `dronelogapi` (default) / `flyio` — ny state `parserOverride`.
- Send `parserOverride` via FormData (`form.append('parser', parserOverride)`) i `handleUpload` og `handleBulkUpload`.
- Erstatt auto-detektering når `logType !== 'auto'` så endepunkt-valg respekterer manuell loggtype (allerede slik, men gjør det eksplisitt).

### 2. `supabase/functions/process-dronelog/index.ts`
- Les `parser`-felt fra FormData. Når `parser === 'flyio'` skal `tryFlyParser` brukes ubetinget og **ikke** falle tilbake til DroneLogAPI ved feil — return en tydelig 422 med `reason` slik at UI viser feilen. Når `parser === 'dronelogapi'` hopp over `tryFlyParser` helt.
- Default-oppførsel (ingen `parser`-felt) er uendret.

### 3. `supabase/functions/process-ardupilot/index.ts` (kun les for å bekrefte at den allerede bruker `ardupilot-parser` på Fly.io — ingen endring nødvendig med mindre vi vil eksponere ArduPilot også, men spec sier "egen rust app" som er DJI-parseren, så vi lar denne være.)

### 4. UI-feedback
- Vis en liten badge i resultatpanelet ("Parsed via Fly.io" / "Parsed via DroneLogAPI") basert på et `parser_used`-felt vi returnerer fra edge function. (Allerede delvis støttet; legg til `parser_used` i responsen.)

## Sikkerhet
- Sjekken er kun UI-gating; edge function aksepterer `parser`-feltet uten autorisasjonssjekk siden det bare velger mellom to internt-konfigurerte parsere (ingen rettighetseskalering). Ok for testformål.

## Ut av scope
- Ingen endring i auto-sync-flyt (Tensio-feilene); kun manuell opplasting.
- Ingen DB-migrasjon.
