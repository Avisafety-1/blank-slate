## Runde 2A — Kritisk hardening

Rekkefølge etter risiko: misbruk av e-post/push (PT-8 #1+#2) → fail-open billing (PT-11/18) → SSRF (PT-10) → FH2 debug (PT-16).

### Risikovurdering før vi starter

| Endring | Risiko hvis vi gjør det | Risiko hvis vi IKKE gjør det |
|---------|--------------------------|--------------------------------|
| `customer-portal` fail-closed | Selskaper uten `billing_user_id` får 403 til vi backfiller | En vilkårlig admin kan åpne Stripe-portal for andres selskap |
| `process-dronelog` SSRF allowlist | Ny dronelog-CDN-host må whitelistes manuelt | Angriper kan få funksjonen til å sende `Authorization: Bearer <DRONELOG_KEY>` til intern infra → token-lekkasje |
| `flighthub2-proxy` debug allowlist | Hvis FH2 skifter base-URL må regex justeres | Auth'd bruker kan proxy mot vilkårlig URL m/ FH2-token |
| `send-push-notification` krever auth | Eksisterende kallere må sende JWT | Anonym DoS/spam, sender push til alle brukere på tvers av selskap |
| `resend-confirmation-email` krever auth | Admin-UI som re-sender bekreftelse må sende JWT | Anonym kan trigge Resend-spam → quota/blacklisting |

**Total nedetid-risiko:** Lav. De fleste endringer er rene auth-tillegg (returnerer 401 i stedet for 200). Eneste reelle bruddrisiko er `customer-portal` — derfor backfill FØR deploy.

---

### Steg 1 — PT-8 #2: `send-push-notification` auth (HØYEST risiko)

Funksjonen tar i dag `userId/userIds/companyId` fra body uten å sjekke caller. Endre til:
- Krev Bearer-JWT via `requireUser` ELLER `x-cron-secret` (for `check-long-flights` o.l. som fan-outer push)
- For JWT-vei: `companyId` må matche `getUserCompanyId(user)` ELLER caller må være admin/superadmin
- Behold `userId/userIds`-modus, men avvis hvis target-bruker ikke er i samme `visible_company_ids` (gjenbruk `assertUserInCompany` via target-brukerens `profiles.company_id`)

Frontend-kall: ingen endring — `supabase.functions.invoke` legger på JWT automatisk.

### Steg 2 — PT-8 #1: `resend-confirmation-email` auth

- Krev Bearer-JWT
- Krev admin-rolle i samme selskap som `userId` som re-sendes (oppslag mot `profiles.company_id`)
- Superadmin bypass

### Steg 3 — PT-11 + PT-18: `customer-portal`

**Først (data-migrasjon):** Backfill `companies.billing_user_id` der den er NULL → første admin (eldste `profiles.created_at`) i selskapet.

**Så kode-endring:**
- Hvis `company.billing_user_id IS NULL` etter backfill → 403 "Ingen betalingsansvarlig satt for selskapet. Kontakt administrator."
- Hvis satt og `!== user.id` → 403 (ikke 500 som i dag)
- Stripe-feil: fang `Stripe.errors.StripeError` separat, returner generisk "Billing-portal er midlertidig utilgjengelig. Prøv igjen senere." + correlation-id i log. Aldri returner `error.message` til klient.

### Steg 4 — PT-10: `process-dronelog` SSRF

- Importer `safeFetch` fra `_shared/http.ts`
- Allowlist: `['dronelogapi.com', 'cdn.dronelogapi.com', 'storage.googleapis.com', 'app.dronelogapi.com']` (verifiser faktiske CDN-hoster fra `docs/dronelog-api-reference.md` først)
- Brukes KUN på linje 935 (`fetch(logUrl, ...)` med Authorization-header) — andre `fetch`-kall går til hardkodet `DRONELOG_BASE` og er trygge
- Ved host-mismatch: 400 "Untrusted download host" + log host

### Steg 5 — PT-16: `flighthub2-proxy` debug-aksjoner

To debug-aksjoner: `debug-endpoint` (linje 850) og `test-device-api` (linje 1145). Begge bruker `flighthub2_base_url` fra DB som kan settes av admin (intern trust), men bør likevel valideres:
- Allowlist-regex: `^https:\/\/[a-z0-9-]+\.flighthub\.dji\.com(\/|$)` ELLER eksakt match mot kjent sandbox-host
- Match feiler → 400 "FlightHub2 base URL utenfor allowlist"
- Gjelder kun debug-aksjonene, ikke prod-flow (som uansett snakker med samme URL — men prod-flow har ikke vilkårlig path-injection)

---

### Tester etter deploy (`supabase--curl_edge_functions`)

| Funksjon | Test | Forventet |
|----------|------|-----------|
| `send-push-notification` | POST uten JWT | 401 |
| `send-push-notification` | POST med JWT, annet selskap | 403 |
| `resend-confirmation-email` | POST uten JWT | 401 |
| `customer-portal` | POST som ikke-billing-bruker | 403 m/ generisk feil |
| `process-dronelog` action=download m/ `downloadUrl=https://evil.com/x` | 400 "Untrusted host" | |
| `flighthub2-proxy` action=`debug-endpoint` m/ tuklet `flighthub2_base_url` | 400 | |

### Filer som endres

- `supabase/functions/send-push-notification/index.ts`
- `supabase/functions/resend-confirmation-email/index.ts`
- `supabase/functions/customer-portal/index.ts`
- `supabase/functions/process-dronelog/index.ts`
- `supabase/functions/flighthub2-proxy/index.ts`
- 1 migrasjon (backfill `billing_user_id`)

### Avbrytkriterier

- Hvis backfill ikke finner admin i et selskap → log warning, ikke fail. Selskap må sette `billing_user_id` manuelt før Stripe-portal virker.
- Hvis `send-push-notification` etter deploy ikke leverer push fra cron-jobber → verifiser at `check-long-flights`/`operations-digest` sender `x-cron-secret`. Hvis nei, deploy dem samtidig (allerede i scope for Runde 2B).

### Hva vi IKKE gjør i denne runden

- PT-8 #5–11 (6 cron-funksjoner) — Runde 2B
- PT-8 #12–17 (offentlige proxies: NOTAM, OpenAIP, terrain, weather, safesky-beacons-fetch) — kategoriseres som **akseptert risiko** i Runde 3 fordi: kun offentlige data, ingen sensitive operasjoner, rate-limit-misbruk er begrenset av tredjepart
- PT-19 (Supabase platform) — akseptert
- PT-20 (CSP/HSTS) — Runde 3, lav verdi vs. risiko for å bryte Mapbox/Stripe
