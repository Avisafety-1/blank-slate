Ja — dette bør ryddes opp. Selve totalen er ikke kritisk ennå (1.01 GB av 18 GB), men fordelingen viser at mesteparten er teknisk logg/HTTP-responsdata, ikke applikasjonsdata.

Funn fra Supabase:
- `net._http_response`: ca. 589 MB. Dette er pg_net-responser fra cron-jobber som kaller Edge Functions.
- `cron.job_run_details`: ca. 228 MB + indeks ca. 138 MB. Dette er kjørelogg fra pg_cron.
- De største kildene er SafeSky-jobbene:
  - `safesky-beacons-norway`: hvert 10. sekund, ca. 60k kjøringer siste 7 dager.
  - `safesky-cron-refresh`: hvert 15. sekund, ca. 40k kjøringer siste 7 dager.
- Det finnes allerede en cleanup-jobb for `cron.job_run_details` eldre enn 7 dager, men det er fortsatt veldig mange rader på 7 dager.
- Det ser ikke ut til å finnes tilsvarende cleanup for `net._http_response`.

Plan:

1. Legg inn databaseopprydding for `net._http_response`
   - Opprett en Supabase-migrasjon som sletter gamle pg_net HTTP-responser, f.eks. eldre enn 1 time eller 6 timer.
   - Dette er trygt fordi tabellen primært brukes som teknisk responslogg for asynkrone `net.http_post`-kall, ikke som forretningsdata.

2. Stram inn retention for `cron.job_run_details`
   - Endre eksisterende cleanup-jobb fra 7 dager til kortere retention, f.eks. 24 timer.
   - Med dagens SafeSky-frekvens gir 7 dager unødvendig mye støy og indeksvekst.

3. Gjør cleanup-jobben mer komplett
   - Oppdater `cleanup-cron-logs` slik at den rydder både:
     - `cron.job_run_details`
     - `net._http_response`
   - Eksempel på ønsket logikk:

```sql
DELETE FROM cron.job_run_details
WHERE end_time < now() - interval '24 hours';

DELETE FROM net._http_response
WHERE created < now() - interval '1 hour';
```

4. Rydd historiske rader én gang
   - Kjør samme migrasjon med en engangsopprydding slik at dagens store tabeller krymper på radnivå umiddelbart.
   - Dette frigjør ikke nødvendigvis all diskplass fysisk med én gang, men reduserer tabellinnholdet og fremtidig vekst.

5. Vurder SafeSky-frekvens etterpå
   - Siden `safesky-beacons-norway` og `safesky-cron-refresh` kjører svært ofte, bør vi vurdere om 10/15 sekunder er nødvendig i produksjon.
   - Hvis ikke, kan vi senere øke intervallene, f.eks. til 30–60 sekunder, for å redusere loggvolum og Edge Function-trafikk.
   - Jeg foreslår å ikke endre SafeSky-frekvens i første runde uten at vi vet om live-trafikkkravene tillater det.

Tekniske endringer:
- Ny Supabase-migrasjon som:
  - `cron.unschedule('cleanup-cron-logs')` hvis den finnes.
  - Oppretter `cleanup-cron-logs` på nytt, f.eks. daglig kl. 04:00 UTC.
  - Sletter `cron.job_run_details` eldre enn 24 timer.
  - Sletter `net._http_response` eldre enn 1 time.
  - Utfører en engangsopprydding ved deploy.
- Ingen frontend-endringer nødvendig.
- Ingen endringer i RLS nødvendig, siden dette gjelder Supabase extension-tabeller for intern drift.