## Mål
Erstatt det enkle oppdrag-Select i `BatchLogPanel.tsx` med samme auto-match-logikk som detaljert behandling bruker, pluss en søkbar/scrollbar overstyring.

## Auto-match (per logg)
Speil logikken i `UploadDroneLogDialog.tsx` (linje 1505–1540):
- Hent alle oppdrag på samme kalenderdag (lokal tid) som loggens `startTime`.
- Sorter etter nærmeste tidspunkt til flystart.
- Forhåndsvelg nærmeste oppdrag som `missionId` automatisk (kun hvis brukeren ikke har valgt manuelt).
- Vis liten badge "Auto-matchet" når valgt mission er nettopp den auto-foreslåtte.

## Overstyring — søkbar liste
Bytt fra `Select` til `Popover` + `Command` (cmdk via `@/components/ui/command`):
- Trigger-knapp viser valgt oppdragsnavn + dato, eller "Opprett nytt oppdrag" som default når ingen match finnes.
- Popover åpner søkbar liste med `CommandInput` (filter på tittel + lokasjon + dato-string).
- `CommandList` med `max-h-64 overflow-y-auto` for scroll.
- Faste valg øverst:
  - "Opprett nytt oppdrag" (verdi `""`).
  - Skille-linje.
- Deretter alle selskapets oppdrag.
- Auto-matchede oppdrag fra samme dag vises i en egen `CommandGroup heading="Samme dag"` øverst i listen, resten under `CommandGroup heading="Alle oppdrag"`.

## Datakilde for full liste
Hent én gang når BatchLogPanel mountes:
- `missions` for `companyId`, kolonner `id, tittel, tidspunkt, status, lokasjon`.
- Begrens til siste 180 dager + alle fremtidige (`tidspunkt >= now() - 180d`), `order tidspunkt desc`, `limit 500`.
- Lagre i lokal state `allMissions` og send som prop til hver rad.

## Endringer i `src/components/upload/BatchLogPanel.tsx`
1. Ny state `allMissions: MissionOption[]` + `useEffect` som henter listen ved mount/`companyId`-endring.
2. Behold per-rad `missions` (same-day) for auto-match, men sett `missionId` til nærmeste i sortert rekkefølge når lista lastes (kun hvis `missionId` fortsatt er tomt og bruker ikke har overstyrt).
3. Legg til `autoMatchedMissionId: string | null` i `RowState` for å vise badge.
4. Bytt eksisterende `<Select>` for oppdrag ut med ny komponent `MissionPicker` (inline i samme fil):
   - Props: `value`, `onChange`, `sameDayMissions`, `allMissions`, `autoMatchedId`.
   - Bruker `Popover` + `Command`, `CommandInput placeholder="Søk oppdrag..."`, grupper for "Samme dag" og "Alle oppdrag".
   - Trigger viser oppdragstittel + `format(tidspunkt, "dd.MM HH:mm")`, eller "Opprett nytt oppdrag".

## Verifisering
- Huk av flere logger → hver rad får forhåndsvalgt nærmeste samme-dags oppdrag automatisk, med "Auto-matchet"-badge.
- Klikk på oppdragsvelgeren → popover med søkbart/scrollbart oppdragsutvalg.
- Skriv i søkefeltet → filtrerer på tittel/lokasjon/dato.
- "Opprett nytt oppdrag" valgt → lagring oppretter nytt oppdrag som før.
- Lagring fungerer både med valgt eksisterende oppdrag og auto-opprettet oppdrag.