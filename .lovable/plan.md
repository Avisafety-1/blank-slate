
## Endre SORA-buffersoner til å følge rutens faktiske form

### Problemet
Dagens logikk i `soraGeometry.ts` (og duplikatlogikken i `MissionMapPreview.tsx`):
1. Beregner **konveks skrog** av alle rutepunktene (ytterste triangel/polygon)
2. Ekspanderer det skroget utover med `bufferPolygon`

Resultatet er det brukeren ser på bildet: en trekantet/polygonal sone som ignorerer rutens faktiske form og bare dekker ytterpunktene.

### Ønsket oppførsel
Buffersonene skal følge selve **rutelinjen** — en kontinuerlig «pølseform» (rounded buffer/corridor) rundt hvert linjesegment og hvert rutepunkt. Dette kalles et **linje-buffer** eller **Minkowski-sum** av linjen.

### Løsningen: Linje-buffer i stedet for konveks skrog

Ny funksjon `bufferPolyline(points, distanceMeters)` som:
1. For hvert linjesegment beregner to parallelle offsetlinjer (venstre og høyre side)
2. I hjørnene (ved hvert rutepunkt) legger til en halvsirkel-buende overgang (rounded join) ved å generere punkter langs en sirkelbue
3. Returnerer en lukket polygon som omslutter hele rutekorridoren

**Algoritme:**
```
For N punkter (P0, P1, ..., Pn-1):
  - Venstre side: offset langs venstre av ruteretningen
  - Høyre side: offset langs høyre av ruteretningen
  - Start-halvkrets rundt P0
  - Slutt-halvkrets rundt Pn-1
  - Ellers: ved hvert indre punkt, beregn smooth join mellom segmenter
```

Siden vi kjører i lat/lng-koordinater bruker vi en lokal metrisk projeksjon (samme som eksisterende kode: `lngScale = 111320 * cos(lat)`, `latScale = 111320`).

### Filer som endres

#### 1. `src/lib/soraGeometry.ts`
- **Behold** `computeConvexHull` og `bufferPolygon` (brukes eventuelt andre steder / fallback)
- **Legg til** ny `bufferPolyline(points, distanceMeters, numCapSegments?)` som returnerer en polygon som er en «rounded corridor» rundt linjen
- **Oppdater** `renderSoraZones`:
  - Hvis ruten har 2+ punkter → bruk `bufferPolyline` (linjebuffer)
  - Hvis ruten er lukket/polygon (første === siste punkt) → fallback til `bufferPolygon` med konveks skrog
  - Flight Geography: buffer med `contingencyDistance` (gul), Contingency: buffer med `contingencyDistance` (gul), Ground Risk: buffer med `contingencyDistance + groundRiskDistance` (rød)
  - Flight Geography-polygon (grønn) vises som selve rutekorridoren med `contingencyDistance = 0` — eller tegnes som rutens faktiske linje-buffer på 0m (bare polylinjen med fyll)

**Detaljert algoritme for `bufferPolyline`:**

```typescript
function bufferPolyline(points, distanceMeters, numCapSegments = 16): RoutePoint[] {
  // 1. Konverter til metrisk lokalt koordinatsystem
  // 2. For hvert segment: beregn normalvektor (perpendikulær)
  // 3. Bygg høyresiden fremover (p0..pn)
  // 4. Legg til halvkrets rundt sluttpunktet (pn)
  // 5. Bygg venstresiden bakover (pn..p0)
  // 6. Legg til halvkrets rundt startpunktet (p0)
  // 7. Konverter tilbake til lat/lng
}
```

For glatt join i hjørnene: beregn gjennomsnittlig normalvektor i hvert knutepunkt (bisecting normal), eller tegn en bue ved bruk av vinkelinterpolasjon mellom to segmenters normaler.

#### 2. `src/components/dashboard/MissionMapPreview.tsx`
- Duplikatlogikken i denne filen (`computeConvexHull`, `bufferPolygon`, `renderSoraZones`) må også oppdateres til å bruke den nye `bufferPolyline`-funksjonen
- Enten: importer `bufferPolyline` og `renderSoraZones` fra `soraGeometry.ts` (fjern duplikater), eller oppdater den lokale `renderSoraZones`-funksjonen her
- **Anbefalt**: refaktorer `MissionMapPreview.tsx` til å importere `renderSoraZones` direkte fra `soraGeometry.ts` slik at logikken er på ett sted

### Visualisering av ny oppførsel

```text
Gammel (konveks skrog):          Ny (linjebuffer/korridor):
                                   
    *---*                           ╭──────╮
   / R / ← trekantet               │  R   │
  / Y /   sone som dekker          │  Y   │ ← følger rutens
 / G /    ytterpunktene            │  G   │   faktiske form
*---*                              ╰──────╯
                                         ↑ avrundede hjørner
```

### Ingen databaseendringer
Kun geometriberegning i frontend. `soraSettings` lagres som før i `route.soraSettings`.

### Edge cases
- Kun 1 punkt: tegn en sirkel (radius = bufferDistance)
- 2 punkter: tegn en «pølse» (to halvkretser + to parallelle linjer)
- Svært tette punkter (< 1m avstand): skip segmentet (unngå divisjon på 0)
- Lukkede ruter (første === siste punkt): sirkelbue i hjørnet behandles som vanlig indre punkt
