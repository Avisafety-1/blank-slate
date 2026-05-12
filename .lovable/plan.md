## Problem

`FlightHub2SendDialog` bygger SORA-sone-polygonene med rå `bufferPolyline`/`bufferPolygon` fra `src/lib/soraGeometry.ts`. For den ytterste sonen (Ground Risk Buffer) — særlig på korte/lukkede ruter med store buffer-avstander — produserer disse selvskjærende eller feil-orienterte ringer. FH2 svarer `code=200500` og proxyen returnerer 502 → klienten viser «Edge Function returned a non-2xx status code».

Kart-rendringen er upåvirket fordi `renderSoraZones` bruker `mergeBufferedCorridorPolygons` (union via `polygon-clipping`) som rydder opp geometrien.

## Endring

**Fil:** `src/components/FlightHub2SendDialog.tsx`

1. Endre `soraZones`-`useMemo` slik at hver sone får et felt `polygons: Array<Array<{lat,lng}>>` istedenfor `coords`:
   - Korridor-modus (åpen rute): bruk `mergeBufferedCorridorPolygons(coords, dist, 16, refPoint, avgLat)` — returnerer rene (multi-)polygoner.
   - Convex hull / lukket rute: bruk `bufferPolygon(computeConvexHull(coords), dist, refPoint, avgLat)`, men kjør resultatet gjennom `polygon-clipping`-union (mot seg selv, evt. via en hjelpefunksjon i `soraGeometry.ts`) for å normalisere orientering og fjerne selvskjæringer. Alternativt: erstatt med samme `mergeBufferedCorridorPolygons`-tilnærming også for lukkede ruter siden den allerede produserer rene polygoner.
   - Behold filtrering av polygoner med < 3 vertices.

2. I `handleSend`: iterér over `zone.polygons` og send én `create-annotation` per polygon. Hvis flere polygoner: suffiks navnet, f.eks. `«Ground Risk Buffer (1/2)»`. Tell suksesser i `annotationCount` som før.

3. Oppdater «X soner»-telleren / checkbox-label til å reflektere totalt antall polygoner som faktisk vil sendes (eller behold antall soner — kosmetisk valg).

**Valgfri forbedring (ikke obligatorisk):** Liten hjelpefunksjon i `src/lib/soraGeometry.ts` som tar inn et råt polygon (lat/lng[]) og returnerer en renset `RoutePoint[][]` ved å pakke inn én ring i `polygon-clipping.union` mot seg selv. Det gjør pkt. 1 enklere å skrive.

**Valgfri forbedring i `supabase/functions/flighthub2-proxy/index.ts`:** I `create-annotation`-grenen, returner `200` med `{ error: "fh2_rejected", message, lastCode }` når alle varianter feiler, slik at klient-toasten kan vise en tydeligere melding enn «non-2xx status code». Ikke nødvendig hvis pkt. 1–3 alene fjerner feilen.

## Validering

- Last opp ruten fra skjermbildet (4 punkter, lukket, Befaring L6042 / Trening), åpne FH2-dialogen, send på nytt. Forvent: alle 2 (eller 3) sone-annotasjoner opprettes uten 200500.
- `supabase--edge_function_logs flighthub2-proxy` skal ikke lenger vise `code=200500` for Ground Risk.
- Kartet i ruteplanleggeren skal se identisk ut (ingen endring i `renderSoraZones`).
