Fjern den dokument/risikovurderings-ikon-knappen (FileText) fra headeren i 'Kommende oppdrag'-seksjonen på dashboardet.

Tekniske detaljer:
- Fil: `src/components/dashboard/MissionsSection.tsx`
- Handling: Slett den outline-knappen med `FileText`-ikonet som står rett før '+'-knappen i seksjonshodet.
- Rydd opp: Fjern `FileText`-importen dersom den ikke lenger brukes noe annet sted i filen. Behold `RiskAssessmentTypeDialog`, `RiskAssessmentDialog` og `handleNewRiskAssessment` dersom de fortsatt brukes fra andre steder i komponenten.