# Auto-vis nærliggende kartlag-features langs ruten

Når brukeren tegner/har en aktiv rute i kartet, vis automatisk kun de feature-ne fra utvalgte lag som ligger innenfor 500 m fra ruten – selv om laget er skrudd av i lag-menyen. Fjernes automatisk når ruten endres bort fra dem eller slettes. Tilsvarende mønster som SSB-befolkningsruter rundt ruten i dag.

## Lag som inkluderes
- Verneområder (NO Naturvern + DK Nature)
- CAA drone-soner (NO – dronesoner.no, alle 5 lag)
- Kraftlinjer (NVE Nettanlegg4)

DK drone-soner og tettsteder forblir styrt av lag-menyen som i dag.

## Oppførsel
- Trigger: hver gang `coordinates`/ruten endres (også ved mid-punkt-innsetting, dragging, sletting), pluss ved last av eksisterende oppdragsrute.
- Buffer: 500 m rundt rute-polylinjen (gjenbruker `bufferPolyline` fra `src/lib/soraGeometry.ts`).
- Kun features som faktisk skjærer 500 m-bufferen vises. Andre features i samme lag forblir skjult.
- Re-evaluering ved hver rute-endring – features som ikke lenger er innenfor bufferen fjernes.
- Når ruten tømmes eller oppdraget lukkes: proximity-laget tømmes helt.
- Manuelt aktivert lag i lag-menyen vises som vanlig i tillegg. Proximity-laget skipper rendering for kilder hvis det tilhørende manuelle laget allerede er aktivt (`map.hasLayer`).
- Proximity-features får tydelig stroke + "Auto-vist langs rute"-etikett i popup.

## Ytelses-mottiltak (sikrer at funksjonen er lett)

1. **Debounce 300 ms** på `coordinates`-effekten – dragging av et punkt utløser kun ett kall etter at brukeren slipper.
2. **AbortController** – ny rute-endring kansellerer alle pågående fetch-kall (Supabase `.abortSignal(signal)` + `fetch(..., { signal })` for NVE).
3. **Bbox-cache** – `Map<string, Features[]>` per kilde, nøkkel = `"<source>:<roundedBboxKey>"` der bbox rundes til ~250 m rutenett. Treffer cache når brukeren drar et punkt frem og tilbake. Cache tømmes ved unmount og når oppdrag byttes.
4. **Per-kilde feiltoleranse** – egen `try/catch` per kilde med 5 s timeout. NVE-feil/treghet stopper ikke verneområder/CAA fra å vises.
5. **Begrensninger på datamengde** – bbox = rutens bounding box + 500 m. Supabase-spørringer får `.limit(500)`, NVE får `resultRecordCount=500`.
6. **Skip hvis ruten har < 2 punkter** – ingen kall før det faktisk er en linje å buffre.

## Teknisk

**Ny fil:** `src/lib/routeProximityLayers.ts`
- `computeRouteBufferPolygon(coordinates, 500)` via eksisterende `bufferPolyline`.
- `filterFeaturesByBuffer(features, buffer)` – bbox-prefilter + segment/polygon-intersect (utvider helpers i `mapGeometry.ts`).
- `fetchRouteProximityFeatures({ bufferBbox, signal, cache })` orkestrerer parallelle kall til de tre kildene med per-kilde `try/catch` og timeout.

**`src/lib/mapDataFetchers.ts`** (ren refaktor + nye raw-hjelpere):
- Trekk ut styling/popup-bygging fra `fetchNaturvernZones`, `fetchVernRestrictionZones`, `fetchCaaDroneZones` og NVE-fetcheren til delte eksporterte hjelpere.
- Nye eksporter: `loadNaturvernRaw`, `loadVernRestrictionRaw`, `loadCaaDroneZonesRaw`, `loadNvePowerLinesRaw` – alle tar `{ bounds, signal, limit }`.

**`src/components/OpenAIPMap.tsx`:**
- Ny pane `routeProximityPane` (z-index ~637, mellom NSM og populationDensity), interactive for popups.
- `routeProximityLayerRef = useRef<L.LayerGroup>()`, `proximityCacheRef = useRef<Map<string, unknown[]>>(new Map())`, `proximityAbortRef = useRef<AbortController | null>(null)`, `proximityDebounceRef = useRef<number | null>(null)`.
- Ny `useEffect` på `[coordinates]`:
  1. Clear debounce-timer. Hvis < 2 punkter → clearLayers + return.
  2. Sett 300 ms `setTimeout`. I callback: abort forrige controller, lag ny.
  3. Bygg buffer + bbox, kall `fetchRouteProximityFeatures` med cache + signal.
  4. Filtrer features mot buffer, skip kilder hvis manuelt lag er aktivt, render i `routeProximityPane` med samme styling som hovedlagene.
- Cleanup ved unmount: abort, clear timeout, clear cache, remove layer.

## Ikke i scope
- Endring av default-tilstand for lagene i lag-menyen.
- 3D-kartet (`Map3D.tsx`).
- DK drone-soner og tettsteder.
- Endring av SORA adjacent-area-logikken eller SSB-rutene.
