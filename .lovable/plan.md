# Hent en rå DJI-loggfil fra Elverum for manuell testing

## Situasjonen

Alle 145 synkejobber for Elverum vgs har status `done` — det finnes altså ingen ubehandlet logg som ligger og venter. Jobbene har en lagret `download_url`, men DJI-lenkene er signerte og tidsbegrensede, så gamle URL-er kan ikke lastes ned direkte nå. For å få tak i en rå fil må vi logge inn på nytt mot DJI-kontoen (krypterte passord finnes lagret for tre Elverum-brukere, blant annet ELVIS-kontoen med autosync på) og hente en fersk nedlastingslenke.

## Slik gjør vi det

1. Lag en midlertidig, superadmin-beskyttet edge-funksjon `dji-fetch-raw-log` som:
   - tar imot `user_id` (DJI-innlogging) og eventuelt `dji_log_id`
   - dekrypterer passordet med eksisterende `decryptPassword`, logger inn mot DJI-skyen
   - lister siste logger og laster ned valgt fil (ofte `.txt`, noen ganger `.zip`)
   - pakker ut `.txt` fra zip om nødvendig
   - laster filen opp til en privat storage-mappe og returnerer en signert nedlastingslenke (1 time)
2. Kjør funksjonen én gang mot ELVIS-kontoen for den nyeste loggen, og gi deg lenken i chatten så du kan laste ned `.txt`-filen og teste den direkte på dronelogapi sin testside.
3. Hvis du vil ha flere logger (f.eks. én fra hver av de kolliderende Mini 5-dronene), henter vi 2–3 i samme runde.
4. Etter testen kan funksjonen fjernes eller beholdes som et superadmin-verktøy — du velger.

## Teknisk

- Ny funksjon i `supabase/functions/dji-fetch-raw-log/index.ts`, gjenbruker `downloadLogBytes`, `decryptPassword` og innloggingslogikken fra `_shared/dji-parser.ts` / `dji-sync-worker`.
- Ingen parsing mot DroneLog-API-et — vi rører kun rå fil, så ingenting skrives til `flight_logs` eller `pending_dji_logs`.
- Filen legges i eksisterende privat bucket under en `dji-raw/`-prefiks, slettes manuelt etterpå.
- Tilgang låses til Avisafe-superadmin via JWT-sjekk; ingen endring i eksisterende synkeflyt.
