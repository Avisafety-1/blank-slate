

## Problem: SSB befolkningsdata feiler for AI-risikovurdering

### Rotårsak
SSB har migrert WFS-tjenesten sin. Koden bruker to endepunkter som begge feiler:

1. **Primær-URL** (linje 522): `https://kart.ssb.no/arcgis/services/ekstern/befolkning_paa_rutenett/MapServer/WFSServer` → **404 Not Found** (fjernet av SSB)
2. **Fallback-URL** (linje 572): `https://kart.ssb.no/api/mapserver/v1/wfs/befolkning_paa_rutenett` med `typeName` (entall) og `outputFormat=application/json` → **400 Bad Request** (feil parameternavn + JSON-format støttes ikke)

### Verifisert fungerende endepunkt
```text
https://kart.ssb.no/api/mapserver/v1/wfs/befolkning_paa_rutenett
  ?SERVICE=WFS
  &VERSION=2.0.0
  &REQUEST=GetFeature
  &TYPENAMES=befolkning_1km_2025       ← WFS 2.0 krever TYPENAMES (flertall)
  &SRSNAME=EPSG:4326
  &BBOX={lat_min},{lng_min},{lat_max},{lng_max},EPSG:4326  ← lat,lng rekkefølge for WFS 2.0
  &COUNT=100
  (ingen outputFormat → returnerer GML/XML)
```

Testet med Trondheim-koordinater — returnerer data med befolkningstall (f.eks. 2969, 1899 per km²).

### Plan

**Fil: `supabase/functions/ai-risk-assessment/index.ts`** (linje 488–604)

1. Erstatt begge endepunkt-URLene med den verifiserte nye SSB-URLen
2. Endre `typeName` → `TYPENAMES` og fjern `outputFormat=application/json`
3. Bytt bbox-akseorden til lat,lng (WFS 2.0 med EPSG:4326)
4. Parse GML/XML-respons med regex for å ekstrahere befolkningstall (feltnavn fra GML-data)
5. Fjern den separate fallback-logikken (linje 571–597) siden vi nå bruker riktig URL direkte

### Tekniske detaljer

GML-responsen inneholder befolkningstall i XML-elementer. Vi parser med regex tilsvarende hvordan arealbruk allerede parses (linje 430). Nøkkelfelter å ekstrahere: `befolkning` eller `pop_tot` verdier fra GML-features.

Resten av logikken (GRC-beregning, terskler osv.) forblir uendret.

