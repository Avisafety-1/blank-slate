

## Live NOTAM kartlag

### Oversikt
Implementere et nytt kartlag «Live NOTAM» som viser aktive NOTAMs på kartet med geometrier (polygoner/sirkler). For å minimere API-kall caches NOTAMs i en databasetabell via en edge function, og klienten henter fra databasen.

### Arkitektur

```text
Laminar API (v2)                Edge Function               Database              Kart
  GET /countries/NOR/notams  →  fetch-notams (cron 15min) → notams tabell    →    OpenAIPMap
                                                            (GeoJSON cached)      (kartlag)
```

### Steg

**1. Lagre API-nøkkel som secret**
- Bruker legger inn Laminar Data API-nøkkel som secret `LAMINAR_API_KEY`

**2. Database: `notams`-tabell**
- Kolonner: `id` (uuid PK), `notam_id` (text unique — fra API), `series`, `number`, `year`, `location` (text), `qcode`, `scope`, `traffic`, `purpose`, `type`, `text`, `effective_start` (timestamptz), `effective_end` (timestamptz), `effective_end_interpretation`, `minimum_fl` (int), `maximum_fl` (int), `geometry` (geometry, nullable), `properties` (jsonb — full feature properties backup), `country_code`, `fetched_at` (timestamptz), `created_at`
- RLS: alle autentiserte kan lese
- Indeks på `geometry` (GIST) og `effective_end`

**3. Edge function: `fetch-notams`**
- Kaller `GET https://v2.laminardata.aero/v2/countries/NOR/notams` med header `Authorization: Bearer {LAMINAR_API_KEY}`
- Aksepterer gzip (`Accept-Encoding: gzip`)
- Parser GeoJSON FeatureCollection
- Filtrerer: kun NOTAMs der `effective_end > now()` (eller `effectiveEndInterpretation = PERM/EST`)
- Upsert til `notams`-tabellen basert på `notam_id`
- Sletter utgåtte NOTAMs (`effective_end < now()` og ikke PERM/EST)
- Designet for å kjøres som cron hvert 15. minutt (API cacher i 60s, NOTAMs endres sjelden)

**4. Cron-schedule**
- Ny cron-jobb i `supabase/config.toml`: kaller `fetch-notams` hvert 15. minutt

**5. Kartlag i `OpenAIPMap.tsx`**
- Nytt `notamLayer` (L.layerGroup), default av (enabled: false)
- Legges til i `layerConfigs` med ikon `alertTriangle` og navn «Live NOTAM»
- Henter fra `notams`-tabellen via Supabase (kun aktive, med geometri)
- Viewport-basert: henter NOTAMs innenfor kartets bounds ved `moveend` (debounced, min zoom 8)
- Tegner geometrier som gule/oransje polygoner med popup som viser NOTAM-tekst, tidsrom, Q-code
- NOTAMs uten geometri vises som sirkelmarkør på `lat/lon` fra properties

**6. Fil: `src/lib/mapDataFetchers.ts`**
- Ny funksjon `fetchNotams({ layer, bounds, zoom })` som:
  - Henter fra `notams`-tabellen med ST_Intersects på viewport bounds
  - Tegner GeoJSON-polygoner med styling basert på scope/qcode
  - Popup med tekst, tidsrom, lokasjon

### Tekniske detaljer

- **API-kall minimering**: Kun edge function kaller Laminar API (hvert 15 min). Klienten leser kun fra databasen. API-en cacher allerede i 60s, så 15 min er konservativt.
- **Geometri**: Lagres som PostGIS geometry fra GeoJSON. Viewport-filtrering med GIST-indeks.
- **Utgåtte NOTAMs**: Ryddes ved hver sync-kjøring.
- **Kun Norge**: Bruker `/countries/NOR/notams` for å begrense datamengden.

### Filer som endres/opprettes
1. **Ny migration** — `notams`-tabell med RLS og indekser
2. **Ny edge function** — `supabase/functions/fetch-notams/index.ts`
3. **`supabase/config.toml`** — cron-schedule
4. **`src/lib/mapDataFetchers.ts`** — ny `fetchNotams`-funksjon
5. **`src/components/OpenAIPMap.tsx`** — nytt kartlag
6. **`src/components/MapLayerControl.tsx`** — evt. nytt ikon

