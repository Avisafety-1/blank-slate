## Status: Er alt kritisk lukket?

**Ja.** Alle HØY- og MEDIUM-risiko-punkter fra pentesten er enten fikset eller verifisert som ikke-sårbare. Det som gjenstår er LAV-risiko og kan formelt aksepteres med dokumentasjon.

### Lukket (kritisk + medium)

| Område | Status |
|---|---|
| PT-1..7 (originale highs) | Fikset i runde 1 |
| PT-8 #1 `resend-confirmation-email` | Fikset (Bearer JWT + same-company/superadmin) |
| PT-8 #2 `send-push-notification` | Fikset (JWT + scope, eller `x-cron-secret`) |
| PT-8 #3 `test-email` | Fikset (JWT + admin/superadmin i samme selskap) |
| PT-8 #5–11 cron (auto-complete, check-document, check-maintenance, check-competency, check-mission-reminders, check-long-flights, operations-digest) | Fikset (`requireCronOrSuperadmin`) |
| PT-10 DroneLog SSRF | Fikset (`safeFetch` allowlist) |
| PT-11 Customer-portal | Fikset (fail-closed + sanitiserte Stripe-feil) + `billing_user_id` backfill |
| PT-16 FH2-proxy SSRF | Fikset (regex allowlist for djigate/dji.com) |
| PT-18 Stripe-feil-lekkasje | Fikset (correlation-ID i stedet for raw error) |

### Foreslått som akseptert risiko

| # | Funksjon | Hvorfor akseptert |
|---|----------|-------------------|
| PT-8 #4 | `update-seats` | Allerede beskyttet via Stripe webhook + `companies.billing_user_id`-sjekk i koden. Verifiseres på nytt. |
| PT-8 #12 | `fetch-notams` | Public NOTAM-data, kun cron-kall. Maks impact: kvota-misbruk hos kilde. |
| PT-8 #13 | `sync-openaip-airspaces` | Public luftromsdata. Cron-drevet bulk-insert. |
| PT-8 #14 | `sync-openaip-obstacles` | Samme — public hindringsdata. |
| PT-8 #15 | `terrain-elevation` | Mapbox-proxy mot public DEM. Ingen sensitive data. Mapbox-token er rate-limit-beskyttet på leverandørsiden. |
| PT-8 #16 | `drone-weather` | MET.no-proxy, public værdata, ingen autentisert API. |
| PT-8 #17 | `safesky-beacons-fetch` | Bekreft først om i bruk; hvis ja, public AIS-lignende data. |
| PT-9, PT-12..15, PT-17, PT-19..20 | Lave funn fra PDF | Triagért som lav-risiko (ikke datatap, ikke privilege escalation). Aksepteres til neste planlagte sikkerhetsrunde. |

**Begrunnelse for å akseptere:** Ingen av disse eksponerer kundedata, ingen tillater handlinger på vegne av andre brukere, og ingen kan brukes til privilege-eskalering. Worst-case er kvota-misbruk hos tredjeparts API-er — som uansett er rate-limited.

### Dokumentasjonsoppdatering

1. **`docs/security/pentest-2026-05-08-summary.md`**
   - Oppdater statustabellen: PT-8, PT-10, PT-11, PT-16, PT-18 → **fixed**.
   - Legg til ny seksjon **"Closed in round 2A/2B"** med alle hardede funksjoner og smoke-test-resultater.
   - Legg til ny seksjon **"Accepted risks"** med tabellen over.

2. **`docs/security/pt8-jwt-inventory.md`**
   - Flytt funksjon #1, 2, 3, 5–11 fra Kolonne C → Kolonne A.
   - Flytt funksjon #4, 12–17 fra Kolonne C → ny **Kolonne D (akseptert risiko)** med begrunnelse.
   - Sett øverst: **"PT-8 status: LUKKET. Kolonne C tom."**

3. **`mem://security/2024-audit-remediation-plan`** (memory)
   - Oppdater til å reflektere at runde 1 + 2A + 2B er gjennomført.
   - Lenke til de to oppdaterte dokumentene.

4. **`mem://security/hardening-measures`** (memory)
   - Legg til at alle cron-funksjoner krever `x-cron-secret`.
   - Legg til at `test-email`, `resend-confirmation-email`, `send-push-notification` krever JWT med scope-sjekk.
   - Legg til `safeFetch`-allowlist-mønster for nye SSRF-utsatte proxies.

5. **Security memory** (via `update_memory`)
   - Oppsummer "Hva skal aldri skje" + listen over aksepterte risikoer.

### Verifisering før dokumentasjon ferdigstilles

Rask gjennomgang av `update-seats` for å bekrefte at den faktisk er trygg (eller flytt den til "fix-now" hvis ikke).

### Leveranse

Tre filer oppdateres + to memory-poster oppdateres + security-memory skrives. Ingen kodeendringer (med mindre `update-seats`-sjekken avslører hull).
