
## Import av KML/KMZ rutefiler til oppdrag

### Oversikt
Brukere skal kunne laste opp en KML- eller KMZ-fil direkte på oppdragskortet (`MissionDetailDialog`). Koordinatene parses ut av filen og lagres i den eksisterende `route`-kolonnen (jsonb) i `missions`-tabellen — nøyaktig samme format som ruter tegnet manuelt på kartet. De importerte koordinatene vises deretter umiddelbart på kartet i dialogen.

### Støttede filtyper og parsing

**KML** — XML-basert. Koordinater ligger typisk i:
- `<LineString><coordinates>` (linje/rute)
- `<Polygon><outerBoundaryIs><LinearRing><coordinates>` (polygon)
- `<Placemark><Point><coordinates>` (individuelle punkter)
- DJI-format med `<wpml:index>` og `<Point><coordinates>`

**KMZ** — En ZIP-fil som inneholder `doc.kml` (og ev. `wpmz/template.kml`, `wpmz/waylines.wpml`). JSZip er allerede installert og brukes i `kmzExport.ts`.

### Koordinatformat internt (RouteData)
```typescript
interface RouteData {
  coordinates: { lat: number; lng: number }[];
  totalDistance: number;
  soraSettings?: SoraSettings;
  importedFileName?: string; // Ny: for å vise kildefil
}
```
KML-filer lagrer koordinater som `lng,lat,alt` — vi inverterer til `{ lat, lng }`.

### Totalavstand beregnes
Etter parsing kjøres samme Haversine-beregning som brukes i ruteplanlisten, så `totalDistance` er korrekt.

### Endringer

#### 1. Ny hjelpefunksjon: `src/lib/kmlImport.ts`
Ren parse-funksjon (ingen UI-avhengigheter) som eksporterer:
```typescript
export async function parseKmlOrKmz(file: File): Promise<RouteData>
```
- Detekterer KMZ via MIME-type eller filextension → pakker ut med JSZip
- Parser KML-streng med DOMParser → finner koordinater i prioritert rekkefølge:
  1. `<LineString>` (mest vanlig for ruter)
  2. DJI `<Placemark>` med `<wpml:index>` (DJI WPML-format)
  3. `<Polygon>` ytre grense
  4. Individuelle `<Point>` Placemarks
- Beregner `totalDistance` med Haversine
- Lagrer `importedFileName` for UI-indikasjon

#### 2. Endringer i `MissionDetailDialog.tsx`
- Legg til en skjult `<input type="file" accept=".kml,.kmz">` med en knapp "Importer KML/KMZ" i kartvisnings-seksjonen
- Etter vellykket parse → `supabase.from("missions").update({ route: parsedRoute })` direkte
- Oppdaterer `liveMission`-state lokalt så kartet vises uten reload
- Viser toast med antall punkter og rutelengde ved suksess
- Viser feilmelding dersom filen er ugyldig

**Knappeplassering** i kartvisnings-seksjonen (der "Rediger rute"-knappen allerede finnes):
```
[Rediger rute]  [Importer KML/KMZ]  [Utvid]
```

#### 3. Ingen endringer nødvendig i `MissionMapPreview.tsx`
Kartet bruker allerede `route`-prop direkte og renderer polylinjen automatisk. Når `liveMission.route` oppdateres i `MissionDetailDialog`, re-rendres `MissionMapPreview` med de nye koordinatene.

### Håndtering av edge cases
- Filen mangler koordinater → feilmelding "Ingen koordinater funnet i filen"
- KMZ-fil som ikke inneholder KML → feilmelding "Fant ingen KML-fil i arkivet"
- Feil filtype → validert via accept-attributt og dobbeltsjekk i parse-funksjonen
- Eksisterende rute: brukeren advares med en bekreftelsesdialog dersom oppdraget allerede har en rute ("Vil du erstatte eksisterende rute?")
- Kartet vises **kun** dersom `latitude`/`longitude` er satt på oppdraget. Koordinatene fra importert fil settes ikke som `latitude`/`longitude` — de lagres kun i `route`.

### Filer som endres
1. `src/lib/kmlImport.ts` — **ny fil**: KML/KMZ-parser
2. `src/components/dashboard/MissionDetailDialog.tsx` — legg til import-knapp og opplastingslogikk

### Avhengigheter
- `jszip` — allerede installert (brukes i `kmzExport.ts`)
- `DOMParser` — nettleser-innebygd, ingen ekstra pakker

### Ingen databaseendringer nødvendig
`route`-kolonnen er allerede `jsonb` og aksepterer det eksisterende formatet.
