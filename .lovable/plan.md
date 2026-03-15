

## Plan: Feature-gating basert på abonnementsplan

### Planmatrise

```text
Funksjon                          Starter    Grower    Professional
──────────────────────────────────────────────────────────────────
Dashboard / Kart / Oppdrag        ✓          ✓         ✓
Ressurser / Dokumenter / Kalender ✓          ✓         ✓
Hendelsesrapportering             ✗          ✓         ✓
/status (statuspanel)             ✗          ✓         ✓
AI-regelverkssøk                  ✗          ✓         ✓
SORA re-vurdering                 ✗          ✓         ✓
Maks droner per bruker            1          5         15
Tilgangsstyring (roller/funksjoner) ✗        ✗         ✓
Admin-panel                       ✗          ✗         ✓
──────────────────────────────────────────────────────────────────
Tillegg (addon):  SORA Admin / DJI / ECCAIRS – uavhengig av plan
```

### Implementering

**1. Ny hook: `src/hooks/usePlanGating.ts`**
- Leser `subscriptionPlan` og `subscriptionAddons` fra `useAuth()`
- Eksporterer:
  - `canAccess(feature: string): boolean` — sjekker om gjeldende plan gir tilgang
  - `maxDrones: number` — 1 / 5 / 15 basert på plan
  - `hasAddon(addon: AddonId): boolean`
- Feature-liste som enum/constant: `'incidents'`, `'status'`, `'ai_search'`, `'sora'`, `'access_control'`, `'admin'`
- SuperAdmin / stripeExempt bypass — alltid full tilgang

**2. Ny komponent: `src/components/PlanRestricted.tsx`**
- Wrapper-komponent som viser innholdet eller en upgrade-prompt
- Props: `feature: string`, `children`
- Bruker `usePlanGating` internt
- Viser kort melding med «Oppgrader til [plan]»-knapp som navigerer til ProfileDialog

**3. Oppdater `src/components/Header.tsx`**
- Skjul «Hendelser»-link for Starter
- Skjul «Status»-link for Starter
- Skjul Admin-knapp for Starter og Grower (med mindre bruker er superadmin)

**4. Oppdater rute-beskyttelse i `src/App.tsx`**
- Wrap `/hendelser`, `/status` med `PlanRestricted` i AuthenticatedLayout
- Alternativt: sjekk i selve page-komponentene

**5. Oppdater individuelle features**
- `src/components/dashboard/AISearchBar.tsx` — deaktiver/skjul for Starter
- `src/components/dashboard/RiskAssessmentDialog.tsx` (SORA) — deaktiver for Starter
- `src/pages/Admin.tsx` — redirect/blokkér for ikke-Professional (med unntak av superadmin)
- Tilgangsstyring i admin (roller, funksjonsbrytere) — kun Professional

**6. Drone-begrensning**
- I `src/components/resources/AddDroneDialog.tsx` — sjekk antall eksisterende droner mot `maxDrones` før opprettelse
- Vis melding «Du har nådd maks antall droner for din plan» med oppgraderingslenke
- Krever en query for å telle droner i selskapet

**7. Oppdater `src/config/subscriptionPlans.ts`**
- Legg til `maxDrones` og `features`-liste per plan for maskinlesbar gating
- Oppdater feature-beskrivelsene i UI

### Teknisk notat
- All gating skjer client-side basert på `subscriptionPlan` fra AuthContext (som hentes fra `check-subscription` Edge Function)
- SuperAdmin og stripeExempt bypasser alltid alle gates
- Addon-gating (SORA Admin, DJI, ECCAIRS) forblir separat — sjekkes via `subscriptionAddons`

