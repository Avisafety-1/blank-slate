# Unik identifikasjon av droner i flylogger (Elverum vgs)

## Bekreftet nåsituasjon

- Elverum vgs har 8 DJI Mini 5 registrert med fulle 20-tegns serienumre, men DroneLog API leverer kun de 16 første tegnene i loggen. Det gir kollisjoner:
  - `1581F9DEC2584029` → DM5P-01 og DM5P-02 (120 logger)
  - `1581F9DEC259D029` → DM5P-05, DM5P-06 og DM5P-07 (38 logger)
  - `259A029` (DM5P-03) og `259B029` (DM5P-04) er entydige i dag.
- `parsed_result` i loggene inneholder i dag kun `aircraftSN`, `aircraftName`, `batterySN`, `droneType` som identifiserende felt.
- `aircraftName` er «DJI Mini 5 Pro» på alle Elverum-loggene — altså standardnavnet, ikke satt per drone.
- DroneLog API tilbyr flere felter vi **ikke** ber om i dag: `DETAILS.fcSN` (flight controller), `DETAILS.cameraSN`, `DETAILS.gimbalSN`, `DETAILS.rcSN` og `SERIAL.aircraftSN`. Feltlista i `process-dronelog` inneholder ingen av disse.
- DM5P-08 er lagret med serienummer `1591F9DEC259D029Y2FS` — «1591» skiller seg fra «1581» på alle andre og ser ut som en tastefeil; den vil aldri matche.

## Løsning

### 1. Hent flere identifikatorer fra loggen (hovedgrepet)

Utvid feltlista mot DroneLog API med `DETAILS.fcSN`, `DETAILS.cameraSN`, `DETAILS.gimbalSN`, `DETAILS.rcSN` og `SERIAL.aircraftSN`, og lagre dem i `parsed_result`. Flight controller-serienummeret er unikt per luftfartøy og er ikke avkortet på samme måte som DJIs aircraft-SN. Første steg er en verifisering: kjør noen av Elverum-loggene på nytt og kontroller at `fcSN` faktisk kommer med og er forskjellig for de kolliderende dronene, før matchingen bygges på det.

### 2. Nye identifikatorfelt på dronekortet

Legg til `flight_controller_sn` (og `camera_sn`) på drone, redigerbart i «Rediger drone». Matchelogikken i `droneLogMatching.ts` prøver i rekkefølge:
1. Eksakt `fcSN` → entydig treff
2. Eksakt aircraft-SN
3. Prefiks-match på aircraft-SN (dagens oppførsel), med tilknyttet personell som tiebreaker

### 3. Selvlærende kobling

Når brukeren manuelt velger drone på en logg som ikke kunne automatches, lagres loggens `fcSN` på den valgte dronen (etter bekreftelse). Da automatches alle framtidige logger fra samme luftfartøy — Elverum trenger å velge manuelt én gang per drone.

### 4. Batteri som støttesignal, ikke nøkkel

`batterySN` finnes allerede i loggene og er unikt per batteri, men på en skole roterer batteriene mellom droner. Det brukes derfor bare som svakt hint (rangering av forslag), ikke som match-nøkkel.

## Svar på spørsmålet om DJI-siden

- **Endre navn på selve loggfilen har ingen effekt** for automatisk matching i dag — filnavnet leses ikke, og DJI genererer navnet ut fra dato/tid.
- **Det som virker fra DJI-siden:** gi hver drone et unikt kallenavn i DJI Fly / Pilot 2 (f.eks. «DM5P-01»). Navnet skrives inn i loggen som `DETAILS.aircraftName` og hentes allerede ut. Dette er det enkleste umiddelbare tiltaket for Elverum og krever ingen kodeendring for å bli synlig i loggene — kun at matchingen også ser på navnet (dekkes av punkt 2).
- Selve serienummeravkortingen kan ikke endres i DJI-innstillingene; den ligger i loggformatet.

## Teknisk

- `supabase/functions/process-dronelog/index.ts`: utvid feltlista og CSV-header-uttrekket med de nye `DETAILS.*`- og `SERIAL.*`-feltene; ta dem med i returobjektet (`fcSN`, `cameraSN`, `gimbalSN`, `rcSN`).
- Migrasjon: nye kolonner `flight_controller_sn`, `camera_sn` på `drones` (nullable, indeksert per selskap).
- `src/lib/droneLogMatching.ts`: ny `findDroneMatches` med prioritert nøkkelrekkefølge (fcSN → eksakt SN → kallenavn → prefiks + tiebreaker); brukes av både `UploadDroneLogDialog` og `BatchLogPanel`.
- UI: identifikatorfelt i drone-redigering, «husk denne dronen for dette luftfartøyet»-valg ved manuell match, i18n-nøkler i `no.json` og `en.json`.
- Datarydding: bekreft med Elverum om `1591F9DEC259D029Y2FS` skal rettes til `1581...`.
