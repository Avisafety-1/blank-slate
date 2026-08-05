# Auto-match drone via tilknyttet personell ved lik SN

## Problem

DJI-loggen leverer et forkortet 16-tegns serienummer. Når flere droner deler samme SN-prefiks, markeres treffet som "tvetydig" og ingen drone velges automatisk — brukeren må velge selv hver gang.

## Løsning

Bruk tilknytningen mellom bruker og drone (`drone_personnel`) som tiebreaker: er innlogget bruker tilknyttet nøyaktig én av dronene som matcher SN, velges den automatisk.

Prioriteringsrekkefølge ved SN-treff:
1. Eksakt SN-treff (som i dag)
2. Flere treff → filtrer på droner der innlogget bruker er tilknyttet
3. Nøyaktig én igjen → auto-match, og vis at valget ble gjort ut fra tilknytning
4. Fortsatt flere (eller ingen tilknytning) → behold dagens "tvetydig"-melding og la brukeren velge

Samme logikk brukes både i enkeltopplasting og i batch-/bulk-importen, slik at valgt drone blir konsistent.

## Teknisk

- `src/components/UploadDroneLogDialog.tsx`
  - Ny state `myDroneIds: string[]`, hentes ved dialogåpning: `drone_personnel.select("drone_id").eq("profile_id", user.id)`.
  - `findSnMatches` utvides med et valgfritt `preferredIds`-argument: etter eksakt-filtreringen, hvis mer enn ett treff, filtrer på `preferredIds` når det gir minst ett treff.
  - `matchDroneFromResult`: send inn `myDroneIds`; sett `ambiguousDroneMatch` kun hvis det fortsatt er flere treff etter tiebreaker.
  - Begge bulk-løkkene (linje ~985 og ~1106) sender også inn `myDroneIds` når de kaller `findSnMatches`.
- Toast/hjelpetekst når treffet kom fra tilknytning: ny i18n-nøkkel (f.eks. `uploadLog.sn.matchedByLinkedPersonnel`) i både `no.json` og `en.json`.
- Ingen databaseendringer.
