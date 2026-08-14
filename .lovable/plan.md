# Batch-logging: samme automatch-logikk som ved enkeltbehandling

## Bakgrunn

I dag bruker batch-panelet og enkeltbehandlingen to ulike kodeveier:

- **Drone**: enkeltbehandling bruker `findSnMatches` i `UploadDroneLogDialog.tsx`, som håndterer forkortede DJI-serienumre (16 vs. 20 tegn) og bruker brukerens dronetilknytning (`drone_personnel`) som tiebreaker. Batch-panelet bruker kun `matched_drone_id` som er satt server-side, uten tiebreaker — deler to droner samme SN-prefiks, kan feil drone bli forhåndsvalgt.
- **Oppdrag**: batch-panelet slår opp oppdrag samme dag med `new Date(parsed.startTime)`, mens enkeltbehandlingen bruker `parseFlightDate()` som også takler DJI-datoformater `new Date()` ikke forstår. Batch faller heller ikke tilbake på `flight_date` når datoen ikke kan tolkes.

## Hva som gjøres

1. **Felles matchelogikk i ett bibliotek**
   Flytt `snMatchesDjiSn`, `parsedSnIsMoreComplete`, `findSnMatches` og `parseFlightDate` ut av `UploadDroneLogDialog.tsx` til en ny delt fil, og bruk den i både dialogen og `BatchLogPanel`. Ingen atferdsendring i enkeltbehandlingen.

2. **Dronematch i batch**
   For hver rad i batch-panelet kjøres SN-matching på nytt lokalt mot dronelista:
   - Nøyaktig SN-treff vinner.
   - Ved flere prefiks-treff prioriteres droner som er tilknyttet **loggens eier** (`pending_dji_logs.user_id`), deretter innlogget bruker — samme prioritering som i enkeltbehandlingen.
   - Er det fortsatt flere treff, forhåndsvelges ingen drone (brukeren velger selv), i stedet for å bruke et vilkårlig serverforslag.
   - «auto-matchet»-merket vises kun når valget faktisk kom fra automatikken.

3. **Oppdragsmatch i batch**
   Bruk `parseFlightDate` på `parsed.startTime` med fallback til `log.flight_date`, samme dagsvindu (lokal tid 00:00–23:59) og sortering på nærmeste tidspunkt som i enkeltbehandlingen. Nærmeste oppdrag forhåndsvelges, brukerens eget valg overstyrer alltid.

## Teknisk

- Ny fil `src/lib/droneLogMatching.ts` med de fire hjelpefunksjonene; `UploadDroneLogDialog.tsx` importerer dem i stedet for lokale definisjoner.
- `BatchLogPanel` får to nye props: `myDroneIds: string[]` og en oppslagsstruktur `droneIdsByProfile: Record<string, string[]>` for loggeiernes tilknytninger. Dialogen henter disse fra `drone_personnel` (`profile_id` for innlogget bruker + eierne av de valgte loggene) når batch-panelet åpnes.
- Rad-initialiseringen i `BatchLogPanel` bytter `log.matched_drone_id || ""` mot resultatet av `findSnMatches(drones, log.aircraft_sn ?? parsed.aircraftSN, preferredIds)`, med `matched_drone_id` kun som fallback ved nøyaktig ett treff.
- Ny radtilstand `autoMatchedDroneId` styrer «auto-matchet»-badgen på drone-feltet, tilsvarende dagens `autoMatchedMissionId`.
- Ingen databaseendringer; ingen endring i edge-funksjonene.
