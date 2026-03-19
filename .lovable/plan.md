

## Plan: Server-side søk i oppdrag med indeksering og hierarkisk tilgang

### Problemet
Søk filtrerer kun de ~10 forhåndslastede oppdragene. Oppdrag utenfor paginert visning kan ikke finnes. I tillegg må morselskaper kunne søke på tvers av alle underavdelinger.

### Løsningen

#### 1. Database: Opprett søkeindeks (migrasjon)
Opprett en GIN trigram-indeks på `missions`-tabellen for rask `ILIKE`-søk:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_missions_tittel_trgm ON missions USING gin (tittel gin_trgm_ops);
CREATE INDEX idx_missions_lokasjon_trgm ON missions USING gin (lokasjon gin_trgm_ops);
CREATE INDEX idx_missions_beskrivelse_trgm ON missions USING gin (beskrivelse gin_trgm_ops);
```

#### 2. `src/hooks/useOppdragData.ts` — ny `searchMissions`-funksjon
- Legg til state: `searchResults`, `isSearching`, `searchActive`
- Ny funksjon `searchMissions(query, tab)`:
  - Spør Supabase med `.or(tittel.ilike.%q%,lokasjon.ilike.%q%,beskrivelse.ilike.%q%)` 
  - Filtrerer på status basert på aktiv tab
  - **Ingen `company_id`-filter i koden** — RLS med `get_user_visible_company_ids` håndterer allerede at morselskaper ser alle underavdelinger
  - Begrens til 50 resultater, samme enrichment-logikk (personnel, drones, etc.)
- Ny funksjon `clearSearch()` som nullstiller søkeresultater
- Eksporter `searchResults`, `isSearching`, `searchActive`, `searchMissions`, `clearSearch`

#### 3. `src/pages/Oppdrag.tsx` — debounced server-side søk
- `useEffect` med 300ms debounce på `searchQuery`:
  - Hvis tom → `clearSearch()`, vis paginert data
  - Hvis ikke-tom → kall `searchMissions(query, filterTab)`
- Bytt datakilde: `const displayMissions = data.searchActive ? data.searchResults : data.missions`
- Oppdater `uniqueCustomers`/`uniquePilots`/`uniqueDrones` til å bruke `displayMissions`
- Fjern klient-side søkefiltrering fra `filteredMissions` (behold kunde/pilot/drone-filtre)

### Hierarki-støtte
RLS-policyene på `missions`-tabellen bruker allerede `get_user_visible_company_ids(auth.uid())`, som returnerer alle selskaps-ID-er i hierarkiet. Dermed vil søket automatisk returnere oppdrag fra alle underavdelinger for morselskapsbrukere — ingen ekstra kode nødvendig.

### Filer som endres
1. **Ny migrasjon** — trigram-indekser
2. **`src/hooks/useOppdragData.ts`** — `searchMissions`, `clearSearch`, nye states
3. **`src/pages/Oppdrag.tsx`** — debounced søk, bytt datakilde

