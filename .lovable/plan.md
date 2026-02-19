
# Ny slider: Flight Geography Area i SORA-panelet

## Bakgrunn

Bildet viser den korrekte SORA-strukturen med fire konsentriske lag (fra innenfor og ut):
1. **Flight Geography Area** (lys grønn, innerst) — brukerdefinerbar buffer rundt selve ruten
2. **Flight Geography** (mørkere grønn) — den ytre grensen for selve flygeografien
3. **Contingency Area** (gul) — utenfor Flight Geography
4. **Ground Risk Buffer** (rød) — ytterst

I dag mangler "Flight Geography Area"-laget. Contingency og Ground Risk regnes fra ruten direkte, ikke fra en egen Flight Geography Area-radius.

## Endringer

### 1. `src/components/OpenAIPMap.tsx` — utvide `SoraSettings`-interface

Legge til ett nytt felt:

```ts
export interface SoraSettings {
  enabled: boolean;
  flightAltitude: number;
  flightGeographyDistance: number;   // NY — default 0
  contingencyDistance: number;
  contingencyHeight: number;
  groundRiskDistance: number;
  bufferMode?: "corridor" | "convexHull";
}
```

### 2. `src/lib/soraGeometry.ts` — oppdatere interface og `renderSoraZones`

Tilsvarende tillegg av `flightGeographyDistance` i det lokale `SoraSettings`-interface.

Ny `renderSoraZones`-logikk:

```
flightGeographyDistance (ny, grønn, innerst)  →  offset = flightGeographyDistance
Flight Geography (eksisterende, grønn)         →  offset = 1m (alltid, som nå)
Contingency Area (gul)                         →  offset = flightGeographyDistance + contingencyDistance
Ground Risk Buffer (rød)                       →  offset = flightGeographyDistance + contingencyDistance + groundRiskDistance
```

- Når `flightGeographyDistance === 0`: Flight Geography Area rendres ikke (buffer = 0 er usynlig), og Contingency/Ground Risk regnes fra ruten slik de gjør i dag
- Når `flightGeographyDistance > 0`: et eget lys-grønt fylt polygon vises, og Contingency/Ground Risk skyves utover tilsvarende

```ts
// Flight Geography Area (ny, innerst)
if (sora.flightGeographyDistance > 0) {
  const fgaZone = makeBuffer(sora.flightGeographyDistance);
  L.polygon(..., { color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.25 })
    .bindPopup('Flight Geography Area').addTo(layer);
}

// Flight Geography (eksisterende linje, 1m buffer)
const flightGeo = bufferPolyline(coordinates, 1);
L.polygon(..., { color: '#22c55e', weight: 2, fillOpacity: 0.10 })...

// Contingency — nå fra flightGeographyDistance + contingencyDistance
const contingencyZone = makeBuffer(sora.flightGeographyDistance + sora.contingencyDistance);

// Ground Risk — nå fra flightGeographyDistance + contingencyDistance + groundRiskDistance
const groundRiskZone = makeBuffer(
  sora.flightGeographyDistance + sora.contingencyDistance + sora.groundRiskDistance
);
```

### 3. `src/components/SoraSettingsPanel.tsx` — ny slider

Legge til en grønn slider mellom "Flyhøyde" og "Buffermetode":

```tsx
{/* Flight Geography Area */}
<div className="space-y-1.5">
  <div className="flex items-center justify-between">
    <Label className="text-xs text-muted-foreground">Flight Geography Area (m)</Label>
    <span className="text-xs font-mono text-green-600 dark:text-green-400">
      {settings.flightGeographyDistance}m
    </span>
  </div>
  <Slider
    min={0}
    max={200}
    step={1}
    value={[settings.flightGeographyDistance]}
    onValueChange={([v]) => update({ flightGeographyDistance: v })}
    className="[&_[role=slider]]:bg-green-600"
  />
</div>
```

Oppdatere legenden med en egen post for Flight Geography Area:

```tsx
<span className="flex items-center gap-1">
  <span className="w-3 h-3 rounded-sm bg-green-600/40 border border-green-600/60" /> Flight geography area
</span>
<span className="flex items-center gap-1">
  <span className="w-3 h-3 rounded-sm bg-green-500/40 border border-green-500/60" /> Flight geography
</span>
```

### 4. Oppdatere alle standard-verdier

Alle steder der `SoraSettings` initialiseres med hardkodede verdier, legge til `flightGeographyDistance: 0`:

| Fil | Linje |
|---|---|
| `src/pages/Kart.tsx` | ~144 og ~189 |
| `src/components/dashboard/ExpandedMapDialog.tsx` | ~83 |

## Visuell effekt

| Innstilling | Resultat på kartet |
|---|---|
| `flightGeographyDistance = 0` (default) | Ingen endring fra nå — ruten er Flight Geography, gult og rødt buffer fra ruten |
| `flightGeographyDistance = 50` | Lys grønt område 50m rundt ruten, gult buffer starter 50m fra ruten, rødt 50m + `contingencyDistance` fra ruten |

## Filer som endres

| Fil | Endring |
|---|---|
| `src/components/OpenAIPMap.tsx` | Legg til `flightGeographyDistance: number` i `SoraSettings` |
| `src/lib/soraGeometry.ts` | Legg til felt i interface + ny renderingslogikk |
| `src/components/SoraSettingsPanel.tsx` | Ny slider + utvidet legende |
| `src/pages/Kart.tsx` | Legg til `flightGeographyDistance: 0` i default-verdier |
| `src/components/dashboard/ExpandedMapDialog.tsx` | Legg til `flightGeographyDistance: 0` i default |
