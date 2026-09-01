# Plan: Få DJI-filtreringen til å faktisk skjule importerte logger

## Hvorfor ID-en ikke matcher

Selv om det er samme DJI-konto, er den numeriske logg-ID-en ikke DJI sin ID — den tilhører DroneLog-kontoen/API-nøkkelen som listet loggen. Etter overgangen til personlige DroneLog-nøkler per bruker får samme fysiske flytur ny ID.

Kontroll mot databasen bekrefter dette: loggene i skjermbildet er allerede importert, men med andre ID-er enn listen nå returnerer.

- Listen viser 15.04.2026 19:00, 30.04.2026 17:05 og 02.06.2026 17:12.
- `flight_logs` for selskapet har samme turer lagret med `dji_log_id` 675493345, 675493348 og 684406161 og tilsvarende `flight_date` (UTC).

Eksakt ID-match slår derfor bare til når loggen ble hentet med nøyaktig samme DroneLog-nøkkel som ved importen.

## Løsning

Behold ID-match som rask vei, og legg til en stabil «samme flytur»-match:

1. **Filnavn som primær nøkkel**
   - DJI-filnavnet (`DJIFlightRecord_2026-06-02_[17-12-51].txt`) er stabilt uavhengig av DroneLog-konto.
   - Legg til nullable kolonne `flight_logs.dji_file_name` og lagre filnavnet ved alle DJI-importer (enkelt, bulk og batch).
   - Ingen endring i tilgangsregler; ingen andre kolonner berøres.

2. **Signaturmatch for eksisterende importer (uten filnavn)**
   - Serverside i `process-dronelog` (`annotateDjiImportStates`): hent selskapets flylogger (`flight_date`, `start_time_utc`, `flight_duration_minutes`, `dji_log_id`, `dji_file_name`).
   - En logg regnes som `imported` når starttidspunkt matcher innenfor ±3 minutter og varighet innenfor ±2 minutter.
   - Samme logikk brukes mot `pending_dji_logs` for `pending`-status.
   - Selskapsomfanget utvides fra kun `profiles.company_id` til brukerens synlige selskaper, slik at avdelingsimporterte logger også regnes som kjente.

3. **Selvlæring**
   - Når en logg matches via filnavn eller signatur, skrives listens `dji_log_id` og filnavn inn på flyloggen dersom feltene er tomme. Neste gang blir det eksakt match.

4. **UI**
   - Ingen strukturelle endringer: «Kun nye logger» skjuler nå også filnavn-/signaturmatchede logger, og «Se alle» viser dem med «Importert»-badge (ikke valgbare).

## Teknisk

- Migrasjon: kun ny nullable kolonne `flight_logs.dji_file_name` + indeks på `(company_id, dji_file_name)`. Ingen RLS-endringer.
- Kode: `supabase/functions/process-dronelog/index.ts`, importstiene i `src/components/UploadDroneLogDialog.tsx` og `BatchLogPanel.tsx`, samt eventuelle i18n-nøkler.
- Toleransene (±3 min start, ±2 min varighet) legges som konstanter.

## Verifisering

- Logg inn mot DJI-sky i preview og bekreft at turene 15.04, 30.04 og 02.06 forsvinner fra standardlisten.
- Skru på «Se alle» og bekreft «Importert»-badge og at radene ikke kan velges.
- Bekreft i databasen at `dji_log_id`/`dji_file_name` fylles ut på tidligere tomme flylogger etter første listing.
