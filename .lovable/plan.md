## Plan: smoke-test sikkerhetsfikser + oppdater pentest-respons

**Testselskap:** "moderavdeling". **Eneste tillatte e-post-mottaker:** `hauggard@gmail.com`. Ingen bulk mot ekte brukere, ingen `bulk_email_all_users` med faktisk send.

---

### 1) Forberedelse (read-only)

- Slå opp `company_id` for "moderavdeling" via `supabase--read_query`.
- Bekreft at admin-mottakere i selskapet er begrenset til `hauggard@gmail.com` (sjekk `profiles` med `email_*`-flagg). Hvis ikke: stopp og rapporter — vi endrer ikke produksjonsdata uten godkjenning.
- Hent en JWT for innlogget preview-bruker (auto-injected av `curl_edge_functions`) og noter rolle.

### 2) Verifiser lukkede funn (ingen e-post sendes)

| PT | Test | Verktøy |
|----|------|---------|
| PT-3 | `cron.job_run_details` siste 24t for `publish-scheduled-marketing` | read_query |
| PT-6 | `sync-geo-layers` uten `x-cron-secret` → 401; med → 200 | curl_edge_functions |
| PT-1 | `safesky-advisory` med fremmed `missionId` → 403; eget → 200 | curl_edge_functions |
| PT-7 | `flighthub2-proxy` `save-token` som vanlig bruker → 403 | curl_edge_functions |
| PT-10 | `dji-parse-proxy` ukjent host → 400; logg viser fingerprint | curl + edge_function_logs |
| PT-4 | `ai-search` anonymt → 401 | curl_edge_functions |

### 3) Verifiser PT-2 `send-notification-email` (kontrollert, kun hauggard@gmail.com)

Alle kall scopes til moderavdeling. Der API tillater `to`-override → sett eksplisitt `"to": "hauggard@gmail.com"`. Der mottaker hentes fra DB → kjør kun hvis steg 1 bekreftet at eneste relevante mottaker er hauggard@gmail.com.

| Flow | Forventet |
|------|-----------|
| Anonymt kall | 401 ✅ (allerede verifisert) |
| `notify_admins_new_user` med ugyldig bootstrap | 403 |
| `notify_new_incident` som vanlig bruker i moderavdeling | 200, e-post kun til hauggard |
| `notify_new_mission` som vanlig bruker i moderavdeling | 200, e-post kun til hauggard |
| `notify_mission_approved` (companyId hentes fra mission) | 200 |
| `bulk_email_users` som vanlig bruker | 403 |
| `bulk_email_users` som admin med eksplisitt `to: hauggard@gmail.com` | 200, 1 mottaker |
| `bulk_email_all_users` som admin (ikke superadmin) | 403 |
| `bulk_email_all_users` som superadmin | **Ikke utført — kun kodeverifisering** |
| `htmlContent` fra ikke-admin | 403 |

Sjekk `edge_function_logs` for `send-notification-email` mellom hver test for å bekrefte gate-utfall og at `sentBy` settes serverside.

### 4) PT-5 weekly-company-report

Kjør curl med superadmin-JWT og `companyId = moderavdeling`. Hvis selskapet har flere admin-mottakere enn hauggard@gmail.com → **ikke kjør** med faktisk send; verifiser kun gate (uten auth → 401, feil rolle → 403).

### 5) Oppdater dokumentasjon

- Skriv resultater per PT inn i `docs/security/pentest-2026-05-08-summary.md` (status + dato + bevis-linje).
- Regenerer `/mnt/documents/Avisafe_Pentest_Respons_2026-05-08_v2.docx` fra summary med korrekt status-tabell (PT-1/2/3/4/5/6/7/10/11 lukket; PT-8/9/12-20 åpne) og leveres som `presentation-artifact`.

### 6) Neste runde (ikke utført her, kun foreslått)

- **PT-8**: inventar over alle `verify_jwt = false` i `supabase/config.toml`, klassifiser hver som *in-code-validert* / *bevisst publik (HMAC/cron)* / *ubeskyttet*. Hardene de ubeskyttede.
- **PT-9, PT-12–PT-20**: ekstrahér tittel/payload fra `pentest-report-2060.pdf`, klassifiser *fix-now / aksepter / defer*, samle *fix-now* i én PR.

---

### Avbrytkriterier

- Hvis steg 1 viser at moderavdeling har andre admin-mottakere enn hauggard@gmail.com → stopp DB-baserte e-post-tester og rapporter.
- Hvis noen test sender til mer enn 1 mottaker i logg → stopp umiddelbart, dokumenter, fjern gate hvis nødvendig.