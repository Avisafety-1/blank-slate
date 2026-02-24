

# Plan: Utvid DroneLog-data med dato/tid, feilmeldinger og batteridetaljer

## Dagens situasjon

Edge-funksjonen henter kun 7 felter: `OSD.latitude`, `OSD.longitude`, `OSD.altitude [m]`, `OSD.height [m]`, `OSD.flyTime [ms]`, `OSD.hSpeed [m/s]`, `BATTERY.chargeLevel [%]`. Resultatet viser flytid, maks hastighet, min batteri og datapunkter -- men mangler dato/klokkeslett, droneinfo, batteridetaljer og feilmeldinger.

## Nye felter fra DroneLog API

Legger til disse i `FIELDS`-konstanten:

| Felt | Hva det gir |
|---|---|
| `CUSTOM.dateTime` | Dato og klokkeslett per datapunkt |
| `DETAILS.startTime` | Starttidspunkt for flyturen |
| `DETAILS.aircraftName` | Dronens navn |
| `DETAILS.aircraftSN` | Dronens serienummer |
| `DETAILS.droneType` | Dronetype |
| `DETAILS.totalDistance [m]` | Total flydistanse |
| `DETAILS.maxAltitude [m]` | Maks oppnådd høyde |
| `DETAILS.maxHSpeed [m/s]` | Maks hastighet (fra metadata) |
| `BATTERY.temperature [°C]` | Batteritemperatur |
| `BATTERY.totalVoltage [V]` | Total spenning |
| `BATTERY.current [A]` | Strøm |
| `BATTERY.loopNum` | Antall ladesykluser |
| `OSD.gpsNum` | Antall GPS-satellitter |
| `OSD.flycState` | Flygkontrolltilstand (feilmeldinger) |
| `APP.warn` | App-advarsler/feilmeldinger |

## Endringer

### 1. `supabase/functions/process-dronelog/index.ts`

- Utvide `FIELDS`-konstanten med de nye feltene
- Parse nye kolonner i `parseCsvToResult`: dato/tid, batteritemp, spenning, GPS-satellitter, flycState, app-advarsler
- Trekke ut `DETAILS.*` fra første rad (disse er metadata, samme verdi på alle rader)
- Generere nye warnings basert på:
  - `BATTERY.temperature` over 50°C
  - `OSD.gpsNum` under 6 satellitter
  - `OSD.flycState` som inneholder feilkoder (GoHome, Landing, etc.)
  - `APP.warn` ikke-tomme verdier
- Utvide returverdien med nye felter: `startTime`, `aircraftName`, `aircraftSN`, `droneType`, `totalDistance`, `maxAltitude`, `batteryTemperature`, `batteryVoltage`, `batteryCycles`, `minGpsSatellites`, `flightErrors`

### 2. `src/components/UploadDroneLogDialog.tsx`

- Utvide `DroneLogResult`-interfacet med de nye feltene
- Resultatsiden utvides fra 2x2 grid til mer informativt oppsett:
  - **Topprad**: Dato/klokkeslett for flyturen (fra `startTime` eller `CUSTOM.dateTime`)
  - **Droneinfo**: Navn, serienummer, type (hvis tilgjengelig)
  - **Eksisterende KPIer**: Flytid, maks hastighet, min batteri, datapunkter
  - **Nye KPIer**: Total distanse, maks høyde, batteritemp, GPS-satellitter, ladesykluser
  - **Advarsler**: Eksisterende + nye (høy temp, lavt GPS-signal, flycontroller-feil, app-advarsler)
- Bruke `startTime` for bedre matching mot eksisterende flylogger (dato-match i tillegg til varighet)

## Tekniske detaljer

- `DETAILS.*`-felter er metadata som gjentas på hver rad -- vi trenger bare lese dem fra rad 1
- `CUSTOM.dateTime` gir ISO-format tidsstempel per datapunkt, brukes for start/slutt-tid
- `OSD.flycState` returnerer strenger som "AutoLanding", "GoHome", "Atti" etc. -- disse fanges som advarsler
- `APP.warn` kan være tom streng eller inneholde feilmeldinger fra DJI-appen

