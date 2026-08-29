# Hvorfor batteri 2 mangler serienummer — diagnostikk før flere endringer

## Hva loggene faktisk viser

Kun én logg er kommet inn etter at de nye feltene ble tatt i bruk (29.08 kl. 20:16, UASVOSS M350, `parser_used: dronelogapi`).

I `parsed_result` for den loggen:

- `battery2SN` finnes **ikke i det hele tatt** — nøkkelen skrives bare når verdien er satt, så `SERIAL.battery2` kom tom tilbake.
- `batterySN` = `6JYPL5KDA00017` (14 tegn) — altså fortsatt den gamle `DETAILS`-verdien. Ingen `SERIAL.battery` heller (ellers hadde vi sett et lengre SN).
- `serialAircraftSN` er også tom, mens `aircraftSerial` = `1581F6GKB2373004` — samme mønster: `SERIAL.*`-feltene ser ut til å komme tomme for denne loggen.
- Per-pakke telemetri **virker**: `battery1MinVoltage` 40.24 / `battery2MinVoltage` 40.34, `battery1TempMax` 27.7 / `battery2TempMax` 27.7, `isDualBattery: true`, `battery1Cycles: 47`.
- Kapasitet mangler helt i denne loggen (`batteryFullCapacity`, `battery1FullCapacity`, `battery2FullCapacity` alle tomme), og `battery2Cycles` mangler.

Konklusjon: rørene fram til databasen fungerer (BATTERY1/BATTERY2 leses og lagres), men DroneLog ga ingen verdi for `SERIAL.battery` / `SERIAL.battery2` på denne M350-loggen. Vi vet ennå ikke om det er fordi feltnavnet avvises, fordi kolonnen kom med men tom, eller fordi loggen (M350 med TB65) rett og slett ikke inneholder pakke-serienumre.

## Neste steg

1. **Rå-diagnostikk i `process-dronelog`:** logg hvilke `SERIAL.*`- og `BATTERY2.*`-kolonner som faktisk finnes i CSV-headeren fra DroneLog, og de første ikke-tomme verdiene deres. Da skiller vi «feltet ble ikke levert» fra «feltet ble levert tomt».
2. **Kjør én ny logg** (samme M350, og gjerne én M400/FlyCart) gjennom importen og les diagnostikken i edge-loggene.
3. **Basert på svaret:**
   - Kommer kolonnen tom → DJI-loggen har ikke pakke-SN; da faller vi tilbake til å identifisere pakke 2 via kapasitet/pakkeantall som i dag, og lar brukeren velge/opprette batteri 2 manuelt i importdialogen (UI-en for dette finnes allerede).
   - Kommer kolonnen ikke i det hele tatt → feltnavnet avvises av APIet; vi verifiserer mot `/fields`-endepunktet og retter navnet.
4. **Kapasitet mangler** i denne loggen selv for pakke 1 — sjekkes i samme diagnostikkrunde (`BATTERY1.fullCapacity [mAh]` vs `BATTERY.fullCapacity [mAh]`), siden batterihelse-KPI-en avhenger av den.

## Teknisk

- `supabase/functions/process-dronelog/index.ts`: midlertidig `console.log` av header-treff for `SERIAL.battery`, `SERIAL.battery2`, `SERIAL.aircraft`, `BATTERY1.fullCapacity [mAh]`, `BATTERY2.fullCapacity [mAh]`, `BATTERY2.timesCharged` + første ikke-tomme verdi per kolonne. Ingen endring i lagring eller matching.
- Ingen migrasjon, ingen UI-endring i dette steget.
