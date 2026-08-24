# Automatch på pilot: bruk dronetilknytning når det bare finnes én

## Dagens logikk (verifisert)

- Enkeltbehandling: pilot settes automatisk til innlogget bruker. Ved treff mot eksisterende flylogg hentes pilot fra `flight_log_personnel`. Dronetilknytning (`drone_personnel`) brukes kun visuelt — tilknyttede personer sorteres øverst og merkes.
- Batch: pilot per rad = loggens eier (`pending_dji_logs.user_id`), fallback til innlogget bruker.

## Endring

Når en drone har **nøyaktig én** tilknyttet person i `drone_personnel`, velges den personen automatisk som pilot.

Prioritering (høyest først):
1. Pilot brukeren selv har valgt manuelt — overstyres aldri.
2. Pilot fra en eksisterende flylogg loggen matches mot.
3. Dronens eneste tilknyttede person.
4. Innlogget bruker (enkelt) / loggens eier (batch).

Gjelder både enkeltbehandling og batch. Er det null eller flere enn én tilknyttet person, beholdes dagens oppførsel.

Når valget kom fra dronetilknytning vises en liten «auto-matchet»-markering ved pilotfeltet, slik som på drone/oppdrag.

## Teknisk

- `src/components/UploadDroneLogDialog.tsx`
  - Ny state `pilotTouched` som settes når brukeren endrer pilot manuelt.
  - Utvid effekten som henter `dronePersonnelIds` for valgt drone: når lista har lengde 1, `pilotTouched` er false og ingen pilot er hentet fra en matchet flylogg, sett `pilotId` til den ID-en.
  - `fetchMatchedPersonnel` beholder dagens prioritet (eksisterende logg vinner over tilknytning).
  - Ny state `pilotAutoMatchedFromDrone: boolean` som styrer badgen.
- `src/components/upload/BatchLogPanel.tsx`
  - Ny prop `personnelByDrone: Record<string, string[]>` (tilknyttede profiler per drone).
  - I rad-initialiseringen og når raden får ny drone: hvis dronen har nøyaktig én tilknyttet person og brukeren ikke har endret pilot på raden, settes `pilotId` til den. Ellers `log.user_id || defaultPilotId`.
  - Ny radtilstand `autoMatchedPilotId` for badgen, tilsvarende `autoMatchedDroneId`.
- Dialogen henter `drone_personnel` (`drone_id, profile_id`) for de aktuelle dronene når batch-panelet åpnes, og sender inn `personnelByDrone`.
- Nye i18n-nøkler for «auto-matchet fra dronetilknytning» i både `no.json` og `en.json`.
- Ingen databaseendringer.
