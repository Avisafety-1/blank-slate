## Fortsettelse av pentest-remediation — PT-10, PT-7, PT-11, PT-3

PT-4 er lukket. Vi følger den prioriterte rekkefølgen fra `.lovable/plan.md` og lukker fire funn til i denne runden. Hver fix får én og samme rutine: **inventory → endring → test → regresjon → markering**.

Vi deployer **én funksjon av gangen**, sjekker logs, og oppdaterer `Avisafe_Pentest_Respons_2026-05-08.docx` + `docs/security/pentest-2026-05-08-summary.md` etter hvert.

---

### PT-10 — DroneLog SSRF / token-leak (`process-dronelog`, `dji-parse-proxy`, `manage-dronelog-key`)

**Problem**
- Funksjonen kan kalles av enhver innlogget bruker uten company-scope-sjekk.
- `DJI_PARSER_URL` / `DRONELOG_BASE` brukes uten allow-list — eventuell konfigurasjonsfeil eller bruker-styrt input kan gi SSRF.
- Tokens (`DJI_PARSER_TOKEN`, DroneLog-nøkler) kan logges i feilmeldinger.

**Endringer**
1. `process-dronelog/index.ts` + `dji-parse-proxy/index.ts` + `manage-dronelog-key/index.ts`:
   - Bruk `requireUser()` fra `_shared/auth.ts`.
   - Hent `companyId` fra `profiles` (server-side), aldri fra body.
   - Bekreft at evt. `flightId`/`logId` i input tilhører brukerens company via `assertUserInCompany` eller direkte `select … where id = $1 and company_id = $2`.
2. Allow-list for utgående `fetch`:
   - Hardkode `dronelogapi.com` og `new URL(DJI_PARSER_URL).host` som eneste tillatte hosts.
   - Hjelper `safeFetch(url, opts)` i `_shared/http.ts` som kaster hvis host ikke er i allow-list.
3. Logging:
   - Erstatt alle `console.log(token)` / full URL-logging med fingerprint (`token.slice(0,4)+"…"+token.slice(-4)`).
   - Wrap fetch-feil i try/catch som ikke videresender ekstern body til klient (returner generisk 502).

**Risiko**: Lav-medium. DJI-import-flyt brukes daglig — feil i company-sjekk kan blokkere legitime opplastninger.

**Testplan**
- `curl_edge_functions` uten auth → 401.
- Med bruker A, send `flightId` som tilhører bruker B sitt selskap → 403.
- Med bruker A, legitim opplastning → 200, telemetry lagret riktig.
- Manuell SSRF-test: sett `DJI_PARSER_URL=http://169.254.169.254` i staging → må refuses av allow-list.
- `edge_function_logs` 1 time etter deploy: ingen 5xx-økning, ingen full-token i log.

**Regresjonsplan**
- Smoke: én DJI-zip + én ArduPilot-fil opplastet via UI på testbruker.
- Bekreft at `dji-process-single` (kjører etter parse) fortsatt får data.
- Rollback: revert kun de tre filene; ingen DB-endringer i dette steget.

---

### PT-7 — FlightHub2 token-tampering (`flighthub2-proxy` action `save-token`)

**Problem**
- Enhver bruker i selskapet kan kalle `action: "save-token"` og overskrive selskapets FH2-token (sub-tenant takeover via tampering).

**Endringer**
1. I `save-token`-grenen: krev `requireRole(user, ['admin','superadmin'])` (admin for eget selskap).
2. Audit-tabell `fh2_credential_audit`:
   - Kolonner: `id`, `user_id`, `company_id`, `action` (`save`|`clear`|`rotate`), `ip`, `user_agent`, `created_at`.
   - RLS: select kun for `has_role(auth.uid(),'admin')` i samme `company_id`; insert kun via service role (edge function).
3. Skriv én rad ved hver `save-token`/`clear-token`.
4. Token-fingerprint logges, aldri full token (allerede delvis på plass).

**Risiko**: Lav. Endrer bare admin-UI-flow.

**Testplan**
- Vanlig bruker kaller `save-token` → 403.
- Admin kaller `save-token` med tom token → 400.
- Admin kaller med gyldig token → 200, ny rad i `fh2_credential_audit`, `get_fh2_token` returnerer ny verdi.
- Cross-tenant: admin i selskap A prøver å sette token for selskap B (ved å manipulere body) → 403 (vi tar `companyId` fra `profiles`, ikke body).

**Regresjonsplan**
- Manuell test i admin-panel: lagre, fjern, lagre på nytt.
- Smoke FH2-import etter rotasjon.
- Migration er additiv (ny tabell) — rollback uten data-tap.

---

### PT-11 — Customer portal cross-tenant (`customer-portal`, `change-plan`, `manage-addon`)

**Problem**
- `customer-portal` returnerer Stripe billing-portal-URL basert på `companyId` i body — bruker fra selskap A kan be om portal for selskap B.

**Endringer**
1. Fjern `companyId` fra body i alle tre funksjoner; les fra `profiles` server-side.
2. Krev `requireRole(user, ['admin','superadmin'])` — kun admin kan endre fakturering.
3. Log `user.id` + `company_id` + `action` til `platform-activity-log` (eksisterende mønster).
4. Frontend: oppdater `BillingSettings` / `PlanSelector` til å droppe `companyId` fra invoke-body.

**Risiko**: Lav. Berører kun fakturerings-UI som bare admins ser.

**Testplan**
- Vanlig bruker → 403 fra alle tre.
- Admin uten Stripe-kunde → 400 med klar feilmelding.
- Admin med gyldig kunde → 200, portal-URL gjelder eget company.
- Forsøk å sende `companyId` for annet selskap i body → ignoreres (server bruker `profiles.company_id`).

**Regresjonsplan**
- E2E: åpne Innstillinger → Fakturering som admin, klikk "Administrer abonnement" → Stripe-portal lastes.
- Bytt plan + legg til addon i staging mot Stripe test-mode.
- Rollback: revert frontend + 3 funksjoner samtidig (frontend-body endringer er bakoverkompatible siden server ignorerer feltet).

---

### PT-3 — `publish-scheduled` uten auth

**Problem**
- Cron-only-funksjon, men callable av hvem som helst → angripere kan trigge tidlig publisering av kø.

**Endringer**
1. `publish-scheduled/index.ts`: legg til `requireCronSecret(req)` som første sjekk.
2. Oppdater `cron.schedule` (DB) til å sende `x-cron-secret`-header via `pg_net.http_post`. Hentes fra Vault.
3. `verify_jwt = false` beholdes (cron sender ikke JWT).

**Risiko**: Lav. Eneste caller er cron.

**Testplan**
- Curl uten header → 401.
- Curl med feil secret → 401.
- Curl med riktig `x-cron-secret` → 200, samme oppførsel som før.
- Vent på neste cron-tikk (sjekk `edge_function_logs`) → må fortsatt kjøre OK.

**Regresjonsplan**
- Sjekk at planlagte poster faktisk publiseres innen 15 min etter cron-tikk.
- Rollback: én git-revert + én SQL-migration som fjerner header. Lavt blast radius.

---

### Felles infrastruktur som må komme på plass først

- `supabase/functions/_shared/http.ts` — `safeFetch(url, opts, allowedHosts[])` (ny, brukes av PT-10).
- Vault-secret `cron_shared_secret` (kopi av eksisterende `CRON_SHARED_SECRET`) for å la `pg_net.http_post` lese den uten å ha env-tilgang. Migration:
  ```sql
  select vault.create_secret('<verdi>','cron_shared_secret');
  ```
- Helper-RPC `get_cron_secret()` som `security definer` returnerer dekryptert verdi (kun callable av postgres-roller, ikke `authenticated`).

---

### Leveranseflyt denne runden

1. Migrations (én call): `fh2_credential_audit` + Vault-secret + `get_cron_secret`.
2. Ny fil `_shared/http.ts`.
3. PT-10 — deploy `process-dronelog`, `dji-parse-proxy`, `manage-dronelog-key`. Test. Marker fixed.
4. PT-7 — deploy `flighthub2-proxy`. Test. Marker fixed.
5. PT-11 — deploy `customer-portal`, `change-plan`, `manage-addon` + frontend-edits. Test. Marker fixed.
6. PT-3 — deploy `publish-scheduled` + oppdater cron-job. Test. Marker fixed.
7. Oppdater `Avisafe_Pentest_Respons_2026-05-08.docx` (status + commit-ref per PT) og `summary.md`.
8. Kjør `security--run_security_scan` til slutt.

Etter denne runden gjenstår PT-1, PT-5, PT-6 (Highs, cron/live-UAV) og PT-2 (sist, egen runde med caller-inventory).

---

### Tekniske detaljer

- All auth via `_shared/auth.ts` — ingen duplisering av `supabase.auth.getUser`.
- All cron-auth via `_shared/cron.ts` — header `x-cron-secret` ELLER `x-internal-secret`.
- Allow-list i `safeFetch` er hardkodet i koden (ikke env), så endring krever code review.
- Audit-tabellen får `created_at` med `default now()` og GIN-index på `(company_id, created_at desc)`.
- Frontend-endringer for PT-11 er rene fjerninger av `companyId` fra invoke-body — type-trygt fordi server ignorerer feltet.
