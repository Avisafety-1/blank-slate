

## Plan: Åpne admin-panel for alle planer, blokker kun tilgangsstyring

Nå blokkeres hele `/admin` for Starter og Grower. Endringen: Alle planer får tilgang til admin-panelet (registreringskode, brukerlistevisning, e-postmaler, SORA-config), men rolle- og funksjonsstyring (Select for rolle, Switch-toggles for godkjenner/ECCAIRS/oppfølgingsansvarlig) blokkeres for planer uten `access_control`.

### Endringer

**1. `src/App.tsx`** — Fjern `PlanRestricted` wrapper fra `/admin`-ruten
- Endre fra `<PlanRestricted feature="admin"><Admin /></PlanRestricted>` til bare `<Admin />`

**2. `src/config/subscriptionPlans.ts`** — Fjern `'admin'` fra Professional sin `gatedFeatures`
- `admin` som feature fjernes helt — admin-panelet er tilgjengelig for alle
- `access_control` forblir kun i Professional

**3. `src/pages/Admin.tsx`** — Gate rolle/funksjonsstyring med `usePlanGating`
- Importer `usePlanGating` og sjekk `canAccess('access_control')`
- For brukere uten `access_control`:
  - Rolle-select (linje 887-901 mobil, 955-969 desktop): Vis nåværende rolle som read-only Badge, uten Select
  - Switch-toggles (godkjenner, ECCAIRS, oppfølgingsansvarlig, linje 859-884 mobil, 929-954 desktop): Vis som disabled med tooltip/overlay som sier «Krever Professional»
  - Slett bruker-knappen forblir tilgjengelig for admin
- Registreringskode, brukerlisteopprydding, invitasjon, e-postmaler etc. forblir tilgjengelig

**4. `src/config/subscriptionPlans.ts`** — Oppdater `GatedFeature` type
- Fjern `'admin'` fra `GatedFeature` union type

