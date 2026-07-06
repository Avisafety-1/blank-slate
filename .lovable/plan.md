## Mål

Utvide ECCAIRS-gatewayen (Fly.io) slik at den betjener BÅDE eksisterende Supabase-prosjekt (`pmucsvrypogtttrajqxq`) og det nye "MIL"-prosjektet. Riktig Supabase-klient (admin + user/RLS) må velges per innkommende request, slik at JWT valideres mot rett prosjekt og `eccairs_integrations` / `incidents` leses fra rett database.

Fly-secrets er allerede satt av brukeren:
- Eksisterende: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Nytt prosjekt: `SUPABASE_URL_MIL`, `SUPABASE_ANON_KEY_MIL`, `SUPABASE_SERVICE_ROLE_KEY_MIL`

## Løsning: rute basert på JWT-issuer

Supabase-JWTer inneholder en `iss`-claim på formen `https://<project-ref>.supabase.co/auth/v1`. Vi bruker `iss` (eventuelt project-ref) til å velge rett Supabase-klient per request. Ingen endring i frontend kreves.

## Endringer (kun `supabase/functions/_shared/eccairs-gateway-server.js`)

### 1. Bygg et prosjekt-register ved oppstart
Erstatt de globale `SUPABASE_URL/ANON/SERVICE_ROLE`-variablene med et register bygget fra env:

```
projects = [
  { key: 'base', url: SUPABASE_URL,      anon: SUPABASE_ANON_KEY,      service: SUPABASE_SERVICE_ROLE_KEY },
  { key: 'mil',  url: SUPABASE_URL_MIL,  anon: SUPABASE_ANON_KEY_MIL,  service: SUPABASE_SERVICE_ROLE_KEY_MIL },
]
```
- Filtrer bort prosjekter som mangler url + service_role.
- Bygg to Maps: `adminByRef` (project-ref → service-role client) og `anonByRef` (project-ref → anon key + url for RLS-klient).
- Utled `project-ref` fra url (`https://<ref>.supabase.co`).
- Logg ved oppstart: `[gateway] Registrerte Supabase-prosjekt: <ref1>, <ref2>` (samme format som brukerens screenshot).

### 2. Ny helper: velg prosjekt fra JWT
```
function pickProjectFromJwt(jwt) { ... }
```
- Dekod JWT-payload (base64url, ingen signaturverifisering — Supabase gjør det via `auth.getUser`).
- Les `iss`, trekk ut project-ref (regex `https://([^.]+)\.supabase\.co`).
- Slå opp i `adminByRef` / `anonByRef`. Returner `{ admin, anon: { url, key }, ref }` eller `null` hvis ukjent.

### 3. Refaktorer `requireAuth`
- Erstatt bruken av singleton `supabaseAdmin` med prosjekt valgt fra JWT.
- Hvis prosjekt ikke gjenkjennes: 401 `Unknown Supabase project (iss)`.
- Kall `admin.auth.getUser(jwt)` for validering (fungerer for både prosjekt fordi vi bruker prosjektets egen service role).
- Legg `req.supabase = { admin, anonUrl, anonKey, ref }` for bruk i handlere.
- Behold API-key-shortcut (`GATEWAY_API_KEY`) — men da må vi velge prosjekt annerledes (se punkt 6).

### 4. Refaktorer helpers til å ta `req.supabase`
Erstatt globalt `supabaseAdmin` og `makeUserSupabase(jwt)`:
- `assertIncidentAccess({ req, incident_id })` bruker `req.supabase.anonUrl/Key` for RLS-klient og `req.jwt`.
- `loadIntegration({ admin, company_id, environment })` tar admin-klient som parameter i stedet for å bruke global.
- `requireAdminSupabase(res)` erstattes av sjekk på `req.supabase?.admin`.

### 5. Oppdater alle route-handlere
Alle `/api/eccairs/*`-handlere:
- Bytt `supabaseAdmin` → `req.supabase.admin`.
- Send admin-klient inn i `loadIntegration` og `assertIncidentAccess`.
- Ingen endring i forretningslogikk, payload, E2-kall eller cache — kun kilden til Supabase-klienten endres.

`/api/eccairs/clear-token-cache` og `/api/eccairs/test-connection` beholder eksisterende oppførsel; de går også via `req.supabase.admin` for å laste integrasjon.

### 6. API-key-fallback (GATEWAY_API_KEY)
Dette er en server-to-server-shortcut uten JWT. Siden vi ikke kan utlede prosjekt fra JWT der, krever vi enten:
- ny valgfri header `x-supabase-project: base|mil` (eller project-ref), eller
- default til `base` for bakoverkompatibilitet.

Implementering: hvis `x-api-key` matcher, les `x-supabase-project`-header og slå opp i registeret; ellers bruk `base`. Frontend bruker aldri denne pathen, så det er lav risiko.

### 7. E2 token-cache
`clearTokenCache(company_id)` bruker company_id som key. Ulike prosjekter kan (i teorien) ha kolliderende UUID-er, men i praksis er UUID unikt. Ingen endring nødvendig — men vi kan prefikse cache-key med project-ref for å være trygg. **Foreslått:** prefikse cache-key i `e2Client.js` med prosjekt-ref → skjer i eget lite grep i `e2Client.js` (kun endring i cache-key-bygging, ingen API-endring). Alternativt: hoppe over dette hvis brukeren vil holde `e2Client.js` uendret.

### 8. Ingen endringer utenfor gatewayen
- Ingen endringer i frontend (`EccairsSettingsDialog.tsx`, Supabase-klient osv.).
- Ingen DB-migrasjoner.
- Ingen endringer i `eccairsPayload.js`.

## Verifisering

1. Fly-oppstartslogg viser begge prosjekt-refs registrert.
2. Bruker i `base`-prosjekt: Test tilkobling fungerer som før.
3. Bruker i `mil`-prosjekt: Test tilkobling henter integrasjon fra MIL-DB og returnerer riktig `credentials_source`.
4. JWT fra ukjent prosjekt → 401 med tydelig feilmelding.
5. Lagre credentials i MIL-prosjekt → clear-token-cache-kall lykkes → neste test bruker fersk token.

## Åpent spørsmål

Skal jeg også prefikse token-cache-key med project-ref i `e2Client.js` (punkt 7)? Anbefaler ja for å være helt trygg mot UUID-kollisjoner mellom prosjekter, men det er en minimal endring i en fil du kanskje vil holde uendret.
