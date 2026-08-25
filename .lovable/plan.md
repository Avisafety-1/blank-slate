# Diagnose: `airspace_zones_in_bbox` som kilde til slow queries

Kun funn og målinger. Ingen endringer gjort i database eller frontend.

## 1. Kallsteder

### A. Kartlag i `src/components/OpenAIPMap.tsx` (via `fetchUnifiedAirspaceZones` i `src/lib/mapDataFetchers.ts:1960`)

- **Bbox**: rått kartutsnitt `map.getBounds()` (south/west/north/east), deretter utvidet 50 % med `padBBox(bounds)` (`src/lib/viewportLayerCache.ts`). Ingen klipping mot land/regioner.
- **Øvre grense på areal**: ingen. Eneste bremsen er min-zoom per lag:
  `airspace/rpas/restriksjonsomrader/fareomrader` = zoom 7, `verneomrader` = 8, `sikringsobjekter` = 9, `flyplasser` = 5. Under min-zoom nullstilles cachen (som også tvinger nytt kall når man zoomer inn igjen).
- **Frekvens**: på hver `moveend`, debounced 300 ms (`debouncedFetchVern`), pluss ved init og ved `layeradd`. Viktig: dette er **ett RPC-kall per lag** — inntil **7 parallelle kall per kartbevegelse**, hvert med `p_country_codes = ['DK','SE','DE','FI','PL']`.
- Gating: kun selskaper i `airspace_unified_company_allowlist` (`isUnifiedAirspaceEnabled()`).

### B. Rutenærhet i `src/lib/unifiedRouteProximityLayers.ts:208`

- **Bbox**: bounding box rundt de tegnede rutepunktene + 500 m padding.
- **Grense**: ingen arealgrense; `p_layer_ids: null` ⇒ **alle lag i ett kall**, `p_zone_types: null`. 6 s klient-timeout, og resultatet kuttes til 2500 rader *etter* at alt er hentet.
- **Frekvens**: debounced ved ruteendring i `OpenAIPMap.tsx:1977`, med AbortController. Aborten stopper kun klienten — spørringen kjører ferdig i databasen.

## 2. Caching

- Kun klient-side, in-memory (`viewportLayerCache.ts`). Kallet hoppes over bare når **både** zoom er uendret **og** nytt viewport ligger helt inne i forrige padded bbox. Zoom-endring ⇒ alltid nytt kall, også for identisk område. Cachen forsvinner ved remount/reload.
- Ingen server-side caching, ingen `staleTime`/React Query, ingen materialisert visning. Rutenærhets-kallet (B) har **ingen** cache i det hele tatt.

## 3. Målinger

**Databasefunksjonen har ingen `LIMIT` og ingen paginering.** Den henter alle treff, dedupliserer med `DISTINCT ON`, og returnerer `ST_AsGeoJSON(geom)` i **full oppløsning** — ingen `ST_Simplify`, ingen zoom-avhengig generalisering, ingen koordinatavrunding.

Datamengde i `airspace_zones` (aktive):

| land/lag | rader | snitt punkter | maks punkter | geom |
|---|---:|---:|---:|---:|
| DE verneomrader | 13 829 | 671 | 54 788 | 142 MB |
| PL verneomrader | 3 872 | 1 300 | 118 475 | 77 MB |
| SE verneomrader | 10 432 | 266 | 228 492 | 43 MB |
| DE sikringsobjekter | 31 001 | 75 | 4 637 | 37 MB |

Faktisk respons fra funksjonen (målt nå):

| kall | rader | GeoJSON |
|---|---:|---:|
| `verneomrader`, ~zoom 9 (Hamburg-området, 2°×1°) | 487 | **7,6 MB** |
| `verneomrader`, zoom ~7–8 (8–16 Ø, 50–56 N) | 8 824 | **143 MB** |
| `sikringsobjekter`, zoom 9 (Berlin) | 584 | 1,0 MB |
| `airspace`, zoom 7 (DK) | 6 | 6 kB |

Typisk innzoomet bruk er dermed noen hundre rader og flere MB JSON; verste case ved min-zoom (7–8) er titalls MB til over 100 MB i ett svar. `ST_AsGeoJSON` på 100k-punkts polygoner er CPU-tungt, og dedupe-CTE-en materialiserer geometrien før serialisering.

Indekser finnes (`airspace_zones_geom_gix` GiST + `country_code, layer_id, active`), så flaskehalsen er ikke indeksoppslaget, men **antall rader × geometristørrelse × serialisering**, multiplisert med opptil 7 kall per kartbevegelse.

## 4. Hovedårsaker (oppsummert)

1. Ingen `LIMIT` og ingen zoom-avhengig `ST_Simplify` — full oppløsning alltid.
2. Ingen arealgrense på bbox; +50 % padding gjør utsnittet 2,25× større enn skjermen.
3. Opptil 7 separate RPC-kall per pan/zoom, alle med 5 land.
4. Zoom-endring invaliderer cachen selv når området er uendret.
5. Rutenærhets-kallet henter alle lag uten cache; klient-abort stopper ikke databasen.

## Neste steg

Ingen fiks er implementert. Når du har valgt retning, kan aktuelle tiltak diskuteres (f.eks. `ST_Simplify`/`ST_QuantizeCoordinates` per zoom, hard `LIMIT` + arealtak, ett samlet kall for flere lag, og server-side eller React Query-cache).
