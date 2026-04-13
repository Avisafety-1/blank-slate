

## Plan: Vis personell fra underavdelinger og tilby drone-synlighet

### Problem
`AddPersonnelToDroneDialog` henter kun personell fra brukerens aktive `companyId`. Personell i underavdelinger vises ikke. Når en person fra en underavdeling legges til, bør brukeren spørres om dronen skal gjøres synlig for den avdelingen.

### Endringer

#### 1. `AddPersonnelToDroneDialog.tsx` - Hent personell fra hele hierarkiet
- Bruk `get_user_visible_company_ids` RPC for å hente alle selskaps-IDer i hierarkiet
- Hent personell med `.in("company_id", visibleIds)` i stedet for `.eq("company_id", companyId)`
- Inkluder `company_id` og selskapsnavn i person-interfacet for å vise avdelingstilhørighet
- Vis avdelingsnavn som badge/tekst på hvert personell-kort

#### 2. `AddPersonnelToDroneDialog.tsx` - Bekreftelsesdialog for synlighet
- Legg til en `AlertDialog` som vises når valgt person tilhører en annen avdeling enn dronens eier
- Tekst: "Ønsker du å gjøre dronen synlig for [avdelingsnavn]?"
- Ved "Ja": Insert i `drone_department_visibility` for den avdelingen, deretter legg til personellet
- Ved "Nei": Legg til personellet uten å endre synlighet

#### 3. `AddPersonnelToDroneDialog.tsx` - Props og interface
- Legg til ny prop `droneCompanyId` fra `DroneDetailDialog` (dronens eier-selskap)
- Legg til prop `onVisibilityChanged` callback for å oppdatere `useDepartmentVisibility`-staten i `DroneDetailDialog`

#### 4. `DroneDetailDialog.tsx` - Oppdatert integrasjon
- Pass `droneCompanyId` og `onVisibilityChanged` til `AddPersonnelToDroneDialog`
- Ved visibility-endring: re-fetch department visibility data via `deptVis`

### Teknisk detalj
- Henter selskapsnavn via join: `profiles` → `companies(id, navn)` 
- Sjekker eksisterende synlighet i `drone_department_visibility` før prompt (hvis allerede synlig, ingen prompt)
- Bruker `AlertDialog` fra shadcn for bekreftelsen

