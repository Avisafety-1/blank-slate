

## SORA-basert automatisk oppdragsgodkjenning

### Hva bygges
En ny seksjon øverst i SORA Admin som lar selskapet konfigurere automatisk godkjenning av oppdrag basert på AI SORA-resultater. Tre nye database-kolonner, UI i admin-panelet, og logikk i edge function + frontend for auto-godkjenning.

### Database-endringer (`company_sora_config`)
Tre nye kolonner:
- `sora_based_approval` (boolean, default false) — Master-toggle for SORA-basert godkjenning
- `sora_approval_threshold` (numeric(3,1), default 7.0) — AI-score terskel (0-10). Verdier **under** denne krever godkjenning
- `sora_hardstop_requires_approval` (boolean, default true) — Om hardstop alltid krever godkjenning

### UI i CompanySoraConfigSection
Ny collapsible-seksjon **øverst** (før hardstop-grenser):

**«Godkjenning basert på SORA»**
1. **Master-toggle**: «Godkjenning av oppdrag basert på SORA» — av/på
2. Når på, vises:
   - **Slider 0-10**: «AI SORA-terskel for automatisk godkjenning» — oppdrag med score >= denne verdien godkjennes automatisk
   - **Toggle**: «Krev godkjenning ved hardstop» (default på) — uansett score, hardstop = krever godkjenning

### Logikk-endring i edge function
Etter at AI-analysen er lagret i `ai-risk-assessment/index.ts` (linje ~1148):
1. Hent selskapets `sora_based_approval`, `sora_approval_threshold`, `sora_hardstop_requires_approval`
2. Hvis `sora_based_approval` er true:
   - Hvis `hard_stop_triggered` og `sora_hardstop_requires_approval`: sett `approval_status = 'not_approved'` (krever manuell godkjenning)
   - Ellers hvis `overall_score >= sora_approval_threshold` og ingen hardstop: sett `approval_status = 'approved'`
   - Ellers: sett `approval_status = 'not_approved'`
3. Oppdater `missions`-tabellen med ny `approval_status`

### Logikk-endring i frontend (RiskAssessmentDialog)
Etter at AI-resultat mottas (linje ~461):
- Hvis resultatet indikerer auto-godkjenning, vis toast: «Oppdraget ble automatisk godkjent basert på SORA-vurderingen»
- Refresh misjonslisten for å oppdatere badges

### SoraConfig interface-oppdatering
Legg til de tre nye feltene i `SoraConfig` interfacet og `DEFAULT_CONFIG`, samt i `applyConfigData()` og `handleSave()`.

### Filer som endres
1. **Database-migrasjon**: Legg til 3 kolonner i `company_sora_config`
2. **`src/components/admin/CompanySoraConfigSection.tsx`**: Ny seksjon øverst + state + save/load
3. **`supabase/functions/ai-risk-assessment/index.ts`**: Auto-godkjenningslogikk etter save
4. **`src/components/dashboard/RiskAssessmentDialog.tsx`**: Toast ved auto-godkjenning + refresh

