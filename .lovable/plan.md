## Mål

1. Splitt befolkningstetthet-laget på `/kart` i to uavhengige toggles.
2. La SORA-beregningene (adjacent area + flight geography population) automatisk velge SSB (Norge) eller Eurostat (Europa) basert på rutens geografi.

## Datakilder

- **Norge:** SSB WFS 250 m grid (uendret, eksisterende `ssb-population` edge function).
- **Europa:** Eurostat GEOSTAT Census 2021, 1 km² befolkningsrutenett (offisiell EU-pendant til SSB sitt grid). Lastes én gang og lagres i Postgres/PostGIS i Lovable Cloud, eksponeres via ny edge function.

GISCO sitt WMS er kun rendrede tiles — ikke spørrbart per celle. Derfor må vi importere grid-en til databasen for å hente faktiske celler til SORA.

## Endringer

### 1. Database (migrasjon)

Ny tabell `eurostat_population_1km`:
- `grd_id text primary key` (Eurostat sitt INSPIRE-grid-ID, f.eks. `CRS3035RES1000mN3527000E4321000`)
- `pop_2021 integer not null`
- `geom geometry(Polygon, 4326)` med GIST-indeks
- RLS av (offentlig referansedata), tilgjengelig for `anon` SELECT

Engangs-import med `ogr2ogr` fra Eurostat GEOSTAT 2021 1km gpkg, transformert EPSG:3035 → 4326. Kun europeiske celler (~2–3M rader, ~500 MB). Jeg laster ned, klipper og importerer fra sandboxen i samme task.

### 2. Edge function `eurostat-population` (ny)

Speil av `ssb-population`:
- Input: `{ bbox: "minLng,minLat,maxLng,maxLat" }`
- Output: samme shape som SSB-funksjonen returnerer (`features: [{ pop_tot, centroidLat, centroidLng, polygon, densityPerKm2 }]`)
- Henter celler via SQL `ST_Intersects(geom, ST_MakeEnvelope(...))`
- `densityPerKm2 = pop_2021` (1 km² ruter), så samme kategori-mapping fungerer

### 3. `src/lib/adjacentAreaCalculator.ts`

- Ny helper `isBboxInsideNorway(bbox)` — grov sjekk mot Norge sin omsluttende bbox (mainland + Svalbard).
- `fetchPopulationGrid(bbox)` velger:
  - Norge → eksisterende `ssb-population` (250 m).
  - Europa → ny `eurostat-population` (1 km).
- Hvis bbox krysser grensen, kall begge og slå sammen cellene (SSB innenfor Norge, Eurostat ellers — Eurostat-celler som overlapper Norge filtreres bort).
- `computeAdjacentAreaDensity` og `computePopulationInGeometry` (flight-geography) bruker samme valg uten ekstra argument.

### 4. `src/components/OpenAIPMap.tsx`

Splitt nåværende `befolkningstetthet` (layerGroup) i to:
- `befolkning_norge` — "Befolkningstetthet Norge (SSB)" — `ssbBefolkningLayer` (1 km eller 250 m WMS, uendret).
- `befolkning_europa` — "Befolkningstetthet Europa (Eurostat 2021)" — `eurostatPopLayer` (WMS, `maxNativeZoom: 10`).

Begge får samme ikon (`users`) og samme `populationDensityPane`. Toggle hver for seg i lag-velgeren.

### 5. `src/components/BefolkningLegend.tsx`

Vises når enten Norge- eller Europa-laget er aktivt. Tekst tilpasses hvilken som er på (eller begge).

### 6. `src/components/AdjacentAreaPanel.tsx` / `SoraSettingsPanel.tsx`

- Vis kildebadge: "SSB 250 m", "Eurostat 1 km" eller "Blandet" basert på hva som ble brukt.
- Ingen logikk-endring utover å motta kilde-feltet fra `computeAdjacentAreaDensity`.

## Filer som endres / opprettes

- ny migrasjon: `eurostat_population_1km` tabell + GIST-indeks
- ny edge function: `supabase/functions/eurostat-population/index.ts`
- `src/lib/adjacentAreaCalculator.ts` — kildevalg
- `src/components/OpenAIPMap.tsx` — splitt laget
- `src/components/BefolkningLegend.tsx` — kildevisning
- `src/components/AdjacentAreaPanel.tsx` — kildebadge
- `src/types/map.ts` / `src/i18n/locales/*.json` — nye lag-IDer og labels

## Out of scope

- Endrer ikke SORA-formler eller kategori-terskler.
- Eurostat sitt 1 km grid har lavere oppløsning enn SSB sitt 250 m. SORA-kategori beregnes likevel per celle, men "tilstøtende område" blir grovere utenfor Norge — det er den beste offentlige oppløsningen som finnes for hele Europa.
- Ingen endring i FH2/Ninox/risk PDF-eksport — de leser bare resultatobjektet.

## Spørsmål før implementasjon

1. **Bbox-deteksjon**: Er det greit at "Norge" defineres som bounding box (lat 57.5–71.5, lng 4–32 + Svalbard 74–81/10–35)? Alternativt kan vi bruke en nøyaktig Norge-polygon (litt mer presist, marginalt mer kode).
2. **Eurostat-import**: GEOSTAT 2021 er ~500 MB komprimert. Vil du at jeg laster ned og importerer hele Europa nå, eller skal vi begrense til EØS/Schengen-land for å spare lagring?
