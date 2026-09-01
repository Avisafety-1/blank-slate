# Hvorfor DJI-loggene ikke filtreres bort

## Funn (verifisert)

- Databasen er i orden: flyloggene fra skjermbildet ligger i `flight_logs` med både `dji_log_id` og `dji_file_name` (f.eks. `DJIFlightRecord_2023-04-01_[14-36-31].txt`, `DJIFlightRecord_2023-04-18_[10-09-14].txt`) på riktig selskap (samme selskap som support-brukeren).
- Edge-loggene viser at `dji-list-logs` kjører fint (`upstream=200` flere ganger i dag), men **diagnoselinjen fra annoteringen mangler helt**. Den logges alltid når annotering faktisk kjører.
- Årsak: i `process-dronelog` plukkes listen ut kun hvis svaret er `data.result` som array, `data.logs` som array, eller selve svaret som array. DroneLog svarer med logglisten nøstet (`result.logs`), som frontend allerede håndterer (`const r = data.result || data; Array.isArray(r) ? r : r.logs`). Backend treffer ingen av sine tre tilfeller, får en tom liste, returnerer tidlig — og ingen logg får `importState`. Derfor er alt "importable" i UI-et og ingenting skjules.

## Fiks

1. I `supabase/functions/process-dronelog/index.ts`: gjenbruk samme uthenting som frontend — finn logglisten i `data.result` (array), `data.result.logs`, `data.result.data`, `data.logs`, `data.data` eller `data` selv, og skriv den annoterte listen tilbake på nøyaktig samme plass som den ble hentet fra (så responsformatet er uendret).
2. Legg til en kort diagnoselinje som logger hvor listen ble funnet og antall logger, slik at dette kan bekreftes i edge-loggene neste gang.
3. Behold all eksisterende logikk uendret: `sessionKeySource`, feilhåndtering, 429-håndtering, matching på ID/filnavn/signatur og selvlæring.

## Verifisering

- Kjør typecheck (`deno check` for funksjonen).
- Etter deploy: åpne DJI-listen på nytt og bekreft i edge-loggene at annoteringen rapporterer antall "kjente" logger, og at 01.04.2023- og 18.04.2023-turene skjules som standard og vises med "Importert"-merke når "Se alle" er på.

Ingen databaseendringer, ingen endringer i tilgangsregler.
