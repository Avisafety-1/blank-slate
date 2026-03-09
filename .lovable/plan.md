

## Plan: Slå sammen manuell SORA i RiskAssessmentDialog

### Konsept
Flytt det manuelle SORA-skjemaet (fra `SoraAnalysisDialog`) inn som en ny tab «Manuell SORA» i `RiskAssessmentDialog`. RiskAssessmentTypeDialog endres til å åpne RiskAssessmentDialog med riktig initialTab i stedet for å åpne en separat dialog.

### Endringer

**1. `src/components/dashboard/RiskAssessmentDialog.tsx`**
- Legg til ny tab-verdi `'manual-sora'` i type-unionen
- Importer og integrer hele SORA-skjemaet (Accordion-seksjonene fra SoraAnalysisDialog) som innhold i en ny `TabsContent value="manual-sora"`
- Flytt inn nødvendig state og logikk fra SoraAnalysisDialog: `formData`, `existingSora`, `profiles`, `preparedByProfile`, `fetchExistingSora`, `fetchProfiles`, `handleSave`
- TabsList blir alltid 5 tabs: Input | Resultat | AI SORA | Manuell SORA | Historikk
- Utvid dialog-bredden til `max-w-4xl` når manuell SORA-tab er aktiv (skjemaet trenger mer plass)
- Legg til `onSoraSaved?: () => void` callback i props

**2. `src/components/dashboard/RiskAssessmentTypeDialog.tsx`**
- Fjern `onSelectSORA` prop
- Endre «Manuell SORA»-knappen til å kalle `onSelectAI` med en parameter som indikerer at manuell SORA-tab skal åpnes
- Alternativt: begge knappene åpner samme dialog, men med forskjellig `initialTab`
- Endre props til: `onSelectAI: () => void` og `onSelectManualSORA: () => void`

**3. Oppdater alle 4 steder som bruker SoraAnalysisDialog + RiskAssessmentTypeDialog:**

- **`src/components/oppdrag/dialogs/OppdragDialogs.tsx`**: Fjern `SoraAnalysisDialog`-importen og -bruken. Endre `onSelectSORA` til å åpne RiskAssessmentDialog med `initialTab='manual-sora'`
- **`src/components/dashboard/MissionsSection.tsx`**: Samme endring
- **`src/components/dashboard/MissionDetailDialog.tsx`**: Samme endring  
- **`src/components/dashboard/AISearchBar.tsx`**: Behold SoraAnalysisDialog her foreløpig (den åpner direkte uten type-valg)

**4. `src/pages/Oppdrag.tsx`**
- Fjern `soraDialogOpen`, `soraEditingMissionId`, `handleEditSora`, `handleSoraSaved` state/handlers som nå er unødvendige som separate konsepter
- Rut SORA-åpning gjennom RiskAssessmentDialog med `initialTab='manual-sora'`

### Filer som endres
1. `src/components/dashboard/RiskAssessmentDialog.tsx` — legg til manuell SORA-tab
2. `src/components/dashboard/RiskAssessmentTypeDialog.tsx` — oppdater props
3. `src/components/oppdrag/dialogs/OppdragDialogs.tsx` — fjern SoraAnalysisDialog, rut gjennom RiskAssessmentDialog
4. `src/components/dashboard/MissionsSection.tsx` — samme
5. `src/components/dashboard/MissionDetailDialog.tsx` — samme
6. `src/pages/Oppdrag.tsx` — forenkle state

