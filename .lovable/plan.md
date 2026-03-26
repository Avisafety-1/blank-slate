

## Naturvernområder og vern-restriksjoner fra databasen i kartet

### Nåværende situasjon
- **AIP-soner** (P/R/D/RMZ/TMZ/ATZ): hentes fra Supabase → vektorlag med popups ✅
- **NSM, RPAS**: hentes fra ArcGIS direkte som GeoJSON → vektorlag med popups
- **Naturvern + vern-restriksjoner**: vises som **WMS bildelag** (ingen popups, ingen interaktivitet utover synlighet)

### Endring
Erstatte de to WMS-lagene med vektorlag som henter data fra `naturvern_zones` og `vern_restriction_zones` i databasen — samme mønster som `fetchAllAipZones` gjør i dag.

### Plan

**Fil: `src/lib/mapDataFetchers.ts`** — legg til to nye funksjoner:

1. **`fetchNaturvernZones()`** — henter fra `naturvern_zones`-tabellen
   - Fargekoding basert på `verneform` (nasjonalpark = grønn, naturreservat = mørkegrønn, landskapsvernområde = lysegrønn, etc.)
   - Popup med navn, verneform og eventuelle properties
   - Lav fillOpacity (0.15) for å ikke overdominere kartet

2. **`fetchVernRestrictionZones()`** — henter fra `vern_restriction_zones`-tabellen
   - Fargekoding basert på `restriction_type` (FERDSELSFORBUD = rød, LANDINGSFORBUD = oransje, LAVFLYVING = gul)
   - Popup med navn og restriksjonstype

**Fil: `src/components/OpenAIPMap.tsx`** — bytt ut WMS-lagene:
- Erstatt `naturvernLayer` (WMS) med et `L.layerGroup()` som fylles av `fetchNaturvernZones()`
- Erstatt `vernRestriksjonLayer` (WMS) med et `L.layerGroup()` som fylles av `fetchVernRestrictionZones()`
- Kall de nye funksjonene på samme sted som `fetchNsmData()` etc. kalles (linje 540-543, og re-fetch ved auth-endring linje 580-585)

### Fordeler
- Raskere lasting (data allerede i Supabase, ingen ekstern WMS-server)
- Interaktive popups med navn og detaljer
- Konsistent med hvordan AIP-soner fungerer
- Data er allerede synkronisert via `sync-geo-layers`

### Filer som endres
1. `src/lib/mapDataFetchers.ts` — to nye eksporterte funksjoner
2. `src/components/OpenAIPMap.tsx` — bytt WMS → vektorlag, kall nye funksjoner

