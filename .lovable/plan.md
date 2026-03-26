

## Legg til «Skjul identitet til rapportør» i selskapsinnstillinger

### Endringer

#### 1. Database-migrasjon
Ny kolonne på `companies`:
```sql
ALTER TABLE companies ADD COLUMN hide_reporter_identity boolean NOT NULL DEFAULT false;
```

#### 2. `src/components/admin/ChildCompaniesSection.tsx`
- Legg til state `hideReporterIdentity` og hent/lagre den sammen med `show_all_airspace_warnings`
- Ny toggle-rad under luftromsadvarsler-togglern med label «Skjul identitet til rapportør av hendelser» og beskrivelse «Når aktivert vises ikke navnet på den som rapporterte hendelsen»
- «Gjelder for alle underavdelinger»-togglern flyttes til bunnen og propagerer **begge** innstillinger til underavdelinger

#### 3. `src/hooks/useCompanySettings.ts`
- Legg til `hide_reporter_identity: boolean` i `CompanySettings`-interfacet og hent verdien fra `companies`

#### 4. Skjul rapportør-identitet i visningene
Tre steder viser `rapportert_av`:

- **`src/pages/Hendelser.tsx`** (~linje 1002): Vis «Anonym» i stedet for `incident.rapportert_av` når `hide_reporter_identity` er `true`
- **`src/components/dashboard/IncidentDetailDialog.tsx`** (~linje 490): Samme logikk
- **`src/components/ProfileDialog.tsx`**: Hendelser tilknyttet bruker — her vises de uansett da brukeren ser sine egne

Alle tre bruker `useCompanySettings()` for å hente flagget.

### Filer som endres
1. Database-migrasjon (ny kolonne)
2. `src/components/admin/ChildCompaniesSection.tsx` — ny toggle + propagering
3. `src/hooks/useCompanySettings.ts` — nytt felt
4. `src/pages/Hendelser.tsx` — skjul rapportør
5. `src/components/dashboard/IncidentDetailDialog.tsx` — skjul rapportør

