# Serienummer fra DJI-logger: 16 tegn vs. 20 tegn

## Hva loggene og databasen viser

Dette er ikke en visningsfeil i frontend. Det fulle serienummeret kommer aldri inn i databasen:

- Alle innkomne DJI-logger for denne dronen har `aircraft_sn = 1581F9DEC2584029` (16 tegn), både i kolonnen og i `parsed_result.aircraftSN`. DroneLog API leverer altså den korte, avkortede DJI-verdien.
- I `drones` finnes to droner med samme 16-tegns prefiks, men ulike fulle SN:
  - DJI Mini 5 Martin Madsbu — `1581F9DEC25840294JC0`
  - DJI Mini 5 Sverre — `1581F9DEC25840294G1L`

Konsekvensen: en 16-tegns logg-SN kan ikke skille de to dronene, og teksten i dialogen sier feil vei ("Lagret SN er kortere enn loggens SN") — det er motsatt.

## Hva som skal gjøres

1. **Aldri overskriv et lengre lagret SN med et kortere fra loggen.**
   Avkrysningsboksen for "oppdater serienummer" skal kun vises når loggens SN faktisk er lengre/mer komplett enn det lagrede. Er logg-SN et prefiks av det lagrede, skal boksen ikke vises i det hele tatt.

2. **Rett opp teksten.** Vis en nøytral, korrekt formulering: at lagret SN er den fulle verdien og loggens SN er DJIs forkortede variant — eller motsatt når det er tilfellet. Teksten legges inn i i18n (no + en) i stedet for hardkodet norsk.

3. **Håndter flere droner med samme prefiks.**
   Når logg-SN matcher mer enn én drone, skal dialogen ikke stille-velge den første. Da vises en tydelig melding om at flere droner deler serienummer-prefiks, og brukeren må velge drone selv (auto-match-merket "Auto-matchet via SN" skjules).

## Teknisk

- Fil: `src/components/UploadDroneLogDialog.tsx`
  - `snMatchesDjiSn` beholdes for prefiks-match, men legg til en hjelpefunksjon som sier om logg-SN er *mer komplett* enn lagret.
  - Blokken rundt linje 2409–2436: vis kun oppdaterings-checkboxen når `parsedSn.length > storedSn.length`; erstatt hardkodet tekst med `t()`.
  - Auto-match-logikken (`matchDroneFromResult`): tell antall prefiks-treff; ved > 1 treff, ikke sett `selectedDroneId` automatisk, sett i stedet en "tvetydig match"-tilstand.
- i18n-nøkler legges til i `src/i18n/locales/no.json` og `en.json` (f.eks. `uploadLog.sn.storedIsFuller`, `uploadLog.sn.updateToFull`, `uploadLog.sn.ambiguousMatch`).
- Ingen databaseendringer; ingen endring i DroneLog-integrasjonen (API-et leverer bare 16 tegn).
