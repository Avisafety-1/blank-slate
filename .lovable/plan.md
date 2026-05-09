## Endring fra forrige plan

PT-14 (`unsubscribe-weekly-report`) løses nå med **per-bruker random token i DB** istedenfor HMAC-secret. Ingen `WEEKLY_UNSUB_SECRET` trengs. Resten av planen er uendret.

---

## Plan i 4 runder

### Runde 1 — Auth-bypass og JWT (Kritisk-først)

| Funn | Funksjon | Endring |
|------|----------|---------|
| PT-8 | `count-all-users` | Bytt manuell `atob()` med `supabase.auth.getClaims(token)`. Avviser `alg=none`. |
| PT-12 | `check-mission-reminders` | `requireCronSecret`. Oppdater pg_cron-job med `x-cron-secret`-header. |
| PT-9 | `safesky-cron-refresh` | `requireCronSecret`. Oppdater pg_cron-job. |
| PT-15 | `dji-auto-sync` | Tre kall-veier: (a) cron-secret → tillatt (fan-out), (b) intern fan-out fra service-role → tillatt via `Authorization: Bearer <service-key>` matcher service-role, (c) bruker-trigget → krev Bearer + `companyId/userId` må matche brukerens egen profil + admin-rolle. |
| PT-13 | `update-seats` | Krev Bearer + admin/superadmin i `company_id`, ELLER cron-secret (intern kall fra `approve-invited-user`). Saner Stripe-feilmelding (samtidig PT-18 her hvis du vil — men PT-18 er en annen funksjon). |
| PT-14 | `unsubscribe-weekly-report` | **Migrasjon:** `profiles.unsubscribe_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL` + backfill. Funksjonen slår opp `WHERE unsubscribe_token = $1`. Oppdater `weekly-company-report` til å bruke `?token=<uuid>`. Behold gammel base64-flow i 30 dager (dual-mode). |

**Cron-jobs som må oppdateres** (bruker `cron.alter_job`):
- `check-mission-reminders-hourly`
- `safesky-cron-refresh`
- `dji-auto-sync-daily`

Jeg legger `x-cron-secret`-header på alle tre. CRON_SHARED_SECRET er allerede satt.

**Smoketest:** `curl` uten Authorization mot alle 6 funksjoner → 401.

### Runde 2 — Fail-open og SSRF

| Funn | Funksjon | Endring |
|------|----------|---------|
| PT-11 | `customer-portal` | Endre fail-open til fail-closed: `if (!company?.billing_user_id || company.billing_user_id !== user.id) → 403`. **Backfill først:** sett `billing_user_id` = første admin per selskap som har `null`. |
| PT-18 | `customer-portal` | Generisk feilmelding "Billing portal er midlertidig utilgjengelig" + correlation-id i log. Ingen Stripe-feiltekst returneres. |
| PT-10 | `process-dronelog` | `safeFetch(downloadUrl, …, ['dronelogapi.com', 'cdn.dronelogapi.com', 'storage.googleapis.com'])`. Strip Authorization-header når host er utenfor allowlist (defense-in-depth). |
| PT-16 | `flighthub2-proxy` debug-aksjon | Allowlist-regex `^https://[a-z0-9-]+\.flighthub\.dji\.com/` på `flighthub2_base_url`. Avvis med 400 hvis ikke match. |

### Runde 3 — Frontend security headers (Low)

| Funn | Endring |
|------|---------|
| PT-20 | `index.html`: `<meta http-equiv="Content-Security-Policy" content="…">`, `<meta name="referrer" content="strict-origin-when-cross-origin">`. HSTS verifiseres mot Lovable-CDN (`curl -I`). Hvis CSP bryter Mapbox/Resend/Stripe-iframes, juster `connect-src`/`frame-src`. |

### Runde 4 — Dokumentasjon og avslutning

1. Roter `DRONELOG_AVISAFE_KEY` (kan ha lekket via PT-10)
2. Oppdater `docs/security/pentest-2026-05-08-summary.md` med ny statustabell PT-1..PT-20
3. Korriger `docs/security/pt8-jwt-inventory.md`
4. Marker PT-19 som **akseptert** (Supabase platform)
5. Generer `Avisafe_Pentest_Respons_2026-05-08_v4.docx` til Aikido
6. `manage_security_finding mark_as_fixed` på alle relevante funn

---

## Database-migrasjoner

**Én migrasjon (Runde 1 — PT-14):**
```sql
ALTER TABLE public.profiles
  ADD COLUMN unsubscribe_token UUID DEFAULT gen_random_uuid();
UPDATE public.profiles SET unsubscribe_token = gen_random_uuid()
  WHERE unsubscribe_token IS NULL;
ALTER TABLE public.profiles
  ALTER COLUMN unsubscribe_token SET NOT NULL,
  ADD CONSTRAINT profiles_unsubscribe_token_unique UNIQUE (unsubscribe_token);
CREATE INDEX idx_profiles_unsubscribe_token ON public.profiles(unsubscribe_token);
```

**Én migrasjon (Runde 2 — PT-11):**
```sql
-- Backfill billing_user_id der det er null: bruk første admin i selskapet
UPDATE public.companies c
SET billing_user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (p.company_id) p.company_id, ur.user_id
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin'
  ORDER BY p.company_id, p.created_at ASC
) sub
WHERE c.id = sub.company_id AND c.billing_user_id IS NULL;
```
*(Dette er `UPDATE`, så det kjøres som data-operasjon — ikke schema-migrasjon.)*

---

## Hemmeligheter

Ingen nye secrets nødvendig. `CRON_SHARED_SECRET` finnes allerede.

---

## Risiko ved fiksing

| Endring | Hva kan gå galt | Mitigering |
|---------|----------------|-----------|
| `count-all-users` → `getClaims` | Superadmin-dashboard slutter å vise tall | Test som superadmin etter deploy |
| Cron-secret på 3 jobs | Cron-job feiler hvis vi glemmer `cron.alter_job` | Oppdater cron i samme runde som funksjonen |
| `dji-auto-sync` krever auth | Fan-out (intern kall med service-key) må fortsatt fungere | Aksepter også cron-secret på fan-out, send `x-cron-secret` ved intern fetch |
| `customer-portal` fail-closed | Selskaper uten `billing_user_id` får 403 | Backfill kjøres FØR fail-closed-koden deployes |
| `unsubscribe-weekly-report` UUID-token | Gamle e-poster med base64-token | Dual-mode i 30 dager |
| CSP i index.html | Kan bryte Mapbox/Stripe/Resend | Test alle integrasjoner i preview før publish |

---

## Avbrytkriterier

- Hvis Runde 1-smoketest fortsatt returnerer 200 anonymt → STOPP
- Hvis fan-out-mønsteret i `dji-auto-sync` bryter (ingen logs synces neste natt) → rull tilbake auth-sjekken
- Hvis CSP bryter kart eller checkout → fjern CSP, behold de andre headers
