

## Fiks: SORA-sjekk mangler i dashbordet ved godkjenning

### Problem
Dashbordet har to steder med egen godkjenningslogikk som oppdaterer `approval_status` direkte uten å sjekke SORA-kravet (`require_sora_on_missions`). Sjekken finnes kun i `useOppdragData.ts` (brukt fra `/oppdrag`-siden).

### Løsning
Legg til SORA-sjekk i begge dashbord-komponentene, identisk med logikken i `useOppdragData.ts`:
- Sjekk `require_sora_on_missions` fra `useCompanySettings`
- Sjekk `useSoraApprovalEnabled` — hvis aktiv, hopp over sjekken
- Tell `mission_risk_assessments` for oppdraget
- Hvis antall < `require_sora_steps`: vis toast «Gjennomfør SORA først» og avbryt

### Filer som endres

#### 1. `src/components/dashboard/MissionsSection.tsx`
- Importer `useCompanySettings` og `useSoraApprovalEnabled`
- I `AlertDialogAction`-onClick (linje 394): legg til SORA-sjekk før `approval_status`-oppdateringen
- Hvis SORA mangler: toast + return

#### 2. `src/components/dashboard/MissionDetailDialog.tsx`
- Importer `useCompanySettings` og `useSoraApprovalEnabled`
- I `AlertDialogAction`-onClick (linje 501): legg til samme SORA-sjekk
- Hvis SORA mangler: toast + return

### Kodelogikk (begge steder)
```ts
// Før approval_status-oppdateringen:
if (companySettings?.require_sora_on_missions && !soraApprovalEnabled) {
  const { count } = await supabase
    .from('mission_risk_assessments')
    .select('id', { count: 'exact', head: true })
    .eq('mission_id', missionId);
  const requiredSteps = companySettings.require_sora_steps ?? 1;
  if ((count ?? 0) < requiredSteps) {
    toast.error('Gjennomfør SORA først');
    return;
  }
}
```

