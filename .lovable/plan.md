## Revidert pentest-remediation plan

ChatGPT har rett på flere punkter. Vi tar inn forslagene og justerer rekkefølge etter **faktisk datarisiko**, ikke bare severity-merkelapp.

---

### Steg 0 — Lagre rapport som referanse (engangs)

- Kopier `pentest-report-2060.pdf` → `docs/security/pentest-2026-05-08-aikido.pdf`
- Lag `docs/security/pentest-2026-05-08-summary.md` med alle 20 funn (PT-1..PT-20), status (open/fixed/accepted), og hvilken commit som lukket dem
- Lag `mem://security/pentest-2026-05-08` med kort sammendrag + lenke til summary

---

### Steg 1 — Felles infrastruktur (brukes av alle fixer)

**Filer:**
- `supabase/functions/_shared/auth.ts` — `requireUser(req)`, `requireRole(req, roles[])`, `getUserCompanyId(req)`
- `supabase/functions/_shared/cron.ts` — `requireCronSecret(req)` som sjekker `x-cron-secret` mot `CRON_SHARED_SECRET`
- `supabase/functions/_shared/companyScope.ts` — `assertUserInCompany(userId, companyId)` (hierarki-aware via `get_user_visible_company_ids`)

**Secret:**
- Legg til `CRON_SHARED_SECRET` (random 64-char hex)

**Test-mønster (gjelder ALLE fixer under):**
1. Skriv ned forventet legitim caller (UI / cron / trigger / admin)
2. `curl_edge_functions` uten auth → må gi 401
3. `curl_edge_functions` med vanlig bruker mot admin-endepunkt → må gi 403
4. `curl_edge_functions` med riktig rolle / cron-secret → må gi 200
5. Sjekk `edge_function_logs` 10 min etter deploy

---

### Steg 2 — Ny prioritert rekkefølge (etter datarisiko)

| # | Funn | Severity | Hvorfor først | Risiko ved fix |
|---|------|----------|---------------|----------------|
| 1 | **PT-4 ai-search** | High | Største reelle datalekkasje — `userId` i body lar hvem som helst søke i andres selskap | Lav — kun frontend må droppe `userId` |
| 2 | **PT-10 DroneLog SSRF / token leak** | Medium | Tokens kan lekke / SSRF mot intern infra. Faktisk hemmelighet på spill | Lav-medium |
| 3 | **PT-7 FlightHub2 save-token** | High | Token-tampering = sub-tenant kompromittering | Lav, kun admin-UI |
| 4 | **PT-11 billing portal** | Medium | Cross-tenant billing access | Lav |
| 5 | **PT-3 publish-scheduled** | High | Kun cron — enkel `verify_jwt=true` eller cron-secret | Lav |
| 6 | **PT-5 weekly-company-report** | High | Cron + evt UI-trigger, splitt sti | Lav-medium |
| 7 | **PT-6 sync-geo-layers** | High | Kun cron | Lav |
| 8 | **PT-1 safesky-advisory** | High | Frontend-callere må ha gyldig JWT, sjekk live-UAV bakgrunnsjobb | Medium (live UAV) |
| 9 | **PT-2 send-notification-email** | High | **Sist + størst forsiktighet** — bruker fra DB-triggere, pg_net, cron, frontend | **Høy regresjonsrisiko** |

---

### Steg 3 — PT-2 spesialhåndtering (caller-inventory FØR fix)

Før vi rører `send-notification-email`, lager vi en oversikt over **alle callere**:

```
docs/security/send-notification-email-callers.md
```

Kartlegg:
- **DB triggers** — `notify_admins_new_user`, dokument-utløp, mission reminders, follow-up assigned
- **pg_net / http_post** — alle `cron.schedule(...)` som POSTer til funksjonen
- **Edge functions** — interne kall fra andre funksjoner
- **Frontend** — alle `supabase.functions.invoke('send-notification-email', ...)` (rg-søk i `src/`)
- **Admin UI** — bulk email sender

Funksjonen får så **to trygge innganger**:

```ts
// Vanlig bruker/admin (frontend, admin UI)
if (hasAuthHeader) {
  const user = await requireUser(req);
  if (notificationType === 'bulk') await requireRole(user, ['admin','superadmin']);
  await assertUserInCompany(user.id, body.companyId);
}
// Intern systemjobb (DB triggers, cron, andre edge functions)
else if (req.headers.get('x-internal-secret') === Deno.env.get('CRON_SHARED_SECRET')) {
  // OK, full tillit
}
else {
  return 401;
}
```

**Migration som trengs:** Oppdater alle `cron.schedule` og `pg_net.http_post` kall til å sende `x-internal-secret`-header. DB-triggere som bruker `pg_net` må også oppdateres. Dette er mest arbeid og kan ikke rulles tilbake delvis — derfor sist.

**Toggle for trygghet:** `STRICT_AUTH_ENABLED` env var (default `false` første 24t etter deploy). Når vi har sett 0 regresjoner i logs, sett `true`.

---

### Steg 4 — Per-fix rutine (gjentas for hver av de 9 punktene)

1. Skriv inventory: hvem kaller funksjonen?
2. Implementer auth-sjekk i `index.ts`
3. Oppdater `verify_jwt` i `config.toml` hvis nødvendig
4. Oppdater frontend-kall (fjern `userId` fra body, etc.)
5. Oppdater cron-jobs til å sende `x-cron-secret`
6. Deploy én funksjon
7. Kjør 4-trinns test (no auth / wrong role / right role / cron-secret)
8. Sjekk logs 1 time etter deploy
9. Marker funn som fixed i `summary.md` + `manage_security_finding(mark_as_fixed)`
10. Gå til neste

**Ingen batch-deploy.** Én funksjon av gangen.

---

### Steg 5 — Etter alle Highs er lukket

- Kjør `security--run_security_scan` for å bekrefte
- Oppdater `mem://security/pentest-2026-05-08` med status
- Planlegg runde 2 for resterende Mediums (PT-9, PT-12..PT-15) og Lows (PT-16..PT-20)

---

### Avvik fra ChatGPTs forslag

ChatGPT foreslo PT-3/5/6 før PT-4. Jeg har flyttet **PT-4 først** fordi:
- PT-4 lekker faktisk forretningsdata på tvers av selskaper *nå*
- PT-3/5/6 er cron-only — angripere kan trigge jobber, men ikke lese data direkte
- PT-4-fixen er minst risikabel (bare frontend dropper én parameter)

Resten av rekkefølgen følger ChatGPTs prioritering.

---

### Tekniske detaljer

- `_shared/*.ts` deles via Deno relativ-import: `import { requireUser } from "../_shared/auth.ts"`
- `CRON_SHARED_SECRET` lagres som Edge Function secret, hentes med `Deno.env.get`
- For DB-triggere som POSTer via `pg_net`: lagre samme secret i Vault og les via `vault.decrypted_secrets`
- Tabell `fh2_credential_audit` (PT-7) opprettes via migration: `id, user_id, company_id, action, ip, created_at`, RLS read kun for admin

Si fra om denne rekkefølgen ser riktig ut, så starter jeg med Steg 0+1 (referanse + shared helpers) og deretter PT-4.
