

# Fix: DroneLog-import overskriver planlagt rute med feil format

## Problem

Funksjonen `updateMissionRoute` (linje 347-349 i `UploadDroneLogDialog.tsx`) gjør to ting feil:

1. **Overskriver planlagt rute**: Den skriver flyposisjonene til `mission.route`, som er ment for den *planlagte* ruten — ikke den faktisk fløyne.
2. **Bruker feil format**: Den lagrer `[[lat, lng], [lat, lng], ...]` i stedet for `{ coordinates: [{lat, lng}, ...], totalDistance: ... }`, som er formatet kartet forventer.

Resultatet er at kartet bare klarer å vise ett enkelt punkt ("Flytur 1 – Slutt") fordi `route.coordinates` er `undefined` (formatet er feil), mens det faktiske flysporet allerede ligger korrekt i `flight_logs.flight_track`.

## Løsning

**Fjern `updateMissionRoute`-funksjonen og begge kallene til den.** Flysporet er allerede lagret i `flight_logs.flight_track` (med korrekt `{ positions: [...] }` format etter forrige fix). Kartet viser dette som "faktisk flydd rute" via `flightTracks`-propen.

**Fil: `src/components/UploadDroneLogDialog.tsx`**

1. **Linje 288**: Fjern kallet `await updateMissionRoute(matchedLog.mission_id, result.positions)`
2. **Linje 316**: Fjern kallet `await updateMissionRoute(mission.id, result.positions)`
3. **Linje 347-349**: Fjern hele `updateMissionRoute`-funksjonen

Dette bevarer eventuell planlagt rute som allerede finnes på oppdraget, og lar kartet vise flysporet som den faktisk fløyne ruten (via `flight_logs`).

## Teknisk detalj

Kartet har allerede to separate lag:
- **Planlagt rute** (blå stiplet linje): fra `mission.route.coordinates`
- **Faktisk flydd rute** (fargekodet etter høyde): fra `flight_logs.flight_track.positions`

Ved å slutte å overskrive `mission.route` vil begge vises korrekt.

