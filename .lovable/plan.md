## Problem

- RPC `get_obstacles_in_bounds` finnes og returnerer data (verifisert mot databasen).
- Tillatelser er korrekte (`anon`, `authenticated` har EXECUTE).
- Likevel vises ingen hindre når en rute tegnes.

Root cause-kandidater i frontend:
1. **`pointInRing`-filter** kan droppe alle treff hvis buffer-polygonet har orienterings-/wrap-problemer. NVE-kraftledninger går *ikke* gjennom dette filteret (kun bbox) — derfor virker de.
2. **`pane: PANE` på `L.marker`** med custom pane (`routeProximityPane`) kan gjøre ikoner usynlige i enkelte Leaflet-konfigurasjoner. NVE bruker `L.polyline` som rendres pålitelig i custom pane.
3. RPC-en er unødvendig — eksisterende manuelle `fetchObstacles` leser `openaip_obstacles` direkte via PostgREST og fungerer.

## Plan

### 1. Erstatt RPC-tilnærmingen med samme mønster som NVE/manuell fetcher
I `src/lib/routeProximityLayers.ts`:
- Drop `supabase.rpc("get_obstacles_in_bounds", ...)`.
- Last `openaip_obstacles` én gang per sesjon (lazy) via `supabase.from('openaip_obstacles').select('openaip_id, name, type, geometry, elevation, height_agl')` — på samme måte som `fetchObstacles` allerede gjør, og cache resultatet i `SourceCache.obstacles` som en global liste (ikke per bbox).
- Parse `geometry.coordinates` på klienten (samme som manuell fetcher).
- Filtrer i minne: først bbox-test, deretter (valgfritt) `pointInRing` mot buffer.

### 2. Gjør obstacle-rendering robust
- Bruk `pane: 'markerPane'` (Leaflets standard) i stedet for custom `routeProximityPane` for markørene, slik at de garantert er synlige. Klikk-blokkering i rutemodus håndteres allerede via `ROUTE_PLANNING_NON_INTERACTIVE_PANES` — vi legger til en explicit `interactive: false` på markørene når i `routePlanning`-modus (samme som manuell fetcher).
- Ev. alternativ: behold `routeProximityPane`, men sett `pane.style.pointerEvents` korrekt og verifiser at z-index (637) ikke skjules av andre lag.

### 3. Mykgjør buffer-filteret
- Bytt fra hard `pointInRing`-rejection til "bbox er nok" — hindre er punkter og bbox er allerede inflatert med 500 m. Dette matcher hvordan NVE-lag vises (kun bbox-filter), og fjerner risiko for at gyldige punkter droppes pga. polygon-orientering.

### 4. Fjern den ubrukte RPC-en
- Drop `public.get_obstacles_in_bounds` i en ny migrasjon (cleanup), siden frontend ikke lenger trenger den og NVE-mønsteret er enklere/mer konsistent.

### 5. Verifiser
- Tegn en rute over Oslo (der vi vet hindre finnes) og bekreft at røde trekant-markører vises.
- Sjekk at klikk på markører fungerer i Inspiser-modus, og at klikk i Rutemodus legger ned waypoint (ikke åpner popup).

## Tekniske detaljer

Endringer:
- `src/lib/routeProximityLayers.ts`: `loadObstacles` → direkte tabell-select med global cache; `renderObstacles` → `pane: 'markerPane'`, `interactive` styres av modus; fjern `pointInRing`-call (behold kun bbox-filter).
- Migrasjon: `DROP FUNCTION public.get_obstacles_in_bounds(double precision, double precision, double precision, double precision);`

Ingen endringer i `OpenAIPMap.tsx` påkrevet — `activeManualLayers.obstacles`-skipping forblir.
