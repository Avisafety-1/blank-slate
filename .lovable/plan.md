

## Fix: sync-geo-layers for naturvern og vern-restriksjoner

### Problem
Miljødirektoratets ArcGIS FeatureServer støtter ikke `f=geojson`. Funksjonen mottar HTML istedenfor JSON og krasjer. De andre lagene (NSM, RPAS) bruker en annen ArcGIS-instans som støtter GeoJSON.

### Løsning

**Fil: `supabase/functions/sync-geo-layers/index.ts`**

1. Endre naturvern-URL fra `f=geojson` til `f=json`
2. Endre vern-restriksjons-URLer fra `f=geojson` til `f=json`
3. Legge til konverteringsfunksjon `esriToGeoJson()` som mapper Esri ring/path-geometri til GeoJSON:
   - `{ rings: [...] }` → `{ type: "Polygon", coordinates: [...] }`
   - Koordinater: Esri bruker `[x, y]` (lon, lat) -- samme som GeoJSON, ingen konvertering nødvendig
4. Oppdatere `fetchAllFeaturesPaginated` til å håndtere Esri JSON-respons (`data.features` med `attributes` + `geometry` istedenfor GeoJSON `properties`)
5. Legge til null-guard på geometri -- skippe features uten gyldig geometri
6. Oppdatere feature-prosessering for naturvern og vern-restriksjoner til å lese `feature.attributes` istedenfor `feature.properties`

### Teknisk detalj
```text
Esri JSON feature format:
{
  "attributes": { "navn": "...", "OBJECTID": 123 },
  "geometry": { "rings": [[[x,y],[x,y],...]] }
}

GeoJSON feature format:
{
  "properties": { "navn": "..." },
  "geometry": { "type": "Polygon", "coordinates": [[[x,y],[x,y],...]] }
}

Konvertering: attributes → properties, rings → Polygon coordinates
```

### Filer som endres
- `supabase/functions/sync-geo-layers/index.ts` -- bytte til `f=json`, ny konverteringsfunksjon, null-guards

