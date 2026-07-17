## Bakgrunn — to sammenhengende problemer

**1. CTR/flyplass vises ikke som standard i utlandet**

I NO er `rpas` (5 km rundt flyplass) og `rmz_tmz_atz` (CTR/TIZ/ATZ/RMZ/TMZ) default PÅ, mens `aip` (P/R/D) er default AV. Da jeg wiret inn unified-lagene la jeg CTR/TIZ/ATZ (`layer_id='airspace'`) inn under `aip`-knappen — som er default AV. Derfor ser Moderavdeling ingen CTR i DE/SE/FI før de manuelt slår på "P/R/D-soner". Det bryter med hvordan kartet oppfører seg i Norge.

Unified `rpas`-laget (DRONE_NO_FLY = 5 km rundt flyplass) er allerede korrekt merged inn i `rpas`-knappen (default på) — det trenger ingen endring.

**2. Timeout når oppdrag lagres**

Både `airspace_zones_intersecting_route` (rute-analyse) og `airspace_zones_in_bbox` (kartrendering) leser fra viewet `resolved_airspace_zones` → `airspace_zones_with_precedence`. Sistnevnte kjører et `row_number() OVER (PARTITION BY country_code, layer_id, dedupe_key ORDER BY ...)` **over hele tabellen** (~50k rader) før noen filtrering. Planneren klarer ikke å pushe det romlige filteret ned under vindusfunksjonen, så hver eneste RPC-kall gjør en full scan + sort. Dette skalerer dårlig og forklarer timeouten på oppdragslagring.

Indeksene på geom (GIST), country/layer og dedupe finnes allerede — problemet er utelukkende viewets rekkefølge.

## Endringer

### A. Flytt unified CTR til `rmz_tmz_atz`-knappen (default på)

I `src/components/OpenAIPMap.tsx`:

- `aip`-knapp: fjern `unifiedAirspaceLayer` fra `layer`-arrayet → tilbake til bare `aipLayer` (NO P/R/D).
- `rmz_tmz_atz`-knapp: legg til `unifiedAirspaceLayer` i `layer`-arrayet ved siden av `rmzTmzAtzLayer`.

Ingen andre lag flyttes:
- `rpas` (5 km airport) — unified allerede default på. ✓
- `restriksjonsomrader` / `fareomrader` / `sikringsobjekter` / `verneomrader` — beholder default AV (matcher NO-oppførsel for P/R/D, D-soner, sikring, natur).

### B. Skriv om `resolved_airspace_zones` slik at dedupe skjer etter filter

Definér viewet som en LATERAL/DISTINCT-ON-basert struktur som PostgreSQL kan pushe romlige predikater under:

```sql
CREATE OR REPLACE VIEW public.resolved_airspace_zones
WITH (security_invoker=on) AS
SELECT DISTINCT ON (z.country_code, z.layer_id, COALESCE(z.dedupe_key, z.id::text))
       z.id, z.created_at, z.updated_at, z.country_code, z.source,
       z.external_id, z.zone_type, z.restriction_type, z.display_class,
       z.theme, z.name, z.short_name, z.authority,
       z.lower_limit_m, z.upper_limit_m, z.lower_limit_raw, z.upper_limit_raw,
       z.altitude_reference, z.valid_from, z.valid_to, z.active,
       z.properties, z.geom, z.layer_id, z.authority_rank, z.dedupe_key
  FROM public.airspace_zones z
 WHERE z.active
   AND (z.valid_from IS NULL OR z.valid_from <= now())
   AND (z.valid_to   IS NULL OR z.valid_to   >  now())
 ORDER BY z.country_code, z.layer_id, COALESCE(z.dedupe_key, z.id::text),
          z.authority_rank NULLS LAST, z.updated_at DESC;
```

`DISTINCT ON` alene er heller ikke sub-linear, så vi må parallelt endre selve RPC-ene til å **filtrere `airspace_zones` direkte** og bare deduplisere på det spatiale subsettet:

```sql
CREATE OR REPLACE FUNCTION public.airspace_zones_intersecting_route(...)
...
AS $$
DECLARE v_route geometry; v_buffer int;
BEGIN
  v_buffer := LEAST(GREATEST(COALESCE(p_buffer_m,0),0), 100000);
  v_route  := ST_SetSRID(ST_GeomFromGeoJSON(p_route::text), 4326);

  RETURN QUERY
  WITH candidates AS (
    SELECT z.*
      FROM public.airspace_zones z
     WHERE z.active
       AND (z.valid_from IS NULL OR z.valid_from <= now())
       AND (z.valid_to   IS NULL OR z.valid_to   >  now())
       AND (p_country_codes IS NULL OR z.country_code = ANY(p_country_codes))
       AND (p_layer_ids     IS NULL OR z.layer_id     = ANY(p_layer_ids))
       AND (p_zone_types    IS NULL OR z.zone_type    = ANY(p_zone_types))
       AND ST_DWithin(z.geom::geography, v_route::geography, v_buffer)
  ), deduped AS (
    SELECT DISTINCT ON (country_code, layer_id, COALESCE(dedupe_key, id::text))
           *
      FROM candidates
     ORDER BY country_code, layer_id, COALESCE(dedupe_key, id::text),
              authority_rank NULLS LAST, updated_at DESC
  )
  SELECT id, country_code, source, layer_id, zone_type, restriction_type,
         display_class, theme, name, short_name, lower_limit_m, upper_limit_m,
         altitude_reference, authority_rank, dedupe_key,
         ST_Distance(geom::geography, v_route::geography) AS distance_m,
         ST_Intersects(geom, v_route)                     AS route_inside,
         properties
    FROM deduped;
END; $$;
```

Samme mønster for `airspace_zones_in_bbox` (bytt `ST_DWithin` mot `ST_Intersects(geom, ST_MakeEnvelope(...))`).

Effekt: begge RPC-ene bruker nå `airspace_zones_geography_gix` / `airspace_zones_geom_gix` direkte. Rute-analyser skalerer med antall soner *nær ruten*, ikke totalt antall soner i Europa.

### C. Legg til støtte-indeks for dedupe-sortering

```sql
CREATE INDEX IF NOT EXISTS airspace_zones_dedupe_ix
  ON public.airspace_zones (country_code, layer_id, dedupe_key, authority_rank)
  WHERE active;
```

Brukes i `DISTINCT ON`-sorten etter at bbox har smalnet inn kandidatene.

### D. Ingen NO-påvirkning, verifisering

- Ingen endring av `airspace_zones_with_precedence` beholdes (kun for eventuelle direkte lesere av viewet).
- NO-brukere bruker fortsatt legacy-RPC-er; unified-RPC-ene kalles kun for allowlist-selskap (fail-closed).
- Verifiser med `EXPLAIN (ANALYZE, BUFFERS)` mot en typisk rute i DE at `airspace_zones_geography_gix` brukes og totaltid < 500 ms.
- Manuell UI-test i Moderavdeling: åpne kartet i DE — CTR-polygoner skal vises umiddelbart (uten å måtte hake av noe), og "Lagre oppdrag" i en rute innom en CTR skal returnere advarsler uten timeout.

## Rekkefølge

1. Migrasjon: nytt `resolved_airspace_zones`-view + omskrevet `airspace_zones_intersecting_route` + omskrevet `airspace_zones_in_bbox` + ny indeks.
2. Kode-endring i `OpenAIPMap.tsx`: flytt `unifiedAirspaceLayer` fra `aip` til `rmz_tmz_atz`.
3. EXPLAIN-verifisering + UI-røyketest i Moderavdeling.
