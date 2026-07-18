## Mål

1. Auto-avdekk underliggende kartlag når man tegner en rute i DK/SE/DE/FI (samme oppførsel som i Norge i dag).
2. Fikse Eurostat befolkningstetthets-laget slik at det vises når man aktiverer det manuelt fra lag-menyen.

Ingenting endres for Norge eller for selskaper utenfor "Moderavdeling"-allowlisten.

---

## Del 1 — Fikse Eurostat WMS-lag

**Rotårsak (verifisert):** GISCO WMS-endepunktet `PopulationGrid2021` returnerer `ServiceException` når Leaflet ber om `EPSG:3857` (server-side kilde svarer ikke). Samme forespørsel i `EPSG:4326` gir gyldig PNG. Leaflets `L.tileLayer.wms` bruker `EPSG:3857` som standard på en 3857-basert kart-CRS, derfor blir laget usynlig når det skrus på.

**Fiks i `src/components/OpenAIPMap.tsx`:**
- Endre `eurostatPopLayer`-definisjonen (rundt linje 981) til å tvinge `crs: L.CRS.EPSG4326` og bruke `version: "1.1.1"` + `uppercase: true`, så tile-URL-en spør EC-tjenesten i den CRS-en den faktisk klarer å levere.
- Beholde `opacity`, `minZoom` og `maxNativeZoom` som i dag.
- Ingen endring på SSB-laget (Norge).

## Del 2 — Auto-avdekk lag ved rute-tegning i DK/SE/DE/FI

Norge har i dag `updateRouteProximityLayers` i `src/lib/routeProximityLayers.ts` som ved rute-endring henter en 500 m bbox og viser vernområder, CAA-soner, kraftledninger og AIS uansett om laget er huket av. Vi utvider samme mønster til unified-landene, med samme gating som allerede finnes (`is_unified_airspace_enabled_for_me()` + NO ekskludert).

**Nye kilder som skal auto-avdekkes langs rute i unified-land:**
- Unified airspace-soner (`airspace_zones_intersecting_route` — allerede optimalisert med bbox-prefilter og timeout).
- Natur/verneområder for DK (`dk_nature_areas`) og DE (`airspace_zones` med `zone_type` = nature).
- Eurostat befolknings-cell overlay: n/a — vi lar WMS-laget selv håndtere visning (fikset i Del 1).

**Implementasjon:**

1. **Ny hjelperfunksjon `updateUnifiedRouteProximityLayers`** i `src/lib/routeProximityLayers.ts` (eller ny fil `unifiedRouteProximityLayers.ts` for å holde Norge-koden ren):
   - Input: `map`, dedikert `L.LayerGroup` for unified-proximity, `coordinates`, `signal`, `activeManualLayers`-hint.
   - Bruker `getUnifiedCountriesForRoute()` fra `src/lib/airspaceUnified.ts` for å bare treffe relevante land.
   - Kaller `airspace_zones_intersecting_route` (uten dedup i UI — samme RPC som warnings bruker) og renderer polygoner med `PANE = "routeProximityPane"` og "auto-vist"-badge i popup.
   - Kaller `dk_nature_areas_in_bounds` (eksisterende RPC) for DK-natur når DK er relevant.
   - Skipper kilder som er aktive manuelt (samme `activeManualLayers`-mønster som i dag).
   - Timeout og AbortSignal som eksisterende funksjon.

2. **Wiring i `src/components/OpenAIPMap.tsx`:**
   - Legge til en `unifiedRouteProximityLayerRef` (egen `L.LayerGroup`, egen cache/abort) parallelt med eksisterende `routeProximityLayerRef`.
   - Trigges av samme rute-endrings-effekt som Norge-proximity, men bak samme gate som `AirspaceWarnings` bruker: `is_unified_airspace_enabled_for_me()` cache + minst ett unified-land i rutas bbox.
   - Ved rute-clear eller ingen relevante land: `layer.clearLayers()`.

3. **Ingen endringer i map-lag-listen eller default toggles** — laget er en implisitt "route drawn"-overlay, akkurat som i Norge.

## Ikke inkludert / bevisst utelatt

- Ingen endring for NO-brukere eller selskaper utenfor allowlist.
- Ingen ny database-migration; alt bygger på eksisterende RPC-er.
- SE/FI får kun unified-airspace auto-reveal (vi har ikke egne natur-tabeller for disse i dag).
- Ingen endring i `AirspaceWarnings`-panelet — det er allerede riktig.

## Filer som endres

- `src/components/OpenAIPMap.tsx` — Eurostat CRS-fix + wiring av unified route-proximity effekt/ref.
- `src/lib/routeProximityLayers.ts` (eller ny søsterfil) — ny `updateUnifiedRouteProximityLayers` + rendering-hjelpere.

## Verifisering

- Manuell test i "Moderavdeling": tegn rute i DE → se at unified airspace-polygoner dukker opp langs ruten uten å skru på laget.
- Skru på "Befolkning" fra lag-menyen mens kartet er over Tyskland → Eurostat-ruter skal males på.
- Norsk konto: tegn rute i Norge → ingen atferdsendring, ingen ekstra RPC-kall.
