## Risikovurdering først

### Hvor alvorlig er dette samlet sett?

**Realistisk utnyttelse i dag:** Middels-høy. Funnene er enkle å utnytte (curl-requests uten innlogging eller en forfalsket JWT) og krever ingen spesialkunnskap. Pentesteren har allerede dokumentert PoC-er. Anonkey er publik (det skal den være), så terskelen er bare å kopiere `curl`-kommandoer fra rapporten.

**Hva kan faktisk skje hvis vi ikke fikser:**

| Scenario | Sannsynlighet | Skade |
|----------|--------------|-------|
| Konkurrent eller "drone-Twitter" laster ned bruker-tellinger per selskap (PT-8) | Høy | Omdømme, kommersielt sensitivt — viser kundebase, vekst |
| Ondsinnet bruker masse-avmelder reelle kunder fra ukesrapport (PT-14) | Høy | Compliance/GDPR-samtykkelogg blir feil; kunder mister varslinger om dokumentasjon, vedlikehold osv. |
| Cron-funksjoner trigges i loop (PT-9, 12) | Høy | Stripe/Resend/SafeSky-kostnader, rate-limit hos tredjepart, "spam" til reelle brukere |
| `update-seats` (PT-13) trigges med tilfeldige `company_id` | Høy | Reelle Stripe-fakturaendringer for andre kunder → økonomisk og kontraktuell skade |
| `process-dronelog` SSRF (PT-10) lekker DroneLog-bearer | Middels | Tredjeparts API-nøkkel kompromitteres → må roteres + audit |
| `customer-portal` fail-open (PT-11) | Middels | Vanlig bruker kan åpne Stripe billing-portal og endre/avbryte abonnement for selskapet |
| `dji-auto-sync` (PT-15) | Middels | Enumerering av selskap + DJI-jobber kan trigges på vegne av andre → datakvalitet og kost |
| `flighthub2-proxy debug` (PT-16) | Lav | Krever superadmin → mest brukt for intern reconnaissance |
| Stripe key-prefiks lekker (PT-18) | Lav | Reduserer entropi, hjelper målrettet phishing |
| Manglende sikkerhetsheaders (PT-20) | Lav | Klikkjacking, MIME-sniffing, CSP-bypass |

**Forretningseffekt hvis utnyttet før vi fikser:**
- Stripe: utilsiktede plan-endringer → må refundere/rydde
- Resend/Mailjet: utgående mail-volum kan trigge anti-spam, skade `noreply@avisafe.no`-omdømme
- DroneLog/SafeSky: nøkler må roteres, integrasjoner ned i timer
- GDPR: `weekly_report_unsubscribed` er samtykke-felt → uautoriserte endringer er meldepliktige hvis vi ikke kan reversere
- Avtaler: konkurranse-/konfidensialitetsklausuler i kunde-kontrakter brytes hvis selskapsdata enumereres

**Kort svar:** Ingen av funnene er "kritisk" alene (ingen RCE, ingen rå PII-lekkasje), men summen av PT-9..PT-15 betyr at en hvilken som helst person på internett kan trigge cron-jobber, endre samtykke for navngitte brukere, og pirke i fakturering. Bør fikses denne uka.

---

## Plan i 4 runder

Runder kjøres i rekkefølge. Hver runde leveres som egen "PR" (én melding) med smoketest etter. Mellom rundene venter vi på din OK før neste.

### Runde 1 — Auth-bypass og JWT (Kritisk-først, ~30 min implementering)

Mål: stoppe de funnene en hvilken som helst anonym bruker kan utnytte uten triks.

| Funn | Funksjon | Endring |
|------|----------|---------|
| PT-8 | `count-all-users` | Bytt `atob()`-parsing med `supabase.auth.getClaims(token)`. Reject `alg=none`. |
| PT-12 | `check-mission-reminders` | Krev `x-cron-secret` (samme `CRON_SHARED_SECRET` som PT-3/5/6). Oppdater pg_cron job med header. |
| PT-9 | `safesky-cron-refresh` | Samme: `requireCronSecret` + pg_cron-oppdatering. |
| PT-15 | `dji-auto-sync` | Krev `Bearer` + `getUser()` + sjekk at `companyId` matcher brukers profil; ellers 403. |
| PT-13 | `update-seats` | Krev `Bearer` + `assertUserInCompany(company_id)` + admin/billing_user_id-rolle. Saner Stripe-feilmelding (også PT-18 her). |
| PT-14 | `unsubscribe-weekly-report` | Bytt base64-token til HMAC-SHA256(`userId:exp`, `WEEKLY_UNSUB_SECRET`). Oppdater `weekly-company-report` til å generere signerte lenker. |

**Smoketest etter Runde 1** (curl uten auth → 401 for alle 6).

### Runde 2 — Fail-open og SSRF (Medium, ~20 min)

| Funn | Funksjon | Endring |
|------|----------|---------|
| PT-11 | `customer-portal` | Endre `if (company?.billing_user_id && ...)` til `if (!company?.billing_user_id || company.billing_user_id !== user.id) → 403`. Sentral helper i `_shared/billing.ts`. |
| PT-18 | `customer-portal` | Bytt `throw new Error(...)` mot Stripe til generisk "Billing portal er midlertidig utilgjengelig" + correlation-id i log. |
| PT-10 | `process-dronelog` | Bruk `safeFetch(downloadUrl)` (samme helper som `dji-parse-proxy`). Strip Authorization-header når host er utenfor allowlist. |
| PT-16 | `flighthub2-proxy debug-endpoint` | Allowlist-regex `^https://[a-z0-9-]+\.flighthub\.dji\.com/`. Avvis i prod hvis ikke superadmin (det er det allerede). |

**Smoketest:** PoC-curl fra rapporten (PT-10/11/16) → 400/403.

### Runde 3 — Frontend security headers (Low, ~10 min)

| Funn | Endring |
|------|---------|
| PT-20 | Legg til `<meta>`-tags i `index.html`: `Content-Security-Policy` (nonce ikke mulig på Lovable CDN — bruk `default-src 'self' https: data:`), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`. HSTS settes av Lovable-CDN, sjekk respons og dokumentér hvis allerede på. |

**Verifiser** med `curl -I` mot `https://app.avisafe.no` → headers tilstede.

### Runde 4 — Dokumentasjon og avslutning (~15 min)

1. Roter `DRONELOG_BEARER_TOKEN` (PT-10 krever det selv om SSRF er fikset — token kan ha lekket tidligere)
2. Oppdater `docs/security/pentest-2026-05-08-summary.md` med ny statustabell (alle PT-1..PT-20)
3. Oppdater `docs/security/pt8-jwt-inventory.md` med korrigert klassifisering for `count-all-users`, `safesky-cron-refresh`, `dji-auto-sync`
4. Marker PT-19 som **akseptert** (Supabase platform)
5. Generer `Avisafe_Pentest_Respons_2026-05-08_v4.docx` til Aikido for re-test
6. `manage_security_finding mark_as_fixed` på alle relevante funn i Lovable-scanneren

---

## Database-migrasjoner som trengs

Kun én:

```text
-- For PT-12, 9 og evt. flere cron-jobs hvis ikke alle bruker x-cron-secret enda
-- Oppdater pg_cron-jobs til å sende { 'x-cron-secret': <CRON_SHARED_SECRET> }
-- (gjøres med supabase--read_query/insert, ikke migrasjon, fordi den inneholder URL+anon-key)
```

Ingen nye tabeller. PT-14 løses med HMAC, ikke server-side token-tabell (mindre kompleksitet, ingen GDPR-spor).

---

## Hemmeligheter som må legges til

- `WEEKLY_UNSUB_SECRET` (ny — random 32 byte) for HMAC-signering av unsubscribe-lenker
- Verifiser at `CRON_SHARED_SECRET` allerede finnes (brukt av PT-3/5/6)

Begge bes om via `add_secret` i Runde 1 før kode skrives.

---

## Risiko ved selve fiksingen

| Endring | Hva kan gå galt | Mitigering |
|---------|----------------|-----------|
| `count-all-users` bytte til `getClaims` | Superadmin-dashboard slutter å vise brukertall hvis claim-name endrer seg | Test som superadmin etter deploy |
| Cron-secret på `check-mission-reminders` / `safesky-cron-refresh` | pg_cron-jobs feiler hvis vi glemmer å oppdatere `net.http_post` headers | Oppdater cron først, deretter funksjon, ikke omvendt |
| `dji-auto-sync` krever auth | Hvis funksjonen kalles fra en cron eller webhook → bryter integrasjon | Sjekke kall-stedene i koden + pg_cron før deploy |
| `customer-portal` fail-closed | Selskaper som aldri har satt `billing_user_id` får 403 | Backfill: sett `billing_user_id` = første admin per selskap som migrasjon |
| `unsubscribe-weekly-report` HMAC | Eksisterende mail i innboksen til kunder slutter å fungere | Aksepter både gammel og ny token i 30 dager (dual-mode), så bare ny |

---

## Avbrytkriterier

- Hvis Runde 1-smoketest fortsatt returnerer 200 for anonyme curl → STOPP, undersøk
- Hvis `customer-portal` fail-closed bryter for >10 selskaper → rull tilbake, kjør backfill først
- Hvis HMAC-bytte for unsubscribe medfører at noen avmeldte brukere blir "remeldt" → ingen DB-endring, bare token-validering, så lav risiko
