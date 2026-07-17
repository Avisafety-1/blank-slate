## Problem

Kartlags-knappene i /kart leser i dag kun fra land-spesifikke legacy-tabeller (CAA=NO, `dk_drone_zones`/`dk_nature_areas`=DK). Data i den nye `airspace_zones`-tabellen for SE (381), DE (46 315) og FI (1 012) — pluss unified DK — blir aldri hentet. Derfor er kartet tomt over Tyskland selv om dataene finnes.

Foreløpig wiring (`AirspaceWarnings.tsx`) leverer bare tekst-advarsler for en aktiv rute — ingen polygoner.

## Mål

Vise `airspace_zones`-polygoner på kartet for de eksisterende lag-knappene, **kun** for brukere i `airspace_unified_company_allowlist` (i dag Moderavdeling). Ingen andre selskaper skal se noen endring. NO forblir helt utenfor.

## Løsning (additiv, én fil)

`airspace_zones.layer_id` matcher allerede eksisterende knappe-IDer:
- `airspace` (CTR/TIZ/ATZ), `rpas`, `restriksjonsomrader`, `fareomrader`, `sikringsobjekter`, `verneomrader`

Én ny fetcher — `fetchUnifiedAirspaceZones(...)` i `src/lib/mapDataFetchers.ts` — kaller RPC-en `airspace_zones_in_bbox(min_lng, min_lat, max_lng, max_lat, null, ['DK','SE','DE','FI'], [layerId])`. Én fetcher per aktivt lag, samme diff-render-mønster som `fetchDkDroneZones` (ingen flicker).

I `OpenAIPMap.tsx`:

1. Opprett seks nye `L.layerGroup()`-instanser: `unifiedAirspaceLayer`, `unifiedRpasLayer`, `unifiedRestrictedLayer`, `unifiedDangerLayer`, `unifiedSecurityLayer`, `unifiedNatureLayer`.
2. Legg dem inn i eksisterende `layerConfigs.push({ ... layer: [...] })`-array for samme knapp — slik at UI-listen ikke får noen nye rader og bestående brukere ser identisk meny.
3. Ny `fetchUnifiedLayers()` som (a) sjekker cachet flagg via `isUnifiedAirspaceEnabled()` → returnerer tidlig hvis false, (b) hopper over hvis zoom < 7 (DE har 46k soner — trenger zoom-terskel), (c) sender parallelle bbox-kall per aktivert lag.
4. Wire `fetchUnifiedLayers()` inn i eksisterende `debouncedFetchVern` og `layeradd`/`layerremove`-håndterere — samme cache-nøkkelmønster (`resetCache('unified:<layerId>', lg)`).
5. Legg de nye LayerGroup-referansene i den store `[...].forEach(l => l.addTo(map))`-listen så de faktisk mounter (men rendrer ingenting før fetcheren populerer dem).

## Gating (fail-closed)

- `isUnifiedAirspaceEnabled()` (60 s cache) er eneste inngangsport. RPC-en returnerer true kun hvis global flag ER PÅ **og** brukerens `company_id ∈ airspace_unified_company_allowlist`.
- For alle andre selskaper: fetch-kallet gjøres aldri, layerGroups forblir tomme — kart-oppførselen er bit-identisk med i dag.
- NO er dobbel-blokkert: ikke i `country_codes`-arrayet, og backend-RPC-en filtrerer allerede på `active=true` + `country_code`.

## Ytelse-hensyn (DE = 46k rader)

- Zoom-terskel 7 (samme som DK) — RPC-en spatial-indekserer på `geom`.
- `airspace` (CTR): 69 DE — trygg fra zoom 7.
- `sikringsobjekter` (DE 31 001) og `verneomrader` (DE 13 829): sett zoom-terskel 10 for disse to lagene spesifikt, ellers får vi 30k features i én bbox.
- Alle kall bruker samme diff-render (add/remove pr. `external_id`) som eksisterende fetchers.

## Styling

Behold eksisterende visuelle konvensjoner per `restriction_type`:
- PROHIBITED → rød fylling
- APPROVAL_REQUIRED → oransje
- CAUTION → gul
- NOTIFICATION → blå
- NATURE_SENSITIVE → grønn

Popups viser `name`, `zone_type`, `country_code`, `authority`, `lower_limit_m`–`upper_limit_m` (samme som DK-popupene).

## Filer som endres

- `src/lib/mapDataFetchers.ts` — ny `fetchUnifiedAirspaceZones()` + delt style/popup-helper.
- `src/components/OpenAIPMap.tsx` — 6 nye LayerGroups, wiring i eksisterende push-arrays, ny `fetchUnifiedLayers()` + integrasjon i `debouncedFetchVern`/`layeradd`/`layerremove`.

Ingen DB-endringer. Ingen endring i `mapLayers.ts`-config (knappene finnes allerede).

## Verifisering

1. Logg inn som Moderavdeling-bruker → zoom til Tyskland zoom 8+ → aktiver "P/R/D-soner" og "Fareområder" → polygoner skal dukke opp.
2. Logg inn som en NO-bruker (annet selskap) → åpne samme område → ingen unified-data skal vises, nettverksfanen skal ikke inneholde `airspace_zones_in_bbox`-kall.
3. Zoom < 7 i Tyskland → ingen fetch, ingen render.
4. NO-bruker som panner i Norge → uendret, kun legacy CAA-lag vises.
