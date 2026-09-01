# Plan: Få DJI-filtreringen til å faktisk skjule importerte logger

## Hva som er galt

Filtreringen matcher på DJI/DroneLog sin numeriske logg-ID. Kontroll mot databasen viser at loggene i skjermbildet allerede ER importert, men med andre ID-er enn de listen nå returnerer:

- Listen viser 15.04.2026 19:00, 30.04.2026 17:05 og 02.06.2026 17:12.
- `flight_logs` for samme selskap har disse turene lagret med `dji_log_id` 675493345, 675493348 og 684406161 og tilsvarende `flight_date` (UTC).

ID-ene er altså ikke stabile på tvers av DroneLog-kontoer/nøkler (auto-synk med selskapsnøkkel vs. personlig brukernøkkel gir ulike ID-serier for samme fysiske flytur). Derfor slår eksakt ID-match bare til for logger som ble hentet med nøyaktig samme konto.

## Løsning

Behold ID-match som rask vei, men legg til en robust «samme flytur»-match basert på data vi allerede har i `flight_logs`:

1. **Serverside (`process-dronelog`, `annotateDjiImportStates`)**
   - Fortsatt eksakt match på `dji_log_id`.
   - I tillegg: hent selskapets `flight_logs` (`flight_date`, `start_time_utc`, `flight_duration_minutes`, `dji_log_id`) innenfor tidsrommet listen dekker, og bygg en signatur per flytur.
   - En logg fra DJI regnes som `imported` når starttidspunktet matcher en eksisterende flylogg innenfor ±3 minutter og varigheten er innenfor ±2 minutter.
   - Samme signaturmatch brukes også mot `pending_dji_logs` (via lagret starttidspunkt der det finnes) for `pending`-status.
   - Selskapsomfanget utvides til brukerens synlige selskaper (moder/avdeling) i stedet for kun `profiles.company_id`, slik at avdelingsimporterte logger også regnes som kjente.

2. **Selvlæring av ID**
   - Når en logg matches via signatur og flyloggen mangler `dji_log_id`, skrives listens ID inn på flyloggen. Neste gang blir det eksakt ID-match, og matchingen blir raskere og sikrere over tid.

3. **UI**
   - Ingen strukturelle endringer. Badgen «Importert» vises som i dag, og «Kun nye logger» skjuler nå også signaturmatchede logger.
   - Legg til en liten forklaring i tomtilstanden når alle logger er skjult.

## Teknisk

- Kun `supabase/functions/process-dronelog/index.ts` endres i backend (pluss eventuelt små i18n-nøkler).
- Ingen databasemigrasjon, ingen endring av tilgangsregler eller RLS. Selvlæringen skriver kun `flight_logs.dji_log_id` der feltet er tomt, via service-role i samme selskapskontekst.
- Toleransene (±3 min start, ±2 min varighet) legges som konstanter slik at de er lette å justere.

## Verifisering

- Logg inn mot DJI-sky i preview og bekreft at de tre kjente turene (15.04, 30.04, 02.06) forsvinner fra standardlisten.
- Skru på «Se alle» og bekreft at de vises med «Importert»-badge og ikke kan velges.
- Bekreft i databasen at `dji_log_id` fylles ut på tidligere tomme flylogger etter første listing.
