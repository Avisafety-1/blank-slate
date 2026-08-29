# Legg til batteri nummer 2 i logg-importen

Avgrenset endring: dagens serienummer-metode beholdes uendret, vi **legger til** `SERIAL.battery` og `SERIAL.battery2` og støtte for batteri nummer 2. Ingen omskriving av eksisterende flyt.

## Slik er det i dag (verifisert)

- Parseren leser allerede `BATTERY1.*` og `BATTERY2.*` (sykluser, fullCapacity, celleavvik, temp, spenning) og setter `isDualBattery` — men verdiene slås sammen til én rad.
- Serienummer leses kun fra `DETAILS.batterySN` / `DETAILS.batterySerial`. `SERIAL.battery` og `SERIAL.battery2` blir ikke etterspurt i feltlisten.
- `flight_logs` har bare ett sett batterikolonner, så batteri nummer 2 får ingen data. På M350 (31 logger, snitt 10 072 mAh) og M400 (37 logger, snitt 20 232 mAh) krediteres ett batteri kombinert kapasitet.

## Endringer

### 1. Be om de nye feltene (tillegg, ikke erstatning)

- Legg `SERIAL.battery` og `SERIAL.battery2` inn i feltlisten som sendes til dronelog-APIet i `process-dronelog`, `dji-process-single` og `dji-sync-worker`.
- Serienummer for batteri 1 velges slik: bruk `SERIAL.battery` hvis den finnes **og** er minst like komplett som `DETAILS.batterySN`; ellers brukes dagens verdi. Samme "aldri erstatt et lengre SN med et kortere"-prinsipp som allerede gjelder for droner i `droneLogMatching.ts`, så et fullt 20-tegns SN vinner over det avkortede 16-tegns.
- Finnes ikke de nye feltene i responsen, oppfører alt seg nøyaktig som i dag.

### 2. Batteri 2 gjennom hele kjeden

- Parseren returnerer i tillegg `battery2SN` ved siden av de allerede parsede `battery2Cycles`, `battery2FullCapacity`, `battery2CellDeviationMax`, `battery2MinVoltage`, `battery2TempMax`.
- Nye kolonner på `flight_logs` for batteri 2: `battery2_sn`, `battery2_cycles`, `battery2_full_capacity_mah`, `battery2_voltage_min_v`, `battery2_temp_max_c`, `battery2_cell_deviation_max_v`. Eksisterende kolonner rører vi ikke.
- Aggregatfeltene som allerede skrives (verste verdi / kombinert kapasitet) beholdes, slik at ingen eksisterende visning eller eksport endrer seg.

### 3. Automatch / opprett batteri 2 ved import

I `UploadDroneLogDialog` og `BatchLogPanel`, når loggen har to batterier:

- Vis batteri 2 som en egen rad med sitt serienummer, ved siden av dagens batterivalg.
- Automatch mot eksisterende utstyr på serienummer med samme prefiks-/eksakt-logikk som brukes for droner.
- Er serienummeret ukjent, tilbys "Opprett batteri" (serienummer forhåndsutfylt, selskap fra loggen) — så én logg kan gi to batterier.
- Brukeren kan velge manuelt eller hoppe over, som i dag.
- Loggbokføring skrives til begge valgte batterier.

### 4. Batterihelse

- Når et batteri matcher `battery2_sn`, brukes batteri 2 sine egne verdier (kapasitet, sykluser, celleavvik) — ikke den kombinerte kapasiteten.
- Pakkeantall-delingen beholdes uendret som fallback for logger uten per-pakke-data, inkludert all historikk.

## Teknisk oppsummering

Berørte filer: `supabase/functions/process-dronelog/index.ts`, `supabase/functions/dji-process-single/index.ts`, `supabase/functions/dji-sync-worker/index.ts`, `supabase/functions/_shared/dji-parser.ts`, `src/components/UploadDroneLogDialog.tsx`, `src/components/upload/BatchLogPanel.tsx`, `src/hooks/useBatteryHealth.ts`, i18n (no + en), samt én migrasjon som legger til `battery2_*`-kolonnene på `flight_logs`.

Feltnavnene verifiseres mot `/fields`-endepunktet før de låses. Ingen eksisterende felt, kolonne eller matchelogikk fjernes.
