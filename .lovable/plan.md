# Anbefalt fiks: zoom-avhengig geometriforenkling i `airspace_zones_in_bbox`

## 1. Anbefaling (én fiks)

Legg til en `p_zoom`-parameter i `airspace_zones_in_bbox` og forenkle geometrien
**i Web Mercator (EPSG:3857)** med en toleranse i meter som tilsvarer en halv
skjermpiksel på det aktuelle zoomnivået, kombinert med koordinatavrunding i
`ST_AsGeoJSON`.

**Hvorfor denne, ikke de andre:**

| Alternativ | Effekt | Kompleksitet/risiko |
|---|---|---|
| **Zoom-avhengig simplify** | **~88–96 % mindre payload** | Én SQL-funksjon + én parameter i to kallsteder |
| Arealgrense / mindre padding | Kutter 30–50 %, men skjuler soner i utkanten og gir flere kall ved panorering | Middels — endrer hva brukeren ser |
| Slå 7 kall til ett | Færre round-trips, men **samme datamengde og CPU**. Bryter per-lag min-zoom og per-lag cache | Høy |
| `LIMIT` i rutenærhets-SQL | Riktig, men rammer ett kallsted som utløses langt sjeldnere enn pan/zoom | Lav effekt |

**Målt effekt** (verneomrader, faktiske spørringer mot databasen):

| Utsnitt | Full oppløsning | Med simplify |
|---|---:|---:|
| Zoom ~7–8 (8–16 Ø, 50–56 N), 8 833 soner | **133 MB** | **2,7–5,7 MB** |
| Zoom ~9 (Hamburg 2°×1°), 487 soner | **7,0 MB** | **868 kB** |
| Zoom ~11 i Mercator (½ px = 76 m) | 7,0 MB | **854 kB** |

## 2. Svar på de tre innvendingene

### 2.1 Toleranse i grader er anisotropisk — bekreftet, og planen endres

Innvendingen er riktig. Grader gir ulik forvrengning øst-vest og nord-sør, og
feilen vokser med breddegraden (ved 63° N er 1° lengdegrad ~50 km mot ~111 km i
nord-sør). Løsningen er å forenkle i **EPSG:3857**, ikke i grader:

```sql
ST_Transform(
  ST_SimplifyPreserveTopology(ST_Transform(geom, 3857), tol_m),
  4326
)
```

Web Mercator er lokalt konformt, så toleransen blir isotropisk, og — viktigere —
kartet *er* Web Mercator, så toleransen i Mercator-meter tilsvarer et fast antall
skjermpiksler uansett breddegrad. Toleransen settes til en halv piksel:
`tol = 156543.03 / 2^zoom / 2`.

| zoom | tolerance (Mercator-m) | desimaler i GeoJSON |
|---|---:|---|
| ≤ 7 | 611 | 4 |
| 8 | 306 | 4 |
| 9 | 153 | 5 |
| 10 | 76 | 5 |
| 11 | 38 | 5 |
| 12–13 | 19 / 10 | 6 |
| ≥ 14 | ingen simplify | 7 |

Merk at Mercator-meter ikke er sanne bakkemeter (skalafaktor 1/cos(lat) — ~2,2×
ved 63° N), men det er nettopp riktig oppførsel her: målet er *piksler på skjerm*,
ikke bakkeavstand. Målingen over (76 m ved zoom 11 → 854 kB) bekrefter at
Mercator-varianten gir samme besparelse som gradvarianten.

### 2.2 `ST_NPoints < 50`-unntaket skal inn i migrasjonen — bekreftet

Presiseringen tas inn: unntaket er **del av migrasjonen**, ikke en «vurder».
Terskelen settes til **`ST_NPoints(geom) <= 100`** slik at sikringsobjekter
(snitt 75 punkter, DE ~31 000 stk.) alltid returneres uforenklet. De er små i
utstrekning, koster lite å serialisere, og er de sonene der formtap ville vært
mest synlig.

```sql
CASE WHEN ST_NPoints(d.geom) <= 100 OR tol_m = 0
     THEN ST_AsGeoJSON(d.geom, decimals)::jsonb
     ELSE ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(
            ST_Transform(d.geom, 3857), tol_m), 4326), decimals)::jsonb
END
```

### 2.3 `p_zoom: 13` for rutenærhet — bevisst avveining, presisert

Riktig lest: 13 faller i båndet 10 m / 6 desimaler, altså lett forenkling, ikke
«ingen». Det er tilsiktet — rutenærhetslaget tegnes rundt en tegnet rute på høy
zoom, og 10 m avvik er under strekbredden. Presisering som tas inn i planen:
**forenklingen gjelder kun tegning.** Alle avstands- og konfliktberegninger går
via `airspace_zones_intersecting_route`, som ikke endres og fortsetter på full
geometri.

## 3. Implementasjonsplan

**Database (migrasjon):**

- `CREATE OR REPLACE FUNCTION public.airspace_zones_in_bbox(...)` med ny parameter
  `p_zoom integer DEFAULT NULL` sist i signaturen — `NULL` ⇒ ingen simplify, så
  eksisterende kall er uendret.
- Toleranse og desimaler utledes av `p_zoom` som i tabellen over.
- `ST_NPoints(geom) <= 100`-unntaket inkluderes.
- Simplify skjer **etter** dedupe-CTE-en, på færrest mulig rader. Filter, dedupe
  og indeksbruk står ellers urørt.
- `ST_SimplifyPreserveTopology` (ikke `ST_Simplify`) så polygoner ikke kollapser.

**Frontend:**

- `src/lib/mapDataFetchers.ts` → `fetchUnifiedAirspaceZones`: send `p_zoom: zoom`.
- `src/lib/unifiedRouteProximityLayers.ts`: send `p_zoom: 13`.
- `src/integrations/supabase/types.ts` regenereres etter migrasjonen.

## 4. Sidefunn (ikke del av denne fiksen)

`EXPLAIN ANALYZE` på verste-case-utsnittet viser at planleggeren velger
`airspace_zones_country_layer_active_ix` og kjører `ST_Intersects` som **filter**,
ikke som GiST-indeksoppslag — 9 710 rader forkastes etter geometrisjekk, og
spørringen brukte 6,1 s. En sammensatt indeks
`(layer_id, country_code) INCLUDE`-stil eller en partiell GiST per `layer_id` kan
gi ekstra gevinst. Bør måles separat etter at simplify er på plass.

## 5. Risiko og testing før produksjon

- **Visuell kvalitet**: verneområder og sikringsobjekter i DE/PL/SE på zoom 7, 9,
  11 og 14 — kanter skal ikke synlig kutte hjørner på det zoomnivået de vises.
- **Nordlige breddegrader**: test eksplisitt et utsnitt i Nord-Sverige/Finland
  (~68° N) for å bekrefte at Mercator-toleransen ikke overforenkler der.
- **Sikkerhetskritisk bruk**: forenklet geometri brukes **kun** til tegning;
  `airspace_zones_intersecting_route` røres ikke.
- **Bakoverkompatibilitet**: verifiser at kall uten `p_zoom` gir identisk resultat.
- **CPU-kostnad**: to `ST_Transform` per rad koster noe; mål at netto responstid
  faktisk går ned på zoom 7–9 der radantallet er høyest.
- **Etterkontroll**: sammenlign Query Performance etter 24 timer.
