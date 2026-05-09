# PT-8 — Inventar over `verify_jwt = false` edge functions

**STATUS: LUKKET 2026-05-09.** Kolonne C er tom. Alle 17 funksjoner er enten hardet (Kolonne A) eller formelt akseptert som lav-risiko (Kolonne D).

Generert 2026-05-09. Kilde: `supabase/config.toml` + statisk inspeksjon av `index.ts` i hver funksjon.

**Kolonner:**
- **A — In-code-validert**: leser `Authorization` + verifiserer JWT (via `requireUser`, `getClaims` eller manuell `getUser`) og sjekker rolle/selskap før privilegerte handlinger.
- **B — Bevisst publik**: ekstern HMAC (Stripe, SafeSky), `x-cron-secret`, share-token i URL (`calendar-feed`, `unsubscribe-weekly-report`), eller del av Supabase Auth-flyt før innlogging (welcome/approved/reset/confirmation-mailer kalt fra DB-trigger eller auth-hook).
- **C — Ubeskyttet**: ingen auth-gate, bruker `service_role`, leser sensitive parametre (companyId, userId, recipient_email) fra request body. Krever harding.

## Resultat

### Kolonne A — 27 funksjoner (allerede validert)

`send-notification-email`, `ai-search`, `safesky-advisory`, `flighthub2-proxy`, `dji-parse-proxy`, `count-all-users`, `admin-delete-user`, `send-feedback`, `platform-statistics`, `platform-activity-log`, `process-dronelog`, `manage-dronelog-key`, `dronelog-usage`, `dji-auto-sync`, `dji-process-single`, `send-calendar-link`, `invite-user`, `publish-facebook`, `publish-instagram`, `publish-linkedin`, `check-subscription`, `create-checkout`, `customer-portal`, `manage-addon`, `change-plan`, `delete-own-account`, `process-ardupilot`, `barentswatch-ais`, `system-health-monitor`, `webauthn`, `linkedin-oauth`.

> Bruker `Bearer` + `getClaims`/`auth.getUser` og sjekker rolle/selskap. PT-1/2/4/7/10 har dedikert verifisering (se hovedsummary).

### Kolonne B — 12 funksjoner (bevisst publik)

| Funksjon | Mekanisme |
|----------|-----------|
| `stripe-webhook` | Stripe-signatur (HMAC) |
| `safesky-beacons` | HMAC mot SafeSky |
| `safesky-cron-refresh` | HMAC + `x-cron-secret` |
| `sync-geo-layers` | `requireCronOrSuperadmin` (PT-6) |
| `weekly-company-report` | `requireCronOrSuperadmin` (PT-5) |
| `publish-scheduled` | `requireCronSecret` (PT-3) |
| `calendar-feed` | Share-token i URL (validert mot DB) |
| `unsubscribe-weekly-report` | HMAC-token i URL |
| `send-user-welcome-email` | Trigger fra `auth.users` insert (DB-trigger) |
| `send-customer-welcome-email` | Trigger fra `customers` insert |
| `send-user-approved-email` | Trigger fra `profiles.approved` flip |
| `send-password-reset` | Anonymt (token-hash i lenken er beskyttelsen) |

### Kolonne C — TOM (alle hardet eller akseptert)

Tidligere 17 funksjoner. Status pr 2026-05-09:

| # | Funksjon | Status | Hvor |
|---|----------|--------|------|
| 1 | `resend-confirmation-email` | **A — hardet** | Round 2A: Bearer JWT + same-company admin/superadmin |
| 2 | `send-push-notification` | **A — hardet** | Round 2A: JWT scope-sjekk eller `x-cron-secret` |
| 3 | `test-email` | **A — hardet** | Round 2B: JWT + admin/superadmin i samme selskap |
| 4 | `update-seats` | **D — akseptert** | Allerede JWT + admin-of-company-sjekk i kode |
| 5 | `auto-complete-missions` | **A — hardet** | Round 2B: `requireCronOrSuperadmin` |
| 6 | `check-document-expiry` | **A — hardet** | Round 2B: `requireCronOrSuperadmin` + cron-secret i pg_cron |
| 7 | `check-maintenance-expiry` | **A — hardet** | Round 2B: samme |
| 8 | `check-competency-expiry` | **A — hardet** | Round 2A (cron-caller for push) |
| 9 | `check-mission-reminders` | **A — hardet** | Round 2A |
| 10 | `check-long-flights` | **A — hardet** | Round 2A |
| 11 | `operations-digest` | **A — hardet** | Round 2B: `requireCronOrSuperadmin` + cron-secret |
| 12 | `fetch-notams` | **D — akseptert** | Public NOTAM-data, kun cron |
| 13 | `sync-openaip-airspaces` | **D — akseptert** | Public luftromsdata |
| 14 | `sync-openaip-obstacles` | **D — akseptert** | Public hindringsdata |
| 15 | `terrain-elevation` | **D — akseptert** | Mapbox public DEM-proxy, leverandør-rate-limit |
| 16 | `drone-weather` | **D — akseptert** | MET.no public værdata |
| 17 | `safesky-beacons-fetch` | **D — akseptert** | Public AIS-lignende data |

### Kolonne D — Akseptert risiko (lav)

7 funksjoner aksepteres formelt. Ingen eksponerer kundedata, ingen tillater handlinger på vegne av andre brukere, ingen kan brukes til privilege-eskalering. Worst-case er kvota-misbruk hos tredjeparts API.

Aksept-eier: prosjekteier (Avisafe). Revurderes ved neste pentest.

## Lukking

PT-8 er formelt lukket 2026-05-09. Se `pentest-2026-05-08-summary.md` "Round 2A + 2B" og "Accepted risks" for detaljer og smoke-test-resultater.

