# Anbefalt fiks: zoom-avhengig geometriforenkling i `airspace_zones_in_bbox`

## 1. Anbefaling (én fiks)

Legg til en `p_zoom`-parameter i `airspace_zones_in_bbox` og kjør
`ST_SimplifyPreserveTopology(geom, tolerance)` + koordinatavrunding i
`ST_AsGeoJSON(geom, decimals)`, der toleransen bestemmes av zoom.

**Hvorfor denne, ikke de andre:**

| Alternativ | Effekt | Kompleksitet/risiko |
|---|---|---|
| **Zoom-avhengig simplify** | **95–96 % mindre payload i verste case** | Én SQL-funksjon + én parameter i to kallsteder |
| Arealgrense / mindre padding | Kutter kanskje 30–50 %, men skjuler soner i utkanten av skjermen og gir flere kall ved panorering | Middels — endrer hva brukeren ser |
| Slå 7 kall til ett | Færre round-trips, men **samme totale datamengde og CPU** i databasen. Bryter per-lag min-zoom og per-lag cache | Høy — omskriving av cache- og rendermodellen |
| `LIMIT` i rutenærhets-SQL | Riktig, men rammer bare ett kallsted som utløses langt sjeldnere enn pan/zoom | Lav effekt |

De 308 slow queries kommer fra kartlagskallene som fyres ved hver pan/zoom.
Der er flaskehalsen `ST_AsGeoJSON` på polygoner med opptil 228 000 punkter —
altså ren serialiseringskostnad. Simplify angriper nettopp denne kostnaden, og
gjør de andre tiltakene mindre presserende.

**Målt effekt** (verneomrader, faktiske spørringer mot databasen nå):

| Utsnitt | Full oppløsning | Med simplify |
|---|---:|---:|
| Zoom ~7–8 (8–16 Ø, 50–56 N), 8 833 soner | **133 MB** | tol 0,002 → **5,7 MB** · tol 0,01 → **2,7 MB** |
| Zoom ~9 (Hamburg 2°×1°), 487 soner | **7,0 MB** | tol 0,0005 → **868 kB** |
| Zoom ~10 | 7,0 MB | tol 0,0002 → 1,2 MB |
| Zoom ~12 | 7,0 MB | tol 0,00005 → 2,3 MB |

Forventet responstid følger payloaden nesten lineært (serialisering + nettverk
dominerer): typiske kall bør falle fra hundrevis av ms til titalls ms, og
verste-case-kallet fra flere sekunder til under ett.

## 2. Implementasjonsplan

**Database (migrasjon):**

- `CREATE OR REPLACE FUNCTION public.airspace_zones_in_bbox(...)` med ny valgfri
  parameter `p_zoom integer DEFAULT NULL` lagt til **sist** i signaturen, slik at
  eksisterende kall fortsetter å virke uendret (ingen simplify når `p_zoom` er NULL).
- Toleranse-tabell i grader, avledet av zoom (ca. ½ piksel):

  | zoom | tolerance | desimaler |
  |---|---|---|
  | ≤ 7 | 0,005 | 4 |
  | 8–9 | 0,001 | 5 |
  | 10–11 | 0,0003 | 5 |
  | 12–13 | 0,0001 | 6 |
  | ≥ 14 | 0 (ingen simplify) | 7 |

- Kun `ST_AsGeoJSON`-uttrykket endres; filter, dedupe og GiST-bruk står urørt.
  Simplify skjer **etter** dedupe, på færrest mulig rader.
- Behold `ST_SimplifyPreserveTopology` (ikke `ST_Simplify`) så polygoner ikke
  kollapser eller får selvkryss.

**Frontend:**

- `src/lib/mapDataFetchers.ts` → `fetchUnifiedAirspaceZones`: send `p_zoom: zoom`
  (verdien finnes allerede i `params.zoom`).
- `src/lib/unifiedRouteProximityLayers.ts` → send `p_zoom: 13` (rutenærhet vises
  alltid nær innzoomet, men trenger ikke full oppløsning).
- `src/integrations/supabase/types.ts` regenereres automatisk etter migrasjonen.

Ingen endringer i cache-logikk, lagoppsett eller UI i denne omgang.

## 3. Risiko og testing før produksjon

- **Visuell kvalitet**: sjekk verneområder og sikringsobjekter i DE/PL/SE på zoom
  7, 9, 11 og 14 — kanter skal ikke synlig «kutte hjørner» på det zoomnivået de vises.
- **Små polygoner**: `ST_SimplifyPreserveTopology` bevarer gyldighet, men
  små soner (sikringsobjekter, ~75 punkter) kan bli firkantede ved lav toleranse;
  vurder å hoppe over simplify når `ST_NPoints(geom) < 50`.
- **Sikkerhetskritisk bruk**: forenklet geometri må **kun** brukes til tegning.
  `airspace_zones_intersecting_route` (som driver luftromsadvarsler og
  Ninox-vurdering) skal ikke røres — avstandsberegning fortsetter på full geometri.
- **Bakoverkompatibilitet**: verifiser at kall uten `p_zoom` gir identisk resultat
  som i dag (PostgREST matcher på parameternavn, så standardverdien må virke).
- **Etterkontroll**: kjør Query Performance på nytt etter 24 timer og sammenlign
  antall slow queries og gjennomsnittlig responstid for RPC-en.
