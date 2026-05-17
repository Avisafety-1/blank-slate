## Mål

Bruk samme per-celle befolkningslogikk som SSB også utenfor Norge. Eurostat WMS er bekreftet ikke-spørrbart (server svarer eksplisitt `layer PopulationGrid2021 is not queryable`), og har ingen WFS. Derfor må selve grid-en importeres til Supabase PostGIS.

## Endringer

### 1. Database (migrasjon mot Supabase)

```sql
create extension if not exists postgis;

create table public.eurostat_population_1km (
  grd_id text primary key,
  pop_2021 integer not null,
  geom geometry(Polygon, 4326) not null
);
create index eurostat_pop_geom_idx on public.eurostat_population_1km using gist (geom);

alter table public.eurostat_population_1km enable row level security;
create policy "Public read" on public.eurostat_population_1km
  for select to anon, authenticated using (true);
```

Offentlig referansedata (samme mønster som dagens SSB-cache).

### 2. Engangs-import

Eurostat GEOSTAT 2021 v2 1 km grid (~500 MB GeoPackage, EPSG:3035, hele Europa, ~2,5M celler).

To-trinns prosess fra sandboxen:
1. Last ned + transformer til EPSG:4326 + del i NDJSON-chunks.
2. Ny midlertidig edge function `eurostat-import` (kjøres én gang manuelt med service-role) som tar imot chunkene og batch-inserter via `supabase-js`. Slettes etter import.

Bekrefter med `select count(*) from eurostat_population_1km` (forventet ~2,5M).

### 3. Ny edge function `eurostat-population`

Speiler `ssb-population`:
- Input: `{ bbox: "minLng,minLat,maxLng,maxLat" }`
- Bruker `supabase-js` + RPC `eurostat_pop_in_bbox(min_lng, min_lat, max_lng, max_lat)` som returnerer celler via `geom && ST_MakeEnvelope(...)`
- Output: identisk shape med SSB (`features[].pop_tot`, `centroidLat/Lng`, `polygon`, `densityPerKm2 = pop_2021`, `gridSource: "eurostat"`)

### 4. `src/lib/adjacentAreaCalculator.ts`

- Ny `isBboxInNorway(bbox)` — bounding box (lat 57.5–71.5 / lng 4–32, + Svalbard 74–81 / 10–35).
- `fetchPopulationGrid(bbox)`:
  - Helt i Norge → SSB 250 m (uendret).
  - Helt utenfor → Eurostat 1 km.
  - Krysser grensen → kall begge, fjern Eurostat-celler hvis sentroide er i Norges bbox.
- `computeAdjacentAreaDensity` / `computePopulationInGeometry`: ingen API-endring, returnerer ny `gridSource: "ssb" | "eurostat" | "mixed"`.

### 5. UI

- `AdjacentAreaPanel.tsx` + `SoraSettingsPanel.tsx`: vis kildebadge basert på `result.gridSource`.
- `BefolkningLegend.tsx`: allerede splittet, ingen endring.

## Filer som endres / opprettes

- migrasjon: `eurostat_population_1km` + GIST + RLS + RPC-funksjon
- ny: `supabase/functions/eurostat-import/index.ts` (midlertidig)
- ny: `supabase/functions/eurostat-population/index.ts`
- `src/lib/adjacentAreaCalculator.ts`
- `src/components/AdjacentAreaPanel.tsx`
- `src/components/SoraSettingsPanel.tsx`

## Out of scope

- SORA-formler, kategori-terskler, FH2/Ninox/PDF-eksport — uendret.
- Eurostat 1 km er grovere enn SSB 250 m, men det er den beste offentlige oppløsningen for hele Europa.

## Risiko

- Import tar 15–30 min og legger ~500 MB i Supabase-databasen din. Sjekk at din Supabase-plan har plass før vi starter.
- Hvis nedlasting fra ec.europa.eu feiler i sandboxen, prøver jeg `gisco-services.ec.europa.eu/pub`-speilet.
