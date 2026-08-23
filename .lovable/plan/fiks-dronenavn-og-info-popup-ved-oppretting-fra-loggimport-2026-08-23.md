# Fiks dronenavn og info-popup ved oppretting fra loggimport

## Problem 1 — dronenavn havner i «Modell»

Ved oppretting av drone fra loggimport-dialogen fylles feltet «Modell» med `aircraftName` (brukerens egendefinerte navn i DJI Fly, f.eks. «DJI Mini 5 Pro Rane») dersom det finnes, ellers modelltypen fra loggen.

Riktig oppførsel: `aircraftName` skal fylle feltet **Navn** (`dji_aircraft_name`), og **Modell** skal fylles med modelltypen fra loggen (`droneType`).

## Problem 2 — info-popup ved «Navn» klippes

Tooltip-innholdet ved «Navn» vises i dialogen og klippes i kanten, så teksten ikke er lesbar.

## Endringer

- `src/components/resources/AddDroneDialog.tsx`
  - Utvid `DroneDefaultValues` med `dji_aircraft_name?: string`.
  - Forhåndsutfyll `djiAircraftName` fra denne verdien når dialogen åpnes med defaults.
  - Tooltip ved «Navn»: legg til `collisionPadding` og `avoidCollisions`, side `top`, og bruk en bredde som ikke går utenfor dialogen (f.eks. `max-w-[260px]` med `break-words` og `z-50`), slik at hele teksten vises.
- `src/components/UploadDroneLogDialog.tsx`
  - `droneDefaultValues`: sett `modell: result?.droneType || ''` og `dji_aircraft_name: result?.aircraftName || ''` (i stedet for dagens `aircraftName || droneType` i modell).

Ingen endring i lagringslogikk, matching eller database.
