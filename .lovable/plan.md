

## Erstatt sirkelmarkør med droneikon på høydeprofil-hovring

Når brukeren hovrer over høydeprofilen i det utvidede kartet, vises det i dag en liten hvit sirkel (`L.circleMarker`) på kartet. Denne skal erstattes med det animerte droneikonet (`drone-animated.gif`) som allerede brukes for DroneTag-posisjoner på hovedkartet.

### Endringer

**Fil: `src/components/dashboard/ExpandedMapDialog.tsx`**

1. Importere droneikon-bildet (`drone-animated.gif`) fra assets
2. Endre `highlightMarkerRef` fra `L.CircleMarker` til `L.Marker` (vanlig markør med egendefinert ikon)
3. Erstatte `L.circleMarker(...)` (linje ~483) med en `L.marker(...)` som bruker `L.divIcon` med droneikon-bildet — samme mønster som brukes i `OpenAIPMap.tsx` for DroneTag-markører
4. Størrelsen settes til ca. 48x48px (litt mindre enn de 70px som brukes på hovedkartet, for å passe bedre i konteksten)

### Tekniske detaljer

Koden som endres (linje 67 og 482-490):

```typescript
// Ref-type endres:
const highlightMarkerRef = useRef<L.Marker | null>(null);

// Markør-opprettelse endres fra:
highlightMarkerRef.current = L.circleMarker([point.lat, point.lng], {
  radius: 8, fillColor: "#ffffff", ...
}).addTo(map);

// Til:
const droneHighlightIcon = L.divIcon({
  className: '',
  html: `<img src="${droneAnimatedIcon}" style="width:48px;height:48px;" />`,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});
highlightMarkerRef.current = L.marker([point.lat, point.lng], {
  icon: droneHighlightIcon,
  pane: "flightTrackPane",
}).addTo(map);
```

Ikonet vil også rotere basert på `heading`-data fra flysporet hvis tilgjengelig, slik at dronen peker i riktig retning.

