

## Plan: Varslingsdager for personellkompetanser

### Mål
På hver kompetanse skal det vises hvor mange dager før utløp varslingen utløses (Gul status) — og brukeren skal kunne endre denne verdien per kompetanse.

### Database
Legg til kolonne `varsel_dager` (integer, default 30) på `personnel_competencies` via migrering.

### Endringer i `src/components/resources/PersonCompetencyDialog.tsx`
- Utvid `Competency`-interface med `varsel_dager?: number | null`.
- Legg til state `newWarningDays` (default 30) og `editWarningDays`.
- Skjema: nytt nummerfelt «Varsle (dager før utløp)» ved siden av «Utløpsdato» — både i «Legg til» og «Rediger»-skjemaene.
- Lagre `varsel_dager` ved insert/update.
- Visning per kompetansekort (kun lesbart): liten infotekst under utløpsdato:
  - «Gul varsling sendes X dager før utløp (DD.MM.YYYY)» når utløpsdato finnes.
  - Hvis allerede gul/rød: vis aktuell status.

### Endringer i `src/lib/maintenanceStatus.ts`
- Utvid `CompetencyItem` med `varsel_dager?: number | null`.
- I `calculatePersonnelAggregatedStatus`: bruk `comp.varsel_dager ?? warningDays` (per-kompetanse override).

### Endringer i `src/hooks/useStatusData.ts` og `src/components/dashboard/PersonnelListDialog.tsx`
- Ingen logikkendring nødvendig — funksjonen leser allerede hele kompetanseobjektet. Default på 30 beholdes som fallback.

### Edge function
`supabase/functions/check-competency-expiry/index.ts` bruker i dag `inspection_reminder_days` fra brukerprofil. Oppdater spørringen til å hente `varsel_dager` per kompetanse, og bruk `comp.varsel_dager ?? userPrefs.inspection_reminder_days ?? 14` ved sammenligning. Slik blir per-kompetanse-innstilling dominerende, med brukerpreferanse som fallback.

### UI-detaljer
- Tallfelt: `min=1`, `max=365`, `type="number"`, plassholder «30».
- Kompakt visning: liten muted tekst, ev. `Bell`-ikon for å indikere varsling.

<lov-actions>
<lov-suggestion message="Test that adding a competency, setting warning days, and seeing the yellow status appear works end-to-end">Verify that it works</lov-suggestion>
<lov-suggestion message="Vis også gjenstående dager til utløp som badge på hver kompetanse (f.eks. «12 dager igjen»)">Show days remaining badge</lov-suggestion>
<lov-suggestion message="Legg til samme per-element varslingsdager for utstyr og droner (overstyr selskapsdefault per ressurs)">Per-resource warning days</lov-suggestion>
</lov-actions>
