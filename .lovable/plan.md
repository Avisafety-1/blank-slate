

## Selskapsadresse som kart-fallback + adresse-autosluttfor

### Hva dette gjor
1. Adressefeltet i selskapsredigering (CompanyManagementDialog) far autosluttfor via Kartverket-API (gjenbruker eksisterende AddressAutocomplete-komponent), slik at kun gyldige norske adresser kan settes.
2. Nar en gyldig adresse velges, lagres koordinatene (lat/lon) pa selskapet i databasen.
3. Kartet bruker selskapets koordinater som fallback-posisjon dersom GPS-tilgang nektes eller er utilgjengelig, i stedet for hardkodet Trondheim-posisjon.

### Prioritet/rekkefølge

1. **Database**: Legg til `adresse_lat` og `adresse_lon` kolonner pa `companies`-tabellen.
2. **CompanyManagementDialog**: Bytt ut det vanlige adresse-inputfeltet med `AddressAutocomplete`-komponenten, og lagre lat/lon nar en adresse velges.
3. **AuthContext**: Eksponer selskapets koordinater (hentes allerede fra profiles/companies) slik at kartet kan bruke dem.
4. **OpenAIPMap**: Bruk selskapets koordinater som fallback nar geolokasjon nektes.

---

### Tekniske detaljer

#### 1. Database-migrasjon

Legg til to nye kolonner pa `companies`:

```sql
ALTER TABLE companies ADD COLUMN adresse_lat double precision;
ALTER TABLE companies ADD COLUMN adresse_lon double precision;
```

Ingen nye RLS-policyer trengs -- eksisterende policyer dekker allerede SELECT/UPDATE pa companies.

#### 2. `src/components/admin/CompanyManagementDialog.tsx`

- Importer `AddressAutocomplete` fra `@/components/AddressAutocomplete`
- Erstatt det vanlige `<Input>`-feltet for `adresse` med `<AddressAutocomplete>`
- Legg til `adresse_lat` og `adresse_lon` i skjemaet (zod-skjema og form state)
- Nar brukeren velger en adresse fra autosluttfor-listen, settes bade adressetekst og koordinater
- Ved lagring sendes `adresse_lat` og `adresse_lon` med til Supabase

#### 3. `src/contexts/AuthContext.tsx`

- Utvid `AuthContextType` og `CachedProfile` med `companyLat: number | null` og `companyLon: number | null`
- Hent `adresse_lat` og `adresse_lon` fra companies-tabellen i den eksisterende profile-fetch-logikken
- Eksponer disse via context

#### 4. `src/components/OpenAIPMap.tsx`

- Hent `companyLat` og `companyLon` fra `useAuth()`
- I geolokasjon-fallback-logikken (linje ~831): Dersom `initialCenter` ikke er satt og geolokasjon nektes, bruk selskapets koordinater i stedet for `DEFAULT_POS`
- Fallback-kjede blir: `initialCenter` (prop) -> GPS -> selskapsadresse -> `DEFAULT_POS` (Trondheim)

#### 5. `src/integrations/supabase/types.ts`

- Oppdater types for companies-tabellen med de nye kolonnene (dette skjer automatisk via migrasjon, men manuell oppdatering kan trengs)

### Filer som endres
- Ny migrasjon (database)
- `src/components/admin/CompanyManagementDialog.tsx`
- `src/contexts/AuthContext.tsx`
- `src/components/OpenAIPMap.tsx`
- `src/integrations/supabase/types.ts`
