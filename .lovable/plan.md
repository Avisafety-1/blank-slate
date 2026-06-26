## Problem
Når ruten automatisk avslører lag (verneområder, fareområder, kraftlinjer, AIS, CAA-soner) tegnes disse i `routeProximityPane` (z-index 637) med `pointerEvents: "auto"`. Panet er ikke inkludert i `ROUTE_PLANNING_NON_INTERACTIVE_PANES`, så klikk over disse formene åpner popup i stedet for å legge ned rutepunkt.

## Endringer (kun `src/components/OpenAIPMap.tsx` + `src/index.css`)

1. **`OpenAIPMap.tsx`** – legg `'routeProximityPane'` til `ROUTE_PLANNING_NON_INTERACTIVE_PANES`-konstanten. Da slår eksisterende `syncRoutePlanningInteractivity`-effekt automatisk pointer-events av i rutemodus og på igjen i Inspiser-modus / view-modus.

2. **`OpenAIPMap.tsx`** – etter at proximity-laget rendres, kall `setLeafletLayerInteractivity(routeProximityLayerRef.current, overlaysInteractive)` (eller registrer det i `routePlanningInteractiveLayerRefs`) slik at individuelle path/marker-elementer (AIS-markører, polygoner) også får `interactive: false` og `pointer-events: none` i rutemodus — samme mønster som CAA-sirklene.

3. **`src/index.css`** – legg til regler for `.route-planning-active .leaflet-route-proximity-pane path/.leaflet-interactive/.leaflet-marker-icon { pointer-events: none; }` så også markører (AIS-skip) slipper klikk gjennom.

## Resultat
- Rutemodus: klikk på et auto-avslørt verneområde/fareområde/AIS-skip legger ned rutepunkt som forventet.
- Inspiser-modus: popup-er på samme lag fungerer som før.
- View-modus: uendret.
