

## Viewport-basert henting av verneområder (og andre tunge lag)

### Problem
Når "Verneområder"-laget aktiveres, hentes **alle** naturvernområder og vern-restriksjoner fra databasen på én gang — potensielt tusenvis av polygoner med tung geometri. Dette kan overbelaste både Supabase og nettleseren, og var sannsynligvis årsaken til krasjet.

### Løsning: Hent kun det som er synlig på kartet

Bruk kartets bounding box (`map.getBounds()`) til å filtrere soner server-side med PostGIS `ST_Intersects`. Oppdater ved panorering/zoom (`moveend`-event).

### Tekniske endringer

#### 1. Ny database-funksjon (migrasjon)
Lag en RPC-funksjon `get_zones_in_bounds` som tar `min_lat, min_lng, max_lat, max_lng` og returnerer kun soner som overlapper med viewporten:

```sql
CREATE FUNCTION get_naturvern_in_bounds(...)
  SELECT external_id, name, verneform, geometry
  FROM naturvern_zones
  WHERE ST_Intersects(geometry, ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326))
  LIMIT 500;

CREATE FUNCTION get_vern_restrictions_in_bounds(...)
  -- Samme mønster for vern_restriction_zones
```

Inkluder spatial indeks (`CREATE INDEX ... USING GIST(geometry)`) hvis ikke allerede opprettet.

#### 2. Oppdater `src/lib/mapDataFetchers.ts`
- `fetchNaturvernZones` og `fetchVernRestrictionZones` tar nå en `bounds: L.LatLngBounds` parameter
- Kaller RPC i stedet for `.from().select()` med paginering
- Fjern all paginering — RPC-en håndterer filtrering og limit

#### 3. Oppdater `src/components/OpenAIPMap.tsx`
- Legg til `moveend`-event på kartet som re-fetcher verneområder med nye bounds
- Debounce med ~300ms for å unngå spam under panorering
- Send `map.getBounds()` til fetch-funksjonene
- Fjern initial fetch av verneområder ved oppstart — la `moveend` trigge første henting

### Fordeler
- Kun 100-500 soner lastes om gangen i stedet for tusenvis
- Supabase-prosjektet belastes minimalt
- Nettleseren rendrer langt færre polygoner
- Spatial indeks gjør spørringen rask (~ms)

### Filer som endres
1. **Ny migrasjon** — `get_naturvern_in_bounds`, `get_vern_restrictions_in_bounds` + GIST-indeks
2. **`src/lib/mapDataFetchers.ts`** — bounds-parameter, RPC-kall
3. **`src/components/OpenAIPMap.tsx`** — `moveend`-listener med debounce

