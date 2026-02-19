
# Fix: "Invalid LatLng object: (NaN, NaN)" — koordinatvalidering for SORA-soner

## Rotårsak

Ja, feilen er direkte koblet til Flight Geography Area-laget som ble lagt til nylig.

I `soraGeometry.ts` linje 283 kjøres dette **alltid** uavhengig av innstillinger:
```ts
const flightGeo = bufferPolyline(coordinates, 1);
```

I `MissionMapPreview.tsx` linje 106 sendes koordinatene fra databasen uten validering:
```ts
renderSoraZones(route.coordinates, { flightGeographyDistance: 0, ...route.soraSettings }, soraLayer);
```

Noen oppdrag i produksjonsdatabasen har lagrede ruter med ugyldige koordinatverdier (`null`, `undefined` eller `NaN` for `lat`/`lng`). Disse propagerer gjennom bufferberegningene og produserer `NaN`-koordinater som krasjer Leaflet.

## To-lags forsvar (defense in depth)

### Lag 1: `MissionMapPreview.tsx` — filtrer koordinater FØR kall (linje 105-107)

Filtrer ut ugyldige punkter før `renderSoraZones` kalles:

```tsx
// FØR:
if (route?.soraSettings) {
  renderSoraZones(route.coordinates, { flightGeographyDistance: 0, ...route.soraSettings }, soraLayer);
}

// ETTER:
if (route?.soraSettings) {
  const validCoords = (route.coordinates ?? []).filter(
    p => p != null &&
         typeof p.lat === 'number' && isFinite(p.lat) &&
         typeof p.lng === 'number' && isFinite(p.lng)
  );
  if (validCoords.length >= 1) {
    renderSoraZones(validCoords, { flightGeographyDistance: 0, ...route.soraSettings }, soraLayer);
  }
}
```

### Lag 2: `soraGeometry.ts` — NaN-guard i `renderSoraZones` (linje 253)

Legg til en tidlig exit øverst i `renderSoraZones` som stopper alt dersom noen koordinater er ugyldige:

```ts
export function renderSoraZones(...) {
  if (!sora.enabled || coordinates.length < 1) return;
  // Guard mot NaN/null-koordinater
  if (coordinates.some(p => !p || !isFinite(p.lat) || !isFinite(p.lng))) return;
  // ... resten
}
```

### Lag 3: `soraGeometry.ts` — NaN-guard i `bufferPolyline` og `bufferPolygon`

Legg til tidlig retur øverst i begge funksjoner:

```ts
// bufferPolyline (linje 27):
if (points.some(p => !isFinite(p.lat) || !isFinite(p.lng))) return points;

// bufferPolygon (linje ~199):
if (hull.some(p => !isFinite(p.lat) || !isFinite(p.lng))) return hull;
```

## Filer som endres

| Fil | Endring |
|---|---|
| `src/components/dashboard/MissionMapPreview.tsx` | Koordinatfiltrering før `renderSoraZones`-kall |
| `src/lib/soraGeometry.ts` | NaN-guards i `renderSoraZones`, `bufferPolyline`, `bufferPolygon` |

## Forventet resultat

- Klikk på oppdragskort på mobil krasjer ikke lenger
- SORA-soner rendres fortsatt korrekt for oppdrag med gyldige koordinater
- Ingen synlig endring for sluttbrukere med gyldige data
