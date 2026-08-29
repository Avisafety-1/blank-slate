# Per-batteri-håndtering av droneloggene (erstatter "dual battery"-delingen)

Du har rett: når `SERIAL.battery` og `SERIAL.battery2` finnes, skal hver pakke behandles som sitt eget batteri, og pakkeantall-delingen blir overflødig for nye logger.

## Slik er det i dag (verifisert)

- CSV-parseren leser allerede `BATTERY1.*` og `BATTERY2.*` (sykluser, fullCapacity, celleavvik, temp, spenning) og setter `isDualBattery`.
- Vi ber i dag **ikke** om `SERIAL.battery` / `SERIAL.battery2` i feltlisten; vi leser kun `DETAILS.batterySN` / `DETAILS.batterySerial` — ett serienummer per logg.
- `dji-parse-proxy` mapper kun ett `f.battery`-objekt og `details.battery_sn` per frame.
- `flight_logs` har bare ett sett batterikolonner (`battery_sn`, `battery_cycles`, `battery_full_capacity_mah`, `battery_health_pct`, `battery_voltage_min_v`, `battery_temp_min_c`, `battery_temp_max_c`, `battery_cell_deviation_max_v`).
- Følge: på M350 (31 logger, snitt 10 072 mAh) og M400 (37 logger, snitt 20 232 mAh) får ett batteri kombinert kapasitet, og pakke nummer to får ingenting.

## Det som skal bygges

### 1. Hent begge serienumrene

- Legg `SERIAL.battery` og `SERIAL.battery2` (samt `BATTERY1/BATTERY2`-feltene vi allerede parser) inn i feltlisten som sendes til dronelog-APIet i `process-dronelog`, `dji-process-single` og `dji-sync-worker`.
- Utvid `dji-parse-proxy` slik at den mapper serienummer per pakke i stedet for kun `details.battery_sn`.
- Parseren returnerer en `batteries[]`-liste: `{ index, sn, cycles, fullCapacityMah, healthPct, voltageMin, tempMin, tempMax, cellDeviationMax }`. Ett element for enkeltbatteri, to for tomotors-droner.
- Feltnavnene verifiseres mot `/fields`-endepunktet før vi låser dem (dokumentasjonen vår lister foreløpig kun `SERIAL.aircraftSN`).

### 2. Lagre én rad per batteri

- Ny tabell `flight_log_batteries`: referanse til `flight_logs`, `battery_index`, `battery_sn`, `equipment_id` (nullbar), sykluser, full/nåværende kapasitet, helse, min spenning, temp min/maks, celleavvik. Selskapsisolering via RLS mot flyloggen, med GRANTs som for øvrige tabeller.
- `flight_logs` beholder dagens aggregerte felter uendret, slik at eksisterende visninger og eksport ikke brekker.

### 3. Automatch og opprettelse av begge batteriene ved import

I opplastingsdialogene (`UploadDroneLogDialog`, `BatchLogPanel`, ventende auto-sync-logger):

- Vis begge batteriene som hver sin rad med sitt serienummer.
- Hvert serienummer matches automatisk mot eksisterende utstyr (samme prefiks-/eksakt-logikk som for droner i `droneLogMatching.ts`).
- Er et serienummer ukjent, tilbys "Opprett batteri" med serienummer, modell foreslått fra dronetypen og selskapstilhørighet — slik at man kan ende opp med to nye batterier fra én logg.
- Brukeren kan også manuelt velge eksisterende batteri per rad, eller hoppe over.
- Flytid og loggbokføring skrives til begge valgte batterier, ikke bare det ene.

### 4. Batterihelse per batteri

- `useBatteryHealth` leser primært `flight_log_batteries` på serienummer; hvert batteri får sin egen kapasitet, sykluser og celleavvik. Ingen deling på pakkeantall.
- Fallback til `flight_logs` for historiske logger, der pakkeantall-logikken beholdes uendret slik at gammel historikk ikke hopper.
- "Antall batterier i pakken" i innstillingsdialogen blir merket som fallback for eldre logger, med forklarende tekst.

### 5. Historiske logger

- Ingen omskriving av gamle rader. De vises som i dag.
- Nye importer og fremtidig auto-sync bruker per-batteri-veien automatisk.

## Teknisk oppsummering

Berørte filer: `supabase/functions/process-dronelog/index.ts`, `supabase/functions/dji-process-single/index.ts`, `supabase/functions/dji-sync-worker/index.ts`, `supabase/functions/dji-parse-proxy/index.ts`, `supabase/functions/_shared/dji-parser.ts`, `src/components/UploadDroneLogDialog.tsx`, `src/components/upload/BatchLogPanel.tsx`, `src/components/PendingDjiLogsSection.tsx`, `src/lib/droneLogMatching.ts`, `src/hooks/useBatteryHealth.ts`, `src/lib/batteryHealth.ts`, batteridialogene under `src/components/resources/`, i18n (no + en), samt én migrasjon for `flight_log_batteries`.

Rekkefølge: felt-verifisering mot `/fields` → migrasjon → edge functions → import-UI → helseberegning.
