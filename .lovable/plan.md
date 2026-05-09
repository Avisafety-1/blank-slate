## Neste runde pentest-remediation — PT-5, PT-6, PT-10, PT-1

Vi tar fire funn til. Rekkefølgen er valgt etter **lavest regresjonsrisiko først**, slik at vi bygger opp tillit til mønsteret før vi rører `safesky-advisory` (som har både cron- og UI-callere) og før vi til slutt går løs på PT-2 (`send-notification-email`) i en egen runde.

PT-8 (JWT-bypass) og PT-9/12-20 utsettes — de krever egne runder (PT-8 er runtime-hardening, PT-9+ må først kartlegges fra PDF).

---

### 1. PT-5 — `weekly-company-report` uten auth

**Caller-inventory**
- Eneste legitime caller: `pg_cron`-jobb (ukentlig, mandag morgen).
- Ingen UI-knapp, ingen DB-trigger.

**Endringer**
- `requireCronSecret(req)` som første sjekk.
- Oppdater cron-jobben til å sende `x-cron-secret` via `pg_net.http_post` (samme mønster som `publish-scheduled-marketing`).
- Behold `verify_jwt = false`.

**Risiko**: Svært lav. Én caller, én header.

**Test**: curl uten header → 401. Curl med riktig secret → 200 og rapport sendt til testbruker. Edge-logs neste mandag → grønn.

**Regresjon**: Manuell trigger fra superadmin-panel hvis det finnes; ellers vent på cron-tikk i staging.

---

### 2. PT-6 — `sync-geo-layers` uten auth

**Caller-inventory**
- `pg_cron` (daglig OpenAIP/NOTAM/nature-sync).
- Manuell trigger fra superadmin "Sync nå"-knapp i admin-panel.

**Endringer**
- Aksepter **enten** gyldig `x-cron-secret` **eller** innlogget superadmin (`requireRole(['superadmin'])`).
- Hjelper-funksjon `requireCronOrSuperadmin(req)` i `_shared/auth.ts` (kombinerer `hasValidCronSecret` + `requireRole`).
- Oppdater cron-jobben til å sende secret.
- Behold `verify_jwt = false` (siden cron ikke har JWT).

**Risiko**: Lav. To kjente callere, begge dekkes.

**Test**: Curl uten noe → 401. Vanlig bruker → 403. Superadmin via UI → 200. Cron med secret → 200.

**Regresjon**: Sjekk at neste daglige sync faktisk kjører (rad i `geo_sync_log` eller tilsvarende).

---

### 3. PT-10 — DroneLog SSRF / token-leak

**Caller-inventory**
- `process-dronelog`: kalt fra UI etter DJI-zip-opplastning (innlogget bruker).
- `dji-parse-proxy`: kalt fra `process-dronelog` (intern) og fra UI.
- `manage-dronelog-key`: superadmin-UI i admin-panel.

**Endringer**
1. **Auth**: alle tre bruker `requireUser()`. `manage-dronelog-key` krever i tillegg `requireRole(['superadmin'])`.
2. **Company-scope**: hent `companyId` fra `profiles`. Hvis input inneholder `flightId`/`logId`/`droneId` → verifiser eierskap via `assertUserInCompany` før noe gjøres.
3. **SSRF-allow-list**: bruk `safeFetch()` fra `_shared/http.ts` med hardkodet liste:
   - `dronelogapi.com`
   - host fra `DJI_PARSER_URL` (les én gang ved boot)
4. **Token-fingerprint**: alle `console.log` av tokens går gjennom `fingerprintToken()`. Aldri logg full URL hvis den inneholder query-token.
5. **Feilhåndtering**: ekstern body videresendes ikke til klient — returner generisk `502 upstream_error` med vår egen request-id.

**Risiko**: Medium. DJI-import-flyt brukes daglig — feil i company-sjekk kan blokkere legitime opplastninger.

**Test**:
- Uten auth → 401.
- Bruker A sender `flightId` fra selskap B → 403.
- Legitim DJI-zip via UI → 200, telemetry lagret.
- SSRF-test: midlertidig sett `DJI_PARSER_URL=http://169.254.169.254` i staging → må refuses av allow-list før fetch.
- Logs 1 time etter deploy: ingen full-token, ingen 5xx-spike.

**Regresjon**: Smoke med én DJI-zip + én ArduPilot-fil. Bekreft at `dji-process-single` (downstream) får data. Rollback = revert tre filer, ingen DB-endring.

---

### 4. PT-1 — `safesky-advisory` uten auth + cross-tenant mission-read

**Caller-inventory** (må kartlegges først)
- UI: kart-laget som henter SafeSky-trafikk per mission/area.
- Mulig cron for cache-warming?
- Andre edge-funksjoner som proxy?

**Endringer**
1. `requireUser()` + hent `companyId` fra `profiles`.
2. Hvis input har `missionId` → `assertUserInCompany(missionId, companyId)` (via `get_user_visible_company_ids` for hierarki).
3. Hvis cron-caller finnes → aksepter `x-cron-secret` som alternativ (sjelden — kun hvis vi finner én).
4. SafeSky upstream-kall via `safeFetch()` med allow-list (`api.safesky.app` etc.).
5. HMAC-protokoll og share-mode er allerede implementert (jf. memory) — ikke rør den biten.

**Risiko**: Medium-høy. Brukes på live kart-view, latency-sensitivt. Cross-company hierarchy må håndteres riktig (parent-customer kan se barn-selskap sine missions).

**Test**:
- Uten auth → 401.
- Bruker A med `missionId` fra ikke-synlig selskap → 403.
- Parent-customer admin med barn-selskap mission → 200.
- Smoke: åpne kart med aktiv mission → SafeSky-laget rendrer som før.

**Regresjon**: Sjekk kart-latency (P50/P95) før/etter i logs. Rollback = én git-revert.

---

### Felles infrastruktur som lages først

- Utvid `_shared/auth.ts` med `requireCronOrSuperadmin(req, supabase)`.
- `_shared/http.ts` finnes allerede — utvid `safeFetch()` med per-call allow-list-parameter (i stedet for hardkodet global liste), slik at hver funksjon deklarerer sine egne hosts.
- `assertUserInCompany` finnes i `_shared/companyScope.ts` — verifiser at den støtter hierarki via `get_user_visible_company_ids`. Hvis ikke, legg til.

---

### Leveranseflyt

1. Felles helpers først (én commit).
2. PT-5 — deploy `weekly-company-report` + cron-migration. Test. Marker fixed.
3. PT-6 — deploy `sync-geo-layers` + cron-migration. Test. Marker fixed.
4. PT-10 — deploy 3 funksjoner. Test grundig (tar mest tid). Marker fixed.
5. PT-1 — caller-inventory først → deploy `safesky-advisory`. Test. Marker fixed.
6. Oppdater `Avisafe_Pentest_Respons_2026-05-08.docx` + `docs/security/pentest-2026-05-08-summary.md`.
7. Kjør `security--run_security_scan` til slutt.

---

### Etter denne runden gjenstår

- **PT-2** — `send-notification-email` (egen runde, krever full caller-inventory: DB-triggere, cron, UI, andre edge-funksjoner).
- **PT-8** — JWT-bypass (runtime-hardening, deferred).
- **PT-9, PT-12-20** — må først leses ut fra Aikido-PDF og legges inn i tracker.
