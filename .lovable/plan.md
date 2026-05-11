## Hva er problemet

Cron-jobben `weekly-company-report` (jobid 26) kjørte korrekt i dag mandag 11. mai kl. 08:00 (06:00 UTC) — men edge-funksjonen svarte `401 "Invalid or expired token"`.

Årsaken er at **`CRON_SHARED_SECRET`** (Supabase Edge Function-secret) **ikke lenger matcher** verdien som er hardkodet i `cron.job`-kommandoene. Funksjonen `requireCronOrSuperadmin` faller dermed gjennom cron-secret-sjekken, prøver å validere anon-JWT som en bruker, og feiler.

Dette rammer **alle** cron-baserte funksjoner som bruker den delte hjelperen — sjekket: jobid 6, 14, 15, 25, 26, 27, 28, 29 sender alle samme secret-verdi (`458cca0e…904cb`), og responsene viser `Invalid or missing cron secret` / `Invalid or expired token` på alle.

Sist gang ukesrapporten gikk ut var mandag 4. mai kl. 08:00 (uke 18). Mellom da og nå har Edge Function-secret blitt endret eller rotert uten at cron-jobbene ble oppdatert.

## Tiltak

### 1. Synk secret
Sett Edge Function-secret `CRON_SHARED_SECRET` til verdien som ligger i cron-jobbene:
`458cca0e6a197e843c4a1d644f9046e42494285eeb30c01887ed4439e22904cb`

(Alternativt: generer en ny secret og oppdater alle 8 cron-jobbene. Enklest å bare synke til eksisterende verdi siden den uansett er lagret hashet i én pgmq/cron-kontekst.)

### 2. Manuell trigger av denne ukens rapport
Kall `weekly-company-report` manuelt med riktig `x-cron-secret` etter at secret er synket. Funksjonen beregner forrige ISO-uke ved kjøretid (uke 19), og `weekly_report_sends`-tabellen har ingen rader for uke 19/2026 ennå, så det blir ikke duplikater. Brukerne får da rapporten for uke 19 noen timer forsinket.

### 3. Verifiser de andre cron-jobbene
Etter secret-fix: spot-check `cron.job_run_details` og `net._http_response` for jobid 6, 27, 28, 29 for å bekrefte at de igjen returnerer 200.

### 4. Forebygging (valgfritt)
- Legg til en `monitoring_alert`-trigger som varsler hvis en cron-funksjon returnerer 401/403 mer enn N ganger på rad.
- Dokumentere i `docs/sikkerhetsdokumentasjon.md` at rotering av `CRON_SHARED_SECRET` krever samtidig oppdatering av alle `cron.job`-kommandoer.

## Hva blir ikke gjort
- Ingen kodeendringer i `weekly-company-report/index.ts` — funksjonen er ikke ødelagt.
- Ingen endring i hvem som mottar rapporten eller på malen.
