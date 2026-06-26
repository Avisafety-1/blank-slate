## Mål
Når en rute tegnes i ruteplanleggeren skal luftfartshindre (master, vindturbiner, kabler, etc.) innenfor 500 m av ruten vises automatisk – på samme måte som naturvern, CAA-soner, NVE-kraftlinjer og AIS-skip allerede gjør.

## Endringer

### 1. `src/lib/routeProximityLayers.ts`
- Legg til ny kilde `obstacles` i `SourceCache` og `activeManualLayers`.
- Ny `loadObstacles(bbox, cache)`: spør `openaip_obstacles` (gjenbruker eksisterende tabell) filtrert via lat/lng-bbox. Siden tabellen kun har norske hindre og er liten, bruker vi `.select()` med klient-side bbox-filter (eller en enkel `range`-spørring på dekomponerte koordinater hvis nødvendig). Cache pr. bbox-key, ingen TTL (statiske data).
- Ny `renderObstacles(layer, obstacles, bufferPolygon)`: bruker `pointInRing` (samme presise 500 m buffer-filtrering som AIS) for å vise kun hindre faktisk innenfor buffer. Bruker samme rød trekant-ikon og popup-format som `fetchObstacles` i `mapDataFetchers.ts`, pluss `AUTO_BADGE` ("📍 Auto-vist langs ruten"). Tegnes i `routeProximityPane`.
- Inkluder i `Promise.all`-orkestrering med 5 s timeout, hopp over hvis `activeManualLayers.obstacles === true`.

### 2. `src/components/OpenAIPMap.tsx`
- Når `updateRouteProximityLayers` kalles, sett `activeManualLayers.obstacles` basert på om "luftfartshindre"-laget er aktivert i lag-menyen (samme mønster som de andre — finn eksisterende `activeManualLayers`-bygging og legg til `obstacles`-flagg ved å sjekke layer-toggle-state for `luftfartshindre`).
- Ingen pane-/interaktivitetsendringer nødvendig — `routeProximityPane` er allerede i `ROUTE_PLANNING_NON_INTERACTIVE_PANES`, så klikk legger ned rutepunkt i rutemodus og viser popup i Inspiser-modus.

## Tekniske detaljer
- Buffer: `ROUTE_PROXIMITY_BUFFER_M = 500 m` (gjenbrukt konstant).
- Datakilde: eksisterende `public.openaip_obstacles`-tabell (allerede synkronisert via `sync-openaip-obstacles` edge function).
- Ingen DB-migrasjon, ingen nye edge functions, ingen RLS-endringer.
- Punkt-i-buffer-test: `pointInRing` (eksisterer allerede i fila).
- Ikon/popup gjenspeiler manuelt "Luftfartshindre"-lag for visuell konsistens.