

# Klikkbar flytur-rute: Vis data for naermeste punkt

## Problem
Flyspor-polylinjen paa kartet har ingen klikk-haandtering. Telemetridata vises kun via usynlige sirkelmarkorer (`fillOpacity: 0.01`, `radius: 4-5px`) plassert paa hvert 5. punkt. Brukeren maa treffe disse naesten usynlige punktene presist for aa se data.

## Losning
Legge til en klikk-haandterer paa selve polylinjen (og segmentene) som finner naermeste datapunkt og viser popup med telemetri. Dette gjelder begge komponentene som viser lagrede flyspor.

## Endringer

### 1. `src/components/dashboard/ExpandedMapDialog.tsx`

**Erstatt de usynlige circleMarker-ene (linje 276-293) med en klikk-haandterer paa hele polylinjen:**

- Samle alle polyline-segmenter i en `L.featureGroup` med en felles klikk-haandterer
- Ved klikk: beregn avstand fra klikk-koordinat til alle posisjoner i tracket
- Finn naermeste punkt og vis popup med telemetridata (samme format som i dag)
- Behold start/slutt-markorer som de er (de er synlige og fungerer)
- Oek `weight` fra 4 til 6 for storre klikkbart omraade

### 2. `src/components/dashboard/MissionMapPreview.tsx`

**Samme endring:**

- Legg til klikk-haandterer paa den gronne polylinjen (linje 149-153)
- Ved klikk: finn naermeste punkt i `track.positions` og vis popup
- Fjern de usynlige circleMarker-ene (linje 158-176)
- Oek `weight` fra 3 til 5

### Teknisk implementasjon

Klikk-haandterer-funksjonen (brukes i begge filer):

```text
polyline.on('click', (e) => {
  const clickLatLng = e.latlng;
  let nearestIdx = 0;
  let minDist = Infinity;
  
  track.positions.forEach((pos, idx) => {
    const dist = clickLatLng.distanceTo(L.latLng(pos.lat, pos.lng));
    if (dist < minDist) {
      minDist = dist;
      nearestIdx = idx;
    }
  });
  
  const pos = track.positions[nearestIdx];
  // Bygg popup-innhold med telemetridata
  L.popup()
    .setLatLng([pos.lat, pos.lng])
    .setContent(buildPopupContent(pos, nearestIdx, track.positions.length))
    .openOn(map);
});
```

### Filer som endres

| Fil | Endring |
|-----|---------|
| `src/components/dashboard/ExpandedMapDialog.tsx` | Klikk-haandterer paa polyline-segmenter, fjern usynlige markorer |
| `src/components/dashboard/MissionMapPreview.tsx` | Klikk-haandterer paa polyline, fjern usynlige markorer |

