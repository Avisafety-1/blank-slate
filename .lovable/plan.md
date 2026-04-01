

## Søkefunksjon for selskaper-tabben

### Hva skal gjøres
Legge til et søkefelt i `CompanyManagementSection` som filtrerer selskapslisten i sanntid etter navn, org.nummer eller kontaktinfo.

### Endringer

**Fil: `src/components/admin/CompanyManagementSection.tsx`**

1. Legg til en `searchQuery` state-variabel
2. Legg til en `filteredCompanies` memo som filtrerer `companies` basert på `searchQuery` (matcher mot `navn`, `org_nummer`, `kontakt_epost`)
3. Legg til et søkefelt med `Search`-ikon mellom header-linjen og tabellen/kortene (under knappene, over listen)
4. Erstatt `companies.map(...)` med `filteredCompanies.map(...)` i både mobil- og desktop-visningen
5. Vis "Ingen treff" når `filteredCompanies` er tom men `companies` har elementer

### Plassering av søkefeltet
Rett under header-linjen med tittel og knapper, som en full-bredde Input med søkeikon, lik mønsteret brukt i `CompanySwitcher`.

