
# Scenarioer og selskapsvelger for kalkulatoren

## Oversikt
Utvide kalkulatoren med to nye funksjoner:
1. **3 lagrede scenarioer** - Mulighet til aa lagre, bytte mellom og navngi 3 ulike beregningsscenarioer
2. **Selskapsvelger** - Nedtrekksmeny som henter alle selskaper fra databasen og automatisk fyller inn antall brukere

## Hva som endres

### Ny toppseksjon i kalkulatoren
- **Scenariovelger**: Tre knapper/faner (Scenario 1, 2, 3) med mulighet til aa gi hvert scenario et egendefinert navn
- **Selskapsvelger**: En nedtrekksmeny som lister alle selskaper. Naar et selskap velges, hentes antall brukere automatisk fra databasen og fylles inn. Alle beregninger oppdateres umiddelbart.
- Man kan ogsaa velge "Alle selskaper" for aa se totalt antall brukere paa tvers, eller "Egendefinert" for aa skrive inn manuelt

### Lagring
- Alle 3 scenarioer lagres i localStorage (som i dag, men utvidet struktur)
- Hvert scenario inneholder: navn, valgt selskap, og alle kalkulatorfelt

## Teknisk plan

### Endringer i `src/components/admin/RevenueCalculator.tsx`

**Ny datastruktur:**
```text
interface Scenario {
  name: string;            // Egendefinert navn, f.eks. "Optimistisk"
  selectedCompanyId: string | null;  // null = egendefinert
  state: CalcState;        // Eksisterende kalkulatortilstand
}

// 3 scenarioer lagres i localStorage
```

**Ny funksjonalitet:**
1. Importere `supabase` for aa hente selskaper og brukerantall
2. `useEffect` som henter alle selskaper med brukerantall ved oppstart
3. Scenariofaner med redigerbare navn (klikk for aa endre navn)
4. Select-komponent for selskapsvelger som automatisk setter `totalUsers`
5. Naar selskap velges: kjoer spoorring for aa telle brukere i det selskapet og oppdater feltet

**Ingen nye filer eller database-endringer** - alt er klientside med eksisterende Supabase-sporringer.
