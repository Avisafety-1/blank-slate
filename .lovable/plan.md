## Neste runde — pentest-fixes

Etter forrige runde gjenstår 1 high (PT-2) som hovedfokus, pluss en opprydding av medium/low (PT-9, PT-12–PT-20) og en arkitektonisk PT-8.

Anbefalt rekkefølge: PT-2 først (eneste gjenstående high), deretter en triagerunde for mediums/lows, og PT-8 til slutt som egen øvelse.

---

### Steg 1 — PT-2: `send-notification-email` (High)

**Caller-inventory (kartlagt):**
- Ingen DB-trigger eller pg_cron kaller funksjonen direkte.
- Ingen andre edge functions kaller den (cron-jobbene `check-document-expiry`, `check-mission-reminders`, `check-competency-expiry`, `check-maintenance-expiry` sender e-post direkte via Resend, ikke via denne funksjonen).
- **Alle kallere er frontend** (14 filer, bl.a. `Auth.tsx` ved registrering, `BulkEmailSender.tsx`, dialoger for incident/mission/training).

**Konsekvens:** ingen migrering av cron/triggere nødvendig. Funksjonen kan flippes til "krev JWT" i én PR.

**Hardening:**
1. `requireUser()` på alle requests (ingen anonyme kall).
2. Per-`type`-validering med en liten dispatch-tabell:
   - `notify_admins_new_user`: tillatt kun hvis `newUser.email === caller.email` (selvbetjening ved signup; fungerer fordi `supabase.auth.signUp` returnerer session).
   - `notify_new_incident`, `notify_new_mission`, `notify_approval_request`, `notify_pilot_comment`, `notify_mission_mention`, `notify_training_assigned`, `notify_followup_assigned`: kall `assertUserInCompany(user.id, companyId)` slik at man kun kan trigge varsler for selskap man tilhører (parent/child-hierarki via `get_user_visible_company_ids`).
   - `bulk_email` / `campaignId`-flyt: krev `admin` eller `superadmin` i caller's selskap, og scope mottakerlistene til `assertUserInCompany`.
   - `recipientId`/`recipientEmail` fri-form-modus: kun for admin/superadmin, og recipient må tilhøre samme selskap.
3. `sentBy` settes alltid serverside fra `user.id` — feltet i body ignoreres (forhindrer impersonering i logger/audit).
4. `excludeUserIds`, `subject`, `htmlContent`: `htmlContent` kun tillatt for admin/superadmin (forhindrer at vanlig bruker sender vilkårlig HTML via systemets brand-avsender). Vanlige typer bruker `email_templates`.
5. CORS: behold `*` for OPTIONS, men `Access-Control-Allow-Headers` skal inkludere `authorization`.

**Verifisering** (per prosedyren i `pentest-2026-05-08-summary.md`):
- Ingen JWT → 401.
- Vanlig bruker prøver `bulk_email` → 403.
- Vanlig bruker prøver `notify_new_incident` med `companyId` for annet selskap → 403.
- Admin sender bulk i eget selskap → 200, mottakere scopes korrekt.
- Frontend smoke-test: registrering, ny hendelse, nytt oppdrag, training-assignment, mission-mention.
- `edge_function_logs` overvåkes 1 time etter deploy for uventede 401/403.

---

### Steg 2 — Triage av PT-9 og PT-12–PT-20

Nåværende sporings-tabell har "TBD from PDF" for disse. Plan:

1. Hent ut hver finding fra `pentest-report-2060.pdf` og fyll inn riktig funksjon/område i status-tabellen.
2. Klassifiser hver:
   - **Fix nå** — trivielle hardening-ting (ekstra inputvalidering, headers, rate-limit på publike funksjoner, fjerning av verbose logging).
   - **Aksepter med begrunnelse** — der pentest-payloaden ikke lenger eksisterer eller allerede er mitigert (tilsvarende PT-11).
   - **Defer** — krever større refaktor.
3. Lukk alt i "Fix nå"-bøtten i én samlet PR med samme verifiseringsprotokoll.

---

### Steg 3 — PT-8: JWT-verification bypass (deferred)

Behandles som egen runde fordi løsningen ikke er kode-i-én-funksjon, men en arkitektonisk policy:

- Inventér alle edge functions med `verify_jwt = false` i `supabase/config.toml`.
- For hver: enten flippe til `verify_jwt = true`, eller dokumentere bevisst unntak (webhook med HMAC, public sharing, cron) og verifisere at den ikke stoler på client-supplied id-felter.
- Legg til en CI-sjekk (eller dokumentert review-policy) som flagger nye `verify_jwt = false`-funksjoner.

---

### Leveranse denne runden

- Hardenet `send-notification-email` (PT-2 lukket).
- Status-tabellen i `docs/security/pentest-2026-05-08-summary.md` oppdatert med faktiske titler for PT-9/12–20 og en kort triage-anbefaling per linje.
- PT-8 forblir åpen med en konkret arbeidsbeskrivelse for neste runde.