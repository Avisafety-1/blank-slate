
Mål: få `sync-geo-layers` til å fullføre uten 500, og faktisk laste inn naturvernområder.

Hva jeg fant
- Dette er sannsynligvis ikke “gammel data”. Edge-loggene viser at ny kode faktisk kjører:
  - `Starting geo layers synchronization...`
  - `nsm_restriction_zones: 155 ok, 40 failed`
  - `Error syncing naturvern_zones: Error: Esri error: Error performing query operation`
  - `CPU Time exceeded`
- Databasen bekrefter delvis sync:
  - `naturvern_zones = 0`
  - `vern_restriction_zones = 812`
  - øvrige lag har data
- Jeg kan ikke starte sync fra read-only mode, men problemet er tydelig nok til å planlegge en presis fix.

Rotårsak
1. `naturvern`-kallet henter for store batcher  
   `FeatureServer/0` svarer fint på små kall, men feiler på store geometri-kall. Metadata viser `maxRecordCount = 2000`, men i praksis ser store polygon-svar ut til å bli for tunge.
2. Funksjonen gjør altfor mange RPC-kall ett-og-ett  
   3000+ naturvernfeatures + andre lag gir for mange serielle databasekall, som treffer `CPU Time exceeded`.
3. Standardlagene mangler robust geometri-guard  
   `nsm_restriction_zones` gir mange `invalid GeoJSON representation`, som tyder på null/ugyldig geometri som ikke hoppes over.

Plan
1. Gjør syncen batch-basert for naturvern
- Endre naturvern-flyten til:
  - hent først `OBJECTID`-liste med `returnIdsOnly=true`
  - del opp i små chunker (f.eks. 50–100 IDs)
  - hent features per chunk med `objectIds=...`
- Dette er mer stabilt enn `resultOffset/resultRecordCount` med tunge polygoner.

2. Flytt fra feature-for-feature RPC til bulk-upsert
- Lag nye databasefunksjoner som tar inn en `jsonb`-array per batch og gjør insert/upsert i én operasjon per chunk.
- Gjelder:
  - `naturvern_zones`
  - `vern_restriction_zones`
  - gjerne også standard geojson-lag for konsistens
- Resultat: dramatisk færre roundtrips og langt lavere risiko for timeout.

3. Legg inn harde geometri-sjekker
- Skip features når:
  - `geometry` mangler
  - geometri ikke kan konverteres til gyldig GeoJSON
  - polygon/rings er tomme
- Logg `skippedCount` eksplisitt per lag i stedet for at RPC feiler.

4. Behold Esri JSON for Miljødirektoratet-lagene
- Kartet fungerer fordi WMS-laget er riktig.
- Luftromsadvarslene trenger fortsatt vektordata i databasen.
- Derfor skal vi fortsette med `f=json` + Esri→GeoJSON-konvertering, men med små batcher.

5. Gjør funksjonen tryggere å kjøre manuelt
- Legg til støtte for valgfri delsync, f.eks. `layer=naturvern` eller `layer=vern_restriction_zones`.
- Da kan vi re-kjøre bare det som feiler, i stedet for hele syncen hver gang.

Validering etter implementasjon
- `sync-geo-layers` skal returnere 200 uten `CPU Time exceeded`
- `naturvern_zones` skal få > 0 rader
- `nsm_restriction_zones` skal ikke lenger spamme `invalid GeoJSON representation`
- Luftromsadvarsler skal begynne å treffe naturvern og vern-restriksjoner fra DB, ikke bare kart-WMS

Filer/områder som bør endres
- `supabase/functions/sync-geo-layers/index.ts`
- ny migrasjon for bulk-upsert-funksjoner til geo-tabellene
- eventuelt liten utvidelse av logging/response-format i sync-funksjonen

Teknisk retning
```text
Nå:
ArcGIS -> store responses -> per-feature RPC -> CPU timeout / 500

Etter:
ArcGIS returnIdsOnly
  -> små objectId-chunker
  -> bulk-upsert per chunk
  -> skip ugyldig geometri
  -> stabil 200-response
```
