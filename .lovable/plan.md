# Sjekklist-deling: prompt når delt drone har ikke-delte sjekklister

## Problem
`checkDroneResourceVisibility` i `src/lib/droneVisibilityCheck.ts` ser kun på koblingstabellene `drone_documents`, `drone_equipment` og `drone_personnel`. Sjekklistene som ligger direkte på dronen via `drones.sjekkliste_id`, `drones.operations_checklist_ids[]` og `drones.post_flight_checklist_id` blir aldri sjekket. Resultat: ingen advarsel når man lagrer en delt drone med sjekklister som mangler `visible_to_children=true`. I oppdrag i den delte avdelingen feiler sjekklisten fordi dokumentet ikke er synlig.

Sjekklister er rader i `documents` med `kategori='sjekklister'` (se `useChecklists.ts`).

## Endring

### `src/lib/droneVisibilityCheck.ts`
Utvid `checkDroneResourceVisibility` med en ekstra seksjon "0. Drone checklist columns":
1. Hent `drones` med kolonnene `sjekkliste_id`, `operations_checklist_ids`, `post_flight_checklist_id`.
2. Samle alle ikke-null/ikke-tomme checklist-IDer til ett unikt sett.
3. Slå opp `documents(id, tittel, company_id, visible_to_children)` for disse ID-ene.
4. Samme logikk som eksisterende dokument-blokk: hvis `visible_to_children=false`, legg til `MissingVisibility` med `resourceType: "document"` for hver target-dept som ikke er eier-companyen.

Eksisterende `grantMissingVisibility` håndterer dette automatisk (setter `visible_to_children=true`), så ingen endring der.

### Verifisering
- `DroneDetailDialog.handleSave` (linje 792) bruker allerede `checkDroneResourceVisibility` → vil nå plukke opp sjekklister.
- `checkVisibilityAfterAdd` (linje 178) brukes ved tillegg av equipment/personnel etter at dronen allerede er delt. Den vil også fange opp sjekklister, men UI-flyten trigger den ikke ved checklist-endringer. Vi kjører checklist-sjekken kun via handleSave-flowen som er der den faktisk endres.

## Filer
- `src/lib/droneVisibilityCheck.ts`

## Ikke i scope
- Forrige usolgte oppgaver (drone-deling fra child-avdeling, teknisk ansvarlig per avdeling).
