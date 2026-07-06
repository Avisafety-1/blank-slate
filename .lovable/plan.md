
## Mål

Unngå at "Test tilkobling" i ECCAIRS-innstillingene viser grønt "Tilkobling vellykket" etter at brukernavn/passord er endret til noe feil. Årsak: gateway-serveren (Fly.io) cacher access-token per `company_id` i minnet, og cachen invalideres ikke når nye credentials lagres.

Vi implementerer punkt 1–3. Punkt 4 (skjule "environment" fallback i UI) hoppes over — globale env-variabler er bevisst feil/tomme per prosjekt for å hindre at selskaper deler ECCAIRS-credentials.

## Endringer

### 1. Gateway: alltid frisk token i test-endepunktet
Fil: `supabase/functions/_shared/eccairs-gateway-server.js`

I `POST /api/eccairs/test-connection`, før `getE2AccessToken(result.integration)`:
- Kall `clearTokenCache(company_id)` slik at cached token forkastes og credentials i DB brukes på nytt mot ECCAIRS IdP.
- `clearTokenCache` er allerede eksportert fra `./e2Client`.

Ingen andre endepunkter endres — vanlig API-trafikk beholder cachen (ytelse).

### 2. Gateway: nytt endepunkt for å tømme cache ved lagring
Fil: `supabase/functions/_shared/eccairs-gateway-server.js`

Legg til `POST /api/eccairs/clear-token-cache` (bak `requireAuth` + `requireAdminSupabase`):
- Body: `{ company_id, environment }` (environment logges, cache er per company).
- Kaller `clearTokenCache(company_id)` og returnerer `{ ok: true }`.
- Feiler stille (200) hvis ingen cache finnes — best-effort.

### 3. Dialog: tøm cache etter vellykket lagring
Fil: `src/components/eccairs/EccairsSettingsDialog.tsx`

I `handleSave`, etter at `update_eccairs_credentials`-RPC returnerer uten feil og før `toast.success(...)`:
- Best-effort `fetch(`${ECCAIRS_GATEWAY}/api/eccairs/clear-token-cache`, ...)` med Bearer-token fra `supabase.auth.getSession()`.
- Feil ignoreres (kun `console.warn`) — lagringen skal aldri fremstå som feilet på grunn av cache-kall.
- Nullstill `setTestResult(null)` som i dag.

## Ikke i denne iterasjonen

- Punkt 4 (endre visning når `credentials_source === 'environment'`): ikke aktuelt, siden globale env på Fly.io er bevisst tomme/feil per prosjekt. Håndteres eventuelt separat senere hvis nødvendig.
- Ingen DB-endringer, ingen endringer i `update_eccairs_credentials` eller `get_eccairs_credentials`.
- Ingen endringer i `e2Client.js`.

## Verifisering

1. Lagre gyldige credentials → Test → grønt.
2. Endre passord til feil verdi → Lagre → Test → rødt med feilmelding fra IdP (ikke lenger falsk grønt).
3. Rett passord tilbake → Lagre → Test → grønt igjen.
