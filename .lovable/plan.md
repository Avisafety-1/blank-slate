

## Individuelle «Gjelder for alle underavdelinger»-toggles per innstillingsseksjon

### Problem
Den nåværende «Gjelder for alle underavdelinger»-togglen ligger visuelt innenfor flylogg-varsler-boksen, men propagerer alle selskapsinnstillinger samlet. Brukeren ønsker individuelle propagerings-toggles per seksjon.

### Løsning
Flytt den eksisterende togglen ut av flylogg-varsler-boksen og erstatt med individuelle toggles inne i hver innstillingsseksjon. Hver toggle propagerer kun sin egen seksjons innstillinger til underavdelinger.

### Seksjoner som får egen toggle

1. **Selskapsinnstillinger** (luftromsadvarsler, skjul rapportør, godkjenningskrav, SORA) — propagerer `show_all_airspace_warnings`, `hide_reporter_identity`, `require_mission_approval`, `require_sora_on_missions`, `require_sora_steps` til `companies`-tabellen
2. **Roller** — kopierer roller fra morselskapet til alle underavdelinger (insert manglende roller)
3. **Flylogg-varsler** — kopierer alert-konfigurasjoner og mottakere til alle underavdelinger

### Endringer i `src/components/admin/ChildCompaniesSection.tsx`

- Erstatt enkelt `applyToChildren`-state med tre separate: `applySettingsToChildren`, `applyRolesToChildren`, `applyAlertsToChildren`
- Fjern den nåværende togglen fra linje 676-687 (inne i flylogg-varsler-boksen)
- Legg til en liten propagerings-toggle nederst i hver av de tre seksjonene:
  - **Selskapsinnstillinger-boksen**: propagerer company-settings via `UPDATE companies SET ... WHERE parent_company_id = companyId`
  - **Roller-boksen**: henter morselskaps-roller og inserter manglende i hver underavdeling via `company_mission_roles`
  - **Flylogg-varsler-boksen**: upserterer alerts og recipients til alle underavdelinger via `company_flight_alerts` og `company_flight_alert_recipients`
- Hver toggle er uavhengig og viser samme UI-mønster: Switch + label «Gjelder for alle underavdelinger» med forklaringstekst

### Fil som endres
1. **`src/components/admin/ChildCompaniesSection.tsx`** — Refaktorer propagerings-logikk til individuelle toggles per seksjon

