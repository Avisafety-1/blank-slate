# Per-batteri-data fra droneloggen (i stedet for "dual battery")

Du har rett i premisset. Slik ser dagens kode og data faktisk ut:

- CSV-parseren i `process-dronelog` leser allerede `BATTERY1.*` og `BATTERY2.*` hver for seg (sykluser, fullCapacity, celleavvik, temp, spenning) og setter et `isDualBattery`-flagg.
- Men **databasen har bare ett sett batterikolonner** på `flight_logs`: `battery_sn`, `battery_cycles`, `battery_full_capacity_mah`, `battery_health_pct`, `battery_voltage_min_v`, `battery_temp_min_c`, `battery_temp_max_c`, `battery_cell_deviation_max_v`. Per-pakke-verdiene parseres og kastes.
- Opplastingen (`BatchLogPanel`, `UploadDroneLogDialog`) slår sammen to pakker til én rad: verste spenning/temp/sykluser, laveste kapasitet, og `BATTERY.fullCapacity` som er *summen* av pakkene.
- Serienummeret kommer fra ett enkelt felt (`DETAILS.batterySN`). I databasen har hver logg nøyaktig ett `battery_sn` — også for M350 (31 logger, snitt 10 072 mAh) og M400 (37 logger, snitt 20 232 mAh).
- `dji-parse-proxy` (dronelog-API-veien) mapper kun ett `f.battery`-objekt og `details.battery_sn` per frame — den leser ikke en eventuell liste med batterier.

Konsekvens i dag: på tomotors-droner får **ett** batteri kreditert kombinert kapasitet (derav 120 % helse), og **det andre batteriet får ingen data i det hele tatt**. "Dual battery"-delingen jeg la inn er en korreksjon av symptomet, ikke av årsaken.

Ikke verifisert ennå: om dronelog-APIet faktisk leverer serienummer per pakke. Det avgjør hvor langt vi kan gå, og er derfor første steg.

## Steg 1 – Verifiser hva APIet leverer (ingen produksjonsendring)

- Hent feltlisten fra dronelog-APIet (`GET /fields`, allerede implementert som health-check i `process-dronelog`) og se etter batteri-array eller `BATTERY1/BATTERY2`-serienumre.
- Kjør en kjent M350/M400-logg gjennom parseren i diagnosemodus og les de eksisterende `[DIAG] Unique battery SN values`-loggene i edge function-loggene.

Utfallet bestemmer 2A eller 2B.

## Steg 2A – APIet gir SN per pakke (ønsket løsning)

Én flytur skal skrive **én rad per batteri**.

- Ny tabell `flight_log_batteries`: kobling til `flight_logs`, `battery_index` (1/2), `battery_sn`, `cycles`, `full_capacity_mah`, `current_capacity_mah`, `health_pct`, `voltage_min_v`, `temp_min_c`, `temp_max_c`, `cell_deviation_max_v`. Selskaps-isolasjon arves fra flyloggen via RLS, med GRANTs som for øvrige tabeller.
- `process-dronelog` og `dji-parse-proxy` returnerer en `batteries[]`-liste i stedet for bare aggregatet.
- Opplastingsflytene skriver radene, og beholder dagens felt på `flight_logs` som aggregat for bakoverkompatibilitet.
- Batterihelse (`useBatteryHealth`) matcher på `flight_log_batteries.battery_sn` og faller tilbake til `flight_logs.battery_sn` for gamle logger. Hvert batteri får da sin egen kapasitet, sykluser og celleavvik — ingen deling på pakkeantall.
- "Antall batterier i pakken" beholdes kun som fallback for historiske logger, med tekst som forklarer at nye logger bruker per-batteri-data.

## Steg 2B – APIet gir bare ett SN for begge pakkene

- Behold per-pakke-målinger (kapasitet, sykluser, celleavvik) fra `BATTERY1/BATTERY2` i egne kolonner, men uten separat serienummer kan de ikke tilskrives to forskjellige utstyrsrader.
- Da beholdes pakkeantall-delingen som i dag, men helsen regnes ut fra den *enkelte pakkens* `BATTERY1.fullCapacity` når den finnes — mer presist enn å dele summen.
- Vi noterer i dialogen at DJI-loggen ikke skiller serienummer på tomotors-droner.

## Migrering av eksisterende data

- Gamle logger endres ikke. Helsen for disse regnes fortsatt ut med pakkeantall-logikken, slik at historikken ikke hopper.

## Teknisk oppsummering

Berørte filer: `supabase/functions/process-dronelog/index.ts`, `supabase/functions/dji-parse-proxy/index.ts`, `src/components/upload/BatchLogPanel.tsx`, `src/components/UploadDroneLogDialog.tsx`, `src/hooks/useBatteryHealth.ts`, `src/lib/batteryHealth.ts`, batteridialogene under `src/components/resources/`, samt en migrasjon for 2A.
