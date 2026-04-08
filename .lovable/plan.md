

## Bekreftelses-dialog etter opprettelse av oppdrag: «Utfør risikovurdering?»

### Oversikt
Etter at et nytt oppdrag lagres vellykket, vis en bekreftelses-dialog med to valg:
1. **Utfør risikovurdering** → lukker dialogen, åpner RiskAssessmentDialog (AI) med det nye oppdraget
2. **Fortsett uten** → lukker dialogen og går videre som i dag

### Endringer

**`src/components/dashboard/AddMissionDialog.tsx`**
- Endre `onMissionAdded` callback til å også kunne returnere det nye oppdraget: ny prop `onMissionAddedWithData?: (mission: any) => void`
- Etter vellykket INSERT (linje ~752), kall `onMissionAddedWithData(newMission)` i stedet for `onMissionAdded()` (kun for nye oppdrag, ikke redigering)

**`src/pages/Oppdrag.tsx`**
- Legg til ny state `riskPromptMission` for det nettopp opprettede oppdraget
- Legg til ny state `riskPromptOpen` for bekreftelses-dialogen
- Ny `handleMissionAdded` → sett `riskPromptMission` og åpne prompt-dialogen
- Ved «Utfør risikovurdering» → lukk prompt, sett `riskAssessmentMission` til det nye oppdraget, åpne `riskDialogOpen` med `initialTab: 'input'`
- Ved «Fortsett uten» → lukk prompt, fetch missions som vanlig

**`src/components/oppdrag/dialogs/OppdragDialogs.tsx`**
- Legg til en enkel AlertDialog/Dialog for bekreftelsen med to knapper:
  - «Utfør risikovurdering» (primary)
  - «Fortsett uten risikovurdering» (outline/secondary)
- Nye props: `riskPromptOpen`, `setRiskPromptOpen`, `onPerformRiskAssessment`, `onSkipRiskAssessment`

### Filer som endres
1. `src/components/dashboard/AddMissionDialog.tsx` — returnere oppdraget etter lagring
2. `src/pages/Oppdrag.tsx` — ny state og håndtering av bekreftelsesdialog
3. `src/components/oppdrag/dialogs/OppdragDialogs.tsx` — ny bekreftelses-dialog UI

