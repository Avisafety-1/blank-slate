

## Naturvernområder og vern-restriksjoner i luftromsadvarsler

### Problem
`check_mission_airspace` sjekker kun `aip_restriction_zones`, `nsm_restriction_zones` og `rpas_5km_zones`. Naturvernområder og ferdsels-/landingsforbud fra Miljødirektoratet er kun synlige som WMS-kartlag, men genererer ingen advarsler i oppdragsvisningen.

### Plan

#### 1. Ny databasetabell: `naturvern_zones`
Migrasjon som oppretter tabell med samme struktur som de andre geo-tabellene:
- `id`, `external_id`, `name`, `description`, `geometry` (PostGIS), `properties` (jsonb), `verneform` (text)
- RLS: authenticated select
- GIST-indeks på geometry

#### 2. Ny databasetabell: `vern_restriction_zones`
Samme struktur, med ekstra felt `restriction_type` (ferdselsforbud/landingsforbud/lavflyving).

#### 3. Utvide `sync-geo-layers` edge function
Legge til to nye datakilder i `LAYER_SOURCES`:

```text
naturvern_zones:
  URL: kart.miljodirektoratet.no/arcgis/rest/services/vern/FeatureServer/0/query
       ?where=1=1&outFields=navn,verneform,offisieltNavn&outSR=4326&f=geojson
  nameField: [navn, offisieltNavn]

vern_restriction_zones (3 lag samlet):
  lag 0: ferdselsforbud
  lag 1: lavflyving_forbudt_under_300m
  lag 2: landingsforbud
  nameField: [navn]
```

Merk: naturvern har 2800+ features og paginering (maxRecordCount=2000), så sync-funksjonen må håndtere resultOffset/resultRecordCount.

#### 4. Oppdatere `check_mission_airspace` RPC
Legge til to UNION ALL-blokker i `candidate_zones`:

```sql
UNION ALL
SELECT
  n.id::text,
  'NATURVERN',
  COALESCE(n.name, 'Ukjent'),
  n.geometry
FROM naturvern_zones n
WHERE n.geometry IS NOT NULL
  AND ST_DWithin(n.geometry::geography, v_envelope::geography, 5000)

UNION ALL
SELECT
  v.id::text,
  v.restriction_type,
  COALESCE(v.name, 'Ukjent'),
  v.geometry
FROM vern_restriction_zones v
WHERE v.geometry IS NOT NULL
  AND ST_DWithin(v.geometry::geography, v_envelope::geography, 5000)
```

Severity-mapping i CASE:
- `FERDSELSFORBUD`, `LANDINGSFORBUD` → `'WARNING'`
- `LAVFLYVING` → `'CAUTION'`
- `NATURVERN` → `'INFO'`

Søkeradius 5 km (ikke 50 km som luftrom — naturvern er kun relevant når man er i nærheten).

#### 5. Frontend: AirspaceWarnings.tsx
Legge til meldingslogikk for de nye sonetypene:

```text
NATURVERN (inside):  "Ruten går gjennom naturvernområde «{navn}». Sjekk verneforskriften for eventuelle restriksjoner."
NATURVERN (nearby):  "Nærhet til naturvernområde «{navn}», {dist} unna."
FERDSELSFORBUD (inside): "Ruten går gjennom område med ferdselsforbud «{navn}». Droneflyvning kan være forbudt."
LANDINGSFORBUD (inside): "Ruten går gjennom område med landingsforbud «{navn}». Landing/start forbudt."
LAVFLYVING (inside): "Ruten går gjennom område med lavflyvingsforbud under 300m «{navn}»."
```

### Filer som endres
1. **Ny migrasjon** — tabeller `naturvern_zones` og `vern_restriction_zones` + oppdatert `check_mission_airspace`
2. **`supabase/functions/sync-geo-layers/index.ts`** — nye datakilder + paginering
3. **`src/components/dashboard/AirspaceWarnings.tsx`** — meldinger for nye sonetyper

