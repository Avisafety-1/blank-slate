## Diagnose

Når mor-avdelingen legger til en sjekkliste (eller annet dokument) på et delt utstyr, lagres bare `equipment.sjekkliste_id` — det er ingen sjekk på om selve sjekkliste-dokumentet er synlig for avdelingen(e). Avdelingen åpner utstyret, klikker «Utfør vedlikehold» → `ChecklistExecutionDialog` får ikke lest dokumentet via RLS → «Kunne ikke laste sjekklisten».

For droner finnes allerede løsningen: `checkDroneResourceVisibility` + `grantMissingVisibility` (i `src/lib/droneVisibilityCheck.ts`) brukt av `DroneDetailDialog` med `ResourceVisibilityWarningDialog`. Vi mangler analog flyt for utstyr.

## Fiks

### 1. `src/lib/droneVisibilityCheck.ts` — legg til equipment-variant
Ny funksjon `checkEquipmentResourceVisibility(equipmentId, targetDeptIds)` som ser på utstyrets `sjekkliste_id` (hentes fra `equipment`-raden) og sjekker mot `documents.visible_to_children` + `documents.company_id`. Returnerer samme `MissingVisibility[]`-form (kun `resourceType: "document"` er aktuelt for utstyr i dag). `grantMissingVisibility` håndterer allerede dokumenter via `visible_to_children=true`, så ingen endring der.

### 2. `src/components/resources/ResourceVisibilityWarningDialog.tsx` — generaliser tekst
Legg til valgfri prop `resourceLabel?: { singular: string; verb?: string }` (default «dronen» / «deles med»). Brukes kun i `DialogDescription`. Drone-kallene beholder default; utstyr sender `{ singular: "utstyret" }`.

### 3. `src/components/resources/EquipmentDetailDialog.tsx` — speil drone-flow
- Importer `checkEquipmentResourceVisibility`, `MissingVisibility`, `ResourceVisibilityWarningDialog`.
- State: `visibilityWarning` (samme form som i DroneDetailDialog).
- Helper `getTargetDeptIds()` og `getCurrentEquipmentVisibilityDeptIds()` (les fra `equipment_department_visibility`).
- I `handleSave`: etter at `equipment` er oppdatert og før `deptVis.saveVisibility()`, kjør `checkEquipmentResourceVisibility(equipment.id, getTargetDeptIds())` når det finnes target-departments. Hvis missing > 0 → vent på brukerens valg via `ResourceVisibilityWarningDialog` (Gjør synlig / Fortsett / Avbryt) før vi kaller `deptVis.saveVisibility()`. Samme mønster som DroneDetailDialog linje 789–816.
- Render `<ResourceVisibilityWarningDialog>` nederst i JSX, med `departments={deptVis.childDepartments}` og `resourceLabel={{ singular: "utstyret" }}`.

### 4. Verifisering
1. I mor: legg til ny sjekkliste (uten `visible_to_children`) på et utstyr som allerede er delt med en avdeling → ved Lagre vises dialog som tilbyr «Gjør 1 synlig». Velg «Gjør synlig» → sjekkliste-dokument får `visible_to_children=true`.
2. Bytt til avdelingen → åpne utstyret → «Utfør vedlikehold» → sjekklisten laster (ingen rød feilmelding).
3. Negativ test: velg «Fortsett uten endring» → sjekkliste forblir usynlig, samme feil reproduseres (forventet).

## Tekniske detaljer

- Filer: `src/lib/droneVisibilityCheck.ts`, `src/components/resources/ResourceVisibilityWarningDialog.tsx`, `src/components/resources/EquipmentDetailDialog.tsx`.
- Ingen DB-migrasjon: `grantMissingVisibility` bruker eksisterende `documents.visible_to_children`-felt.
- Personell og dokumenter ut over `sjekkliste_id` er ikke koblet til utstyr i dagens datamodell, så scope er sjekkliste-dokumentet. Hvis utstyr senere får flere lenkede ressurser (f.eks. drone_documents-analog), kan `checkEquipmentResourceVisibility` utvides.
