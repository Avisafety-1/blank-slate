

## Selskapsinnstillinger + "Vis alle luftromsadvarsler"-toggle

### Hva skal gjøres

1. **Ny kolonne i `companies`-tabellen**: `show_all_airspace_warnings boolean NOT NULL DEFAULT false`
2. **Vis eget selskap (moderselskap) på Avdelinger-fanen**: Legg til en seksjon øverst i `ChildCompaniesSection` som viser moderselskapet med en innstillings-panel (ikke som redigerbar avdeling, men som konfigurasjonsseksjon for selskapet selv)
3. **Toggle i selskapsinnstillinger**: "Vis alle luftromsadvarsler på oppdragskortene" — lagres som `show_all_airspace_warnings` på `companies`
4. **Bruk innstillingen i `AirspaceWarnings`**: Når aktivert, vis alle advarsler uten collapsible — vis dem alle direkte

### Filer som endres

**Ny migrasjon**
- `ALTER TABLE companies ADD COLUMN show_all_airspace_warnings boolean NOT NULL DEFAULT false;`

**`src/components/admin/ChildCompaniesSection.tsx`**
- Hent moderselskapet (eget selskap) og vis det øverst som en GlassCard med selskapsnavn + innstillings-toggles
- Første toggle: "Vis alle luftromsadvarsler på oppdragskortene" med Switch-komponent
- Ved endring: oppdater `companies`-tabellen direkte med `supabase.from('companies').update(...)`

**`src/components/dashboard/AirspaceWarnings.tsx`**
- Legg til ny prop `showAll?: boolean`
- Når `showAll` er `true`: hopp over collapsible-logikken, vis alle advarsler direkte
- Når `false`/undefined: behold nåværende oppførsel (vis én + expandable)

**`src/components/oppdrag/MissionCard.tsx`**
- Hent `show_all_airspace_warnings` fra selskapets innstillinger (via `useAuth` companyId + en enkel query/context)
- Send `showAll`-prop til `<AirspaceWarnings>`

**`src/components/dashboard/MissionDetailDialog.tsx`** og **`src/components/dashboard/AddMissionDialog.tsx`**
- Samme: send `showAll`-prop til `<AirspaceWarnings>` basert på selskapsinnstilling

### Teknisk detalj: Hente selskapsinnstilling
For å unngå N+1-spørringer per oppdragskort, opprettes en enkel hook `useCompanySettings` som henter og cacher relevante boolean-flagg fra `companies`-tabellen for aktivt selskap. Denne brukes i `MissionCard`, `MissionDetailDialog` og `AddMissionDialog`.

