# Plan: Hindre at lange dokumentnavn går utenfor skjermen på oppdragskort (mobil)

## Bakgrunn
På `/oppdrag` vises tilknyttede dokumenter som klikkbare lenker inne i hvert oppdragskort (`MissionCard.tsx`). Dokumentnavn uten mellomrom (f.eks. lange SORA-filnavn) brytes ikke automatisk på smale skjermer, og kan dermed gå utenfor kortets bredde.

## Mål
Sørge for at lange dokumentnavn på oppdragskort enten brytes over flere linjer eller trunkeres på mobil, uten å ødelegge desktop-layout.

## Endringer

### 1. CSS-justering i `src/components/oppdrag/MissionCard.tsx`
- Lokasjon: dokumentlenkene rendres i linjene rundt `mission.documents.map(...)` (ca. linje 504–517).
- Gjøres:
  - Legg `min-w-0 max-w-full` på `<button>`-elementet slik at det respekterer kortets bredde.
  - Legg ikonet i `shrink-0`.
  - Legg dokumenttittelen i en `<span>` med `break-all sm:break-words` (mobil: brekk overalt; større skjermer: brekk kun ved naturlige ordgrenser).
  - Legg til `title={doc?.tittel}` slik at brukeren kan se fullt navn ved hover / long-press.

### 2. Verifikasjon
- Åpne `/oppdrag` i mobilvisning.
- Sjekk at oppdrag med lange dokumentnavn uten mellomrom ikke lenger forårsaker horisontal scrolling eller at tekst går utenfor kortet.
- Sjekk at desktop- og tablet-visning fortsatt ser ryddig ut.

## Ikke i scope
- Endring av dokumentvelgeren i `AddMissionDialog` (autofyll/global synlighet) – dette håndteres i en egen plan hvis ønskelig.
- Endring av selve dokumenttitlene i databasen.
