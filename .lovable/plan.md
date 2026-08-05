# Match drone ut fra loggens eier, ikke innlogget bruker

## Bekreftet årsak

To droner deler samme 16-tegns SN-prefiks fra DJI-loggen (`1581F9DEC2584029`):

- `DJI Mini 5 Martin Madsbu` (`...4JC0`) — tilknyttet Martin Sunnevåg Madsbu
- `DJI Mini 5 Sverre` (`...4G1L`) — tilknyttet Sverre Rasmussen

Alle ventende logger med dette SN-et har `matched_drone_id` satt til Martin sin drone — også de som eies av Sverre. Dialogen bruker `matched_drone_id` direkte når den finnes, og faller ellers tilbake på en tiebreaker basert på **innlogget bruker** (deg). Resultatet: Sverre sin logg matcher til Martin sin drone, og piloten står som deg.

## Løsning

Bruk loggens eier (`pending_dji_logs.user_id`) som utgangspunkt, ikke innlogget bruker.

1. Når en ventende logg åpnes:
   - Sett pilot til loggens eier (Sverre), ikke innlogget bruker. Brukeren kan fortsatt endre pilot manuelt.
   - Hent dronene den eieren er tilknyttet og bruk dem som tiebreaker ved flere SN-treff.
2. Overstyr feilaktig forhåndsmatch: hvis lagret `matched_drone_id` peker på en drone som deler SN-prefiks med en drone eieren er tilknyttet, velges eierens drone i stedet.
3. Når pilot endres manuelt i dialogen, kjøres tiebreakeren på nytt med den nye pilotens tilknyttede droner (kun så lenge dronen ikke er valgt manuelt).
4. Fortsatt tvetydig (ingen tilknytning, eller flere) → dagens manuelle valg og «tvetydig»-melding.

## Teknisk

- `src/components/UploadDroneLogDialog.tsx`
  - Erstatt `myDroneIds` (basert på `user.id`) med `pilotDroneIds`, hentet fra `drone_personnel` for gjeldende `pilotId` (som settes til loggeierens id ved åpning av ventende logg).
  - `handleSelectPendingLog`: sett `pilotId` fra `pendingLog.user_id` (hvis personen finnes i personellisten), hent eierens tilknyttede droner, og kjør `matchDroneFromResult` med disse — også når `matched_drone_id` finnes, men bare for å bytte til eierens drone innenfor samme SN-treff.
  - `findSnMatches`-signaturen er uendret; kallstedene (enkel + de to bulk-løkkene) sender `pilotDroneIds`.
  - Toast-teksten `uploadLog.sn.matchedByLinkedPersonnel` gjenbrukes; ny variant som nevner pilotnavn legges til i `no.json` og `en.json`.
- Ingen databaseendringer; eksisterende feil `matched_drone_id` i ventende logger korrigeres i UI ved behandling.
