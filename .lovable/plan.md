

## Mål
Når en drone deles med underavdelinger (eller når en delt drone redigeres), skal systemet sjekke om tilknyttede ressurser (dokumenter, utstyr, personell) er synlige for de samme avdelingene. Hvis ikke → vis dialog som lar bruker enten gjøre dem synlige automatisk eller fortsette uten.

## Utforskning

Trenger å se på:
- `DroneDetailDialog` (hvor synlighet og tilkoblinger redigeres)
- `useDepartmentVisibility` (eksisterende hook)
- Tilkoblingstabellene: `drone_documents`, `drone_equipment`, `drone_personnel` (eller tilsvarende)
- Visibility-tabeller for utstyr (`equipment_department_visibility`) og dokumenter (`documents.visible_to_children`)
- Personell-synlighet (sannsynligvis via `get_user_visible_company_ids`)

## Plan

### 1. Ny hjelpefunksjon `checkResourceVisibility`
`src/lib/droneVisibilityCheck.ts` — gitt en drone og et sett av target-avdelinger:
- Hent alle tilknyttede dokumenter, utstyr og personell på dronen
- For hver ressurs: sjekk om den er synlig for hver target-avdeling
  - Dokument: `visible_to_children=true` ELLER `company_id` matcher
  - Utstyr: rad i `equipment_department_visibility` ELLER samme `company_id`
  - Personell: profil tilhører avdeling i `get_user_visible_company_ids`-treet
- Returner liste over `{ resourceType, resourceId, resourceName, missingDeptIds }`

### 2. Ny dialog `ResourceVisibilityWarningDialog`
`src/components/resources/ResourceVisibilityWarningDialog.tsx`:
- Viser tabell: ressurs | type | mangler synlighet for (avdelingsnavn)
- Tre handlinger:
  - **«Gjør alle synlige»** — oppdater `equipment_department_visibility` / `documents.visible_to_children` automatisk
  - **«Fortsett likevel»** — lagre uten endring
  - **«Avbryt»**
- Personell håndteres som info-melding (kan ikke gjøres "synlig" automatisk siden de er bundet til selskap) — anbefaler at bruker flytter/inviterer dem manuelt

### 3. Integrere sjekken i `DroneDetailDialog`
To trigger-punkter:
- **Ved lagring av synlighet** (når brukeren endrer hvilke avdelinger dronen deles med via `useDepartmentVisibility`): kjør sjekk → hvis konflikter → åpne dialog før `saveVisibility()` fullfører
- **Ved tilkobling av ny ressurs på en allerede delt drone** (legg til dokument/utstyr/personell): hent dronens nåværende `drone_department_visibility`-rader, sjekk den nye ressursen → vis dialog hvis manglende

### 4. Verifisering
- Del drone med Avdeling A → koble til dokument som kun er synlig i mor → dialog skal foreslå å sette `visible_to_children=true`
- Endre delt drone → legg til utstyr ikke synlig i Avd A → samme dialog
- Velg «Gjør alle synlige» → bekreft at ressursene faktisk vises i underavdelingen etterpå

### Filer
- Ny: `src/lib/droneVisibilityCheck.ts`
- Ny: `src/components/resources/ResourceVisibilityWarningDialog.tsx`
- Endret: `src/components/resources/DroneDetailDialog.tsx` (krok inn sjekken på de to trigger-punktene)
- Ingen migrasjon — bruker eksisterende tabeller

