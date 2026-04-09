

## Fiks: SORA-korridor mangler ved FH2-sending fra oppdragskort

### Problem

I `Oppdrag.tsx` linje 491-501 sendes `FlightHub2SendDialog` uten `soraSettings` og `soraBufferCoordinates`. Oppdragets rute inneholder `route.soraSettings`, men disse dataene blir ikke videresendt. Dermed tror dialogen at SORA-korridor ikke finnes.

### Løsning

Hent `soraSettings` fra `fh2Mission.route.soraSettings` og beregn `soraBufferCoordinates` med samme logikk som i `Kart.tsx` (bruk `bufferPolyline`/`bufferPolygon` fra `soraGeometry.ts`).

### Endringer

**`src/pages/Oppdrag.tsx`**
- Importer `computeConvexHull`, `bufferPolyline`, `bufferPolygon` fra `@/lib/soraGeometry`
- Beregn SORA buffer-koordinater fra `fh2Mission.route` når FH2-dialogen åpnes (inline i `useMemo` eller direkte i render)
- Send `soraSettings` og `soraBufferCoordinates` til `FlightHub2SendDialog`:
  ```
  soraSettings={fh2Mission.route?.soraSettings}
  soraBufferCoordinates={computedBufferCoords}
  ```

### Fil som endres
1. `src/pages/Oppdrag.tsx`

