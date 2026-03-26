

## Blokkér «Krev SORA på alle oppdrag» når SORA-basert godkjenning er aktiv

### Problem
Når `sora_based_approval` er aktivert i SORA-konfig, gir det ikke mening å også ha `require_sora_on_missions` på — de to innstillingene overlapper og skaper forvirring.

### Løsning
I `ChildCompaniesSection.tsx`:

1. Importer og bruk `useSoraApprovalEnabled()` for å sjekke om SORA-basert godkjenning er aktiv.
2. I `handleToggleRequireSora`: hvis `checked === true` og `soraApprovalEnabled === true`, vis toast `"Kan ikke aktiveres når SORA-basert godkjenning er på"` og returner uten å lagre.
3. Valgfritt: Visuelt disable switchen og/eller vis forklarende undertekst når SORA-basert godkjenning er aktiv.

### Fil som endres
- `src/components/admin/ChildCompaniesSection.tsx` — importer `useSoraApprovalEnabled`, legg til sjekk i `handleToggleRequireSora`, disable switch visuelt.

