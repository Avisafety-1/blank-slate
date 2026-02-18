
# Kartutssnitt i Oppdragsrapport PDF

## Bakgrunn og nåværende situasjon

PDF-eksporten i `src/pages/Oppdrag.tsx` (funksjonen `exportToPDF`) prøver allerede å vise et kart, men gjør dette via en ekstern statisk URL (`staticmap.openstreetmap.de`) som:
- Bare viser et enkelt markørpunkt
- Ikke inneholder ruten (koordinater og linjer)
- Ikke inneholder SORA-buffersoner
- Ikke inneholder luftromsstrukturer (NSM-soner, RPAS-soner, AIP-soner)
- Kan feile på grunn av CORS-problemer

`MissionMapPreview`-komponenten er en fullverdig Leaflet-kart-instans som allerede tegner:
- Planlagt rute (blå stiplet linje med nummererte punkter)
- SORA-buffersoner (grønn/gul/rød) hvis `route.soraSettings.enabled` er sant
- Luftromsstrukturer fra ArcGIS og Supabase (NSM, RPAS, CTR/TIZ, AIP ENR 5.1)
- Flyspor (grønne linjer fra faktiske flyturer)

## Teknisk løsning: Skjermlesing av Leaflet-kart via Canvas

Leaflet bruker en kombinasjon av Canvas (tile-lag) og SVG (vektorlag) for å tegne kart. For å ta et skjermbilde av hele karten som et bilde klar til PDF må vi:

1. Lage en dedikert, usynlig kart-container som rendrer kartet midlertidig.
2. Vente til kartflisene (tiles) er lastet.
3. Bruke `html2canvas` (allerede tilgjengelig i de fleste nettlesere) til å snapshotte DOM-noden — **men Leaflet-kart er notorisk vanskelig med html2canvas** fordi SVG/Canvas lag ikke samarbeider godt.

**Foretrukket tilnærming: Kombinere Canvas + SVG → ett DataURL**

Leaflet's tile-lag er tegnet på `<canvas>` eller `<img>`-elementer, og vektor-lag (polylines, polygoner) er tegnet som SVG. Den beste tilnærmingen er:

1. Opprette et midlertidig Leaflet-kart i en offscreen `<div>` med fast størrelse (f.eks. 800×400 px).
2. Legge til samme innhold som `MissionMapPreview` (rute, SORA-soner, luftromsstrukturer — men bare fra Supabase siden eksterne ArcGIS-kall er asynkrone og kan ta tid).
3. Bruke `leafletImage` (leaflet-image-biblioteket) ELLER en tilpasset Canvas-løsning til å konvertere til en PNG.

**Alternativ tilnærming (enklere og mer pålitelig): StaticMap med rute tegnet via WMS/tile-overlay + SVG-canvas merge**

Siden vi allerede har alle koordinatene (rute + SORA-buffersoner), kan vi:

1. Laste en OSM-bakgrunnsflis som et `<img>` til en `<canvas>`.
2. Tegne ruten og buffersoner direkte på canvas ved hjelp av Mercator-projeksjonsregning (konvertere lat/lng til pikselkoordinater).
3. Eksportere canvas som en `dataURL` og sette den inn i PDF.

**Dette er den anbefalte tilnærmingen** — den krever ingen nye biblioteker, fungerer pålitelig i nettleseren, og gir full kontroll over hva som vises.

## Implementasjonsplan

### 1. Ny hjelpefunksjon: `src/lib/mapSnapshotUtils.ts`

Lag en ny fil med en funksjon `generateMissionMapSnapshot(mission)` som:

**a. Lat/Lng til Piksel-konvertering (Web Mercator)**
```typescript
function latLngToPixel(lat, lng, centerLat, centerLng, zoom, width, height): {x, y}
```
Bruker standard Web Mercator-formel for å konvertere geografiske koordinater til pikselposisjoner på et kart.

**b. Laste én bakgrunnsflis**
Siden et enkelt OSM-tile er 256×256 px og oppdraget typisk ikke dekker mer enn én-noen få tiles, lager vi en tilnærming:
- Beregne tile-koordinater for midtpunktet og riktig zoom-nivå.
- Laste et sett med tiles (f.eks. 3×2 grid) til et `<canvas>`.
- Alternativt: Bruke et enkelt Stadia Maps/OpenStreetMap static map-endepunkt (mer pålitelig enn staticmap.openstreetmap.de).

**c. Tegne elementer på canvas:**
- **Ruten**: Tegn blue dashed polyline mellom rutepunktene.
- **Start/Stopp-markører**: Grønn og rød sirkel for start/stopp.
- **SORA-buffersoner** (hvis aktivert): Grønn (Flight Geography), gul (Contingency Area), rød (Ground Risk Buffer) polygon-fylte soner — beregnet ved å kalle de eksisterende bufferPolyline/bufferPolygon-funksjonene fra `soraGeometry.ts`.
- **Tekst-etikett**: Koordinater, zoom-nivå og oppdragsnavn.

**d. Legg til et simpelt luftromsindikator-lag** fra databasen (AIP-soner fra Supabase, kun de som er innenfor viewbounds).

### 2. Oppdatere `exportToPDF` i `src/pages/Oppdrag.tsx`

Erstatte den nåværende statiske map URL-koden (linje 758–774) med et kall til `generateMissionMapSnapshot`:

```typescript
// Erstatter gammel kode:
const mapDataUrl = await generateMissionMapSnapshot({
  latitude: mission.latitude,
  longitude: mission.longitude, 
  route: mission.route,
  soraEnabled: mission.route?.soraSettings?.enabled,
});

if (mapDataUrl) {
  pdf.addPage(); // eller plasser rett etter header
  pdf.setFontSize(12);
  setFontStyle(pdf, "bold");
  pdf.text("Kartutssnitt", 15, yPos);
  yPos += 7;
  pdf.addImage(mapDataUrl, 'PNG', 15, yPos, 180, 90);
  yPos += 100;
  
  // Legg til en forklaring/legend under kartet
  addMapLegend(pdf, yPos, mission.route?.soraSettings);
  yPos += 25;
}
```

### 3. Forklaring/legend i PDF

Under kartutsnitttet legges det til en rask tekstbasert forklaring:
- Blå stiplet linje = Planlagt rute
- Grønn = Flight Geography (SORA) 
- Gul stiplet = Contingency Area (SORA)
- Rød stiplet = Ground Risk Buffer (SORA)
- Luftromsadvarsler (fra eksisterende airspace warnings-seksjon)

### 4. Luftromsstrukturer i kartet

For å inkludere luftromsstrukturer (NSM-soner, RPAS, AIP) i kartet tegner vi:
- Hente AIP-soner fra Supabase for gjeldende viewbounds.
- Tegne disse som fargede polygoner på canvas (rød for P, lilla for R, oransje for D osv.).
- **Merk:** Eksterne ArcGIS-kall (NSM, RPAS) vil bli forsøkt men kan feile pga. CORS – disse inkluderes på best-effort-basis.

## Filer som endres

| Fil | Endring |
|---|---|
| `src/lib/mapSnapshotUtils.ts` | Ny fil – canvas-basert kartgenerering |
| `src/pages/Oppdrag.tsx` | Erstatt statisk map URL med ny canvas-snapshot, legg til legend |

## Brukeropplevelse

- Ekportknappen er uendret.
- Kartet genereres automatisk i bakgrunnen (kan ta 1-2 sekunder ekstra for tile-lasting).
- Hvis kartet feiler (nettverk osv.), fortsetter PDF-genereringen uten kart (graceful degradation – som i dag).
- Kartet plasseres tidlig i PDF-en, like etter headingen, for å gi en visuell kontekst før tabellene.

## Tekniske detaljer

### Web Mercator piksel-konvertering
```typescript
function latToY(lat: number, zoom: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - (Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI));
  return y * (256 << zoom);
}
function lngToX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * (256 << zoom);
}
```

### Tile-lasting
- Zoom-nivå velges dynamisk basert på rutens bounding box (zoom 10–15).
- Et 3×2 tile-grid lastes for tilstrekkelig kontekst.
- Tiles lastes parallelt med `Promise.all`.

### SORA-buffersonene
- Bruker eksisterende `bufferPolyline` og `computeConvexHull/bufferPolygon` fra `soraGeometry.ts`.
- Konverterer de beregnede lat/lng-polygonene til canvas-pikselkoordinater.
- Tegner med `ctx.fillStyle` og `ctx.globalAlpha` for transparens.

### Potensielle utfordringer
- **CORS på OSM-tiles**: OSM-tiles har vanligvis CORS-headere som tillater dette, men kan av og til blokkere. Fallback: bruk et carte-blanche canvas uten bakgrunn.
- **Ytelse**: Tile-lasting er asynkron – dette er allerede taklet med try/catch.
- **Zoom-valg**: Automatisk zoom-beregning basert på bounding box av alle punkter (rute + buffersoner).
