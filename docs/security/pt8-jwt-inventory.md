# PT-8 — Inventar over `verify_jwt = false` edge functions

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

### Kolonne C — 17 funksjoner (UBESKYTTET — krever harding)

Sortert etter risiko:

| # | Funksjon | Risiko | Anbefalt gate |
|---|----------|--------|--------------|
| 1 | `resend-confirmation-email` | **HØY** — accepterer vilkårlig `userId`, genererer e-post-lenker via `auth.admin.generateLink`. Brukerenumerering + e-post-spam. | `requireUser` + caller-id == `userId` ELLER ratelimit-table |
| 2 | `send-push-notification` | **HØY** — accepterer `userId`/`userIds`/`companyId` i body, sender push til hvilken som helst bruker. Cross-tenant spam. | `requireUser` + `assertUserInCompany` |
| 3 | `test-email` | **MED** — sender Resend-mail til vilkårlig adresse, `from` styres av `companyId` fra body. | `requireRole('admin'\|'superadmin')` + `assertUserInCompany` |
| 4 | `update-seats` | **MED** — endrer Stripe seat-count basert på `company_id` fra body. | `requireRole('admin')` + `companies.billing_user_id` sjekk |
| 5 | `auto-complete-missions` | **MED** — service-role bulk update av `missions.status`. Cron-job. | `requireCronSecret` |
| 6 | `check-document-expiry` | **MED** — service-role lese profiler + send mail. Cron. | `requireCronSecret` |
| 7 | `check-maintenance-expiry` | **MED** — samme. Cron. | `requireCronSecret` |
| 8 | `check-competency-expiry` | **MED** — samme. Cron. | `requireCronSecret` |
| 9 | `check-mission-reminders` | **MED** — samme. Cron. | `requireCronSecret` |
| 10 | `check-long-flights` | **MED** — samme. Cron. | `requireCronSecret` |
| 11 | `operations-digest` | **MED** — Avisafe internt dashboard via mail. Cron. | `requireCronSecret` |
| 12 | `fetch-notams` | **LAV** — service-role bulk insert til `notams`. Cron. | `requireCronSecret` |
| 13 | `sync-openaip-airspaces` | **LAV** — service-role bulk insert. Cron eller superadmin. | `requireCronOrSuperadmin` |
| 14 | `sync-openaip-obstacles` | **LAV** — samme. | `requireCronOrSuperadmin` |
| 15 | `terrain-elevation` | **LAV** — Mapbox proxy med caching. Public DEM-data, men service-role lese/skrive cache-tabell. | `requireUser` (ingen rolle-krav) |
| 16 | `drone-weather` | **LAV** — MET.no proxy. Publik værdata, men ingen rate-limit. | `requireUser` (ingen rolle-krav) |
| 17 | `safesky-beacons-fetch` | **LAV** — duplikat av `safesky-beacons`? Bør ev. konsolideres. | `requireUser` ELLER fjern hvis ubrukt |

## Plan for harding

**Runde 1 (HØY/MED — fix-now):** funksjon 1–11. Estimat ~1.5 dag.
- Bruk `_shared/auth.ts` (`requireUser`, `requireRole`) og `_shared/cron.ts` (`requireCronSecret`).
- Oppdater pg_cron-jobs til å sende `x-cron-secret` (samme mønster som PT-3/5/6).
- For `resend-confirmation-email`: alternativt token-basert (HMAC av `userId`+timestamp) hvis flyten brukes anonymt fra Auth-siden.

**Runde 2 (LAV — defer/akseptér):** funksjon 12–17.
- Kandidater for `requireUser` uten rolle-krav (rate-limit kommer som egen oppgave).
- `safesky-beacons-fetch` undersøkes for å bekrefte om den er i bruk.

Hver hardet funksjon smoketestes med:
1. Anonymt → 401
2. Feil rolle → 403
3. Riktig caller → 200 (eller 200/skipped for cron uten data)

PT-8 lukkes når alle 17 er flyttet til kolonne A eller B.
