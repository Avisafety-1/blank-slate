

## Plan: Slå sammen manuell SORA i RiskAssessmentDialog

Planen fra forrige runde ble ikke implementert. Her er den oppdaterte planen.

### Konsept
Flytt det manuelle SORA-skjemaet inn som en ny tab «Manuell SORA» i `RiskAssessmentDialog`. Fjern den separate `SoraAnalysisDialog` fra alle steder unntatt `AISearchBar` (som bruker den direkte uten type-valg).

### Endringer

**1. `src/components/dashboard/RiskAssessmentDialog.tsx`**
- Utvid `initialTab` type til å inkludere `'manual-sora'`
- Legg til all SORA-skjemastate fra `SoraAnalysisDialog` (formData, existingSora, profiles, preparedByProfile, etc.)
- Legg til fetchExistingSora, fetchProfiles, handleSoraSave logikk
- Ny `TabsTrigger value="manual-sora"` — alltid synlig (ikke betinget)
- `TabsContent value="manual-sora"` med hele Accordion-skjemaet fra SoraAnalysisDialog (5 seksjoner + lagre-knapp)
- Dialog-bredde dynamisk: `max-w-4xl` når manual-sora tab er aktiv, ellers eksisterende bredde
- Ny prop: `onSoraSaved?: () => void`

**2. `src/components/dashboard/RiskAssessmentTypeDialog.tsx`**
- Endre `onSelectSORA` til `onSelectManualSORA`
- Begge knapper lukker dialogen og kaller sin respektive callback

**3. `src/components/oppdrag/dialogs/OppdragDialogs.tsx`**
- Fjern `SoraAnalysisDialog` import og bruk (linje 4, 155-160)
- Fjern props: `soraDialogOpen`, `setSoraDialogOpen`, `soraEditingMissionId`, `onSoraSaved`
- Endre `onSelectSORA` til `onSelectManualSORA` som åpner RiskAssessmentDialog med `initialTab='manual-sora'`
- Send `onSoraSaved={props.fetchMissions}` til RiskAssessmentDialog

**4. `src/pages/Oppdrag.tsx`**
- Fjern `soraDialogOpen`, `soraEditingMissionId`, `handleEditSora`, `handleSoraSaved` state/handlers
- `handleSelectSORA` → setter `initialTab='manual-sora'` og åpner RiskAssessmentDialog
- `handleEditSora` (fra MissionCard) → åpner RiskAssessmentDialog med `initialTab='manual-sora'`

**5. `src/components/dashboard/MissionsSection.tsx`**
- Fjern `SoraAnalysisDialog` import og bruk
- Rut SORA gjennom RiskAssessmentDialog med `initialTab='manual-sora'`

**6. `src/components/dashboard/MissionDetailDialog.tsx`**
- Fjern `SoraAnalysisDialog` import og bruk
- Rut SORA gjennom RiskAssessmentDialog med `initialTab='manual-sora'`

**AISearchBar.tsx** — beholdes uendret (bruker SoraAnalysisDialog direkte).

### Filer som endres
1. `src/components/dashboard/RiskAssessmentDialog.tsx`
2. `src/components/dashboard/RiskAssessmentTypeDialog.tsx`
3. `src/components/oppdrag/dialogs/OppdragDialogs.tsx`
4. `src/pages/Oppdrag.tsx`
5. `src/components/dashboard/MissionsSection.tsx`
6. `src/components/dashboard/MissionDetailDialog.tsx`

