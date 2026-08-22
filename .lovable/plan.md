# Mer informasjon i flyanalysen (identifikatorer + ekstra data)

## Bekreftet nåsituasjon

- `flight_logs` lagrer allerede felt som **ikke vises** i analysedialogen: `aircraft_serial`, `battery_sn`, `drone_model`, `battery_cycles`, `battery_health_pct`, `battery_full_capacity_mah`, `start_time_utc`/`end_time_utc`, `dronelog_sha256`, `dronelog_warnings`, `entry_source`.
- `useOppdragData.ts` henter allerede alle disse kolonnene, men `MissionCard` sender bare et utvalg videre til `FlightAnalysisDialog`, og `FlightSummaryPanel` viser kun flytid, hastighet, batteri, datapunkter, distanse, høyde, GPS, batteritemp, spenning og celleavvik.
- `batterySummary` (sykluser, helse, kapasitet) sendes kun fra dronens loggbok — ikke fra oppdragskortet eller oppdragsdialogen.
- `flight_track` inneholder kun `positions` — all metadata ligger i kolonner, så ingenting går tapt ved å hente mer fra raden.
- Parsede logger har i tillegg `guid`, `droneType`, `aircraftName`, `batteryStatus`, `minGpsSatellites`, `batteryReadings` i `parsed_result`, og de nye maskinvarefeltene (`fcSN`, `rcSN`, `cameraSN`, `gimbalSN`) lagres i dag kun på ventende logger — ikke på selve flyloggen.

## Hva som bygges

### 1. Ny seksjon «Logg­detaljer» i flyanalysen
En sammenleggbar seksjon nederst i oppsummeringen (lukket som standard) med:
- **Drone**: modell fra loggen, dronenavn fra loggen (`aircraftName`)
- **Serienummer fly** (`aircraft_serial`) — tydelig, med kopier-knapp
- **Sensor-/maskinvareserienumre** når de finnes: flykontroller, fjernkontroll, kamera, gimbal
- **Batteri**: serienummer, sykluser, helse %, full kapasitet mAh
- **Logg**: kilde (DJI-sky / manuell opplasting / ArduPilot), start-/sluttidspunkt UTC og lokal tid, filens SHA256 (forkortet, kopierbar), logg-GUID

Felt uten verdi skjules, så Mini 5-logger uten sensor-SN får ikke tomme rader.

### 2. Flere målte verdier i oppsummeringen
Legges til der data finnes: gjennomsnittsfart, maks vindstyrke fra loggens værkolonner, maks avstand fra hjemmepunkt, høyeste MSL-høyde, antall flymodus-endringer, samt varsel-antall fra `dronelog_warnings`.

### 3. Samme data alle steder
Oppdragskortet, oppdragsdialogen og dronens loggbok sender identisk datasett inn i dialogen, slik at «Analyser» viser like mye uansett hvor den åpnes (i dag mangler batteriseksjonen utenfor loggboken).

### 4. Lagre maskinvare-identifikatorer på flyloggen
Ny jsonb-kolonne `log_identifiers` på `flight_logs` fylles ved prosessering med `fcSN`, `rcSN`, `cameraSN`, `gimbalSN`, `aircraftName`, `droneType` og `guid`. Gjelder nye logger; eldre logger viser bare det som allerede er lagret i kolonner.

## Teknisk

- Migrasjon: `ALTER TABLE public.flight_logs ADD COLUMN log_identifiers jsonb;` (ingen nye GRANTs nødvendig — tabellen finnes).
- `supabase/functions/process-dronelog`, `dji-process-single` og `dji-sync-worker`: skriv `log_identifiers` ved innsetting av flylogg.
- `src/components/dashboard/FlightSummaryPanel.tsx`: utvid `FlightSummary`-typen med identifikator- og loggfelt, ny `Collapsible`-seksjon med kopier-knapp (`navigator.clipboard`).
- `src/components/dashboard/FlightAnalysisDialog.tsx`: send `batterySummary` videre uansett kilde.
- `src/components/oppdrag/MissionCard.tsx`, `src/components/dashboard/MissionDetailDialog.tsx`, `src/components/resources/DroneLogbookDialog.tsx`: felles hjelpefunksjon `buildFlightAnalysisTrack(log)` i `src/lib/` som bygger `positions/events/summary/batterySummary` likt alle steder.
- Nye i18n-nøkler i både `no.json` og `en.json`.
