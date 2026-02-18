
## Legg til valg for buffermetode i SORA-panelet

### Hva som skal gjøres

Brukeren ønsker å velge mellom to måter å tegne SORA-buffersoner på:

- **Rute-korridor** (ny metode): Buffersonene følger selve rutelinjen som en avrundet "pølse-form" rundt hvert segment — dette er den nåværende standard etter siste endring.
- **Konveks skrog** (gammel metode): Buffersonene beregnes rundt ytterpunktene til ruten (konveks hull + utvidelse) — dette var den opprinnelige metoden.

### Tekniske endringer

#### 1. `SoraSettings`-interface i `src/components/OpenAIPMap.tsx`
Legg til ett nytt felt:
```typescript
bufferMode: "corridor" | "convexHull";
```

#### 2. `src/lib/soraGeometry.ts`
Oppdater `SoraSettings`-interface her også (eller importer fra OpenAIPMap — men den er definert to steder, begge må oppdateres).

Oppdater `renderSoraZones` slik at `makeBuffer`-funksjonen respekterer `sora.bufferMode`:
```typescript
function makeBuffer(dist: number): RoutePoint[] {
  if (dist <= 0) return coordinates;
  if (sora.bufferMode === "convexHull") {
    const hull = computeConvexHull(coordinates);
    return bufferPolygon(hull, dist);
  }
  return bufferPolyline(coordinates, dist); // "corridor" (default)
}
```

Flight Geography-sonen (den grønne) bruker alltid `bufferPolyline` med 1m (selve rutelinjen), uansett modus — eller alternativt bruker hull med 1m. Vi lar den også følge bufferMode for konsistens.

#### 3. `src/components/SoraSettingsPanel.tsx`
Legg til et lite toggle/segment-valg mellom de to modusene. Plasseres etter "Flyhøyde"-feltet og før "Contingency area", med tydelig norsk labeling:

```
Buffermetode:
  [●] Rute-korridor    [○] Konveks område
```

Brukes `RadioGroup` fra Radix (allerede installert) for to alternativknapper, eller to enkle knapper som toggle-gruppe. RadioGroup er mest semantisk riktig.

#### 4. Standardverdi
Alle steder som initialiserer `soraSettings` (i `Kart.tsx`, `MissionDetailDialog.tsx`, `SoraAnalysisDialog.tsx` etc.) må sette `bufferMode: "corridor"` som standard, slik at eksisterende bruk ikke bryter.

### Filer som endres

| Fil | Endring |
|---|---|
| `src/components/OpenAIPMap.tsx` | Legg til `bufferMode` i `SoraSettings`-interface |
| `src/lib/soraGeometry.ts` | Legg til `bufferMode` i `SoraSettings`, oppdater `renderSoraZones` |
| `src/components/SoraSettingsPanel.tsx` | Legg til RadioGroup for buffermetode-valg |
| `src/pages/Kart.tsx` | Legg til `bufferMode: "corridor"` i standard soraSettings |

Vi søker også etter andre steder som initialiserer soraSettings for å sikre at standardverdien settes korrekt.

### Ingen databasemigrasjoner
`bufferMode` lagres som en del av `route.soraSettings` i JSONB-kolonnen — eksisterende data vil defaulte til `"corridor"` når feltet mangler (håndteres med `?? "corridor"` i logikken).
