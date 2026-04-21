

## Plan: Send rute som kart-annotasjon til FlightHub 2

### Mål
I `FlightHub2SendDialog` skal brukeren kunne velge hvordan ruten sendes:
1. **Som rutefil (KMZ)** — dagens flyt, ment for autopilot på drona.
2. **Som kart-annotasjon (LineString)** — kun visuell linje i FH2-kartet, samme mekanisme som SORA-buffersonene.

Standardvalget endres til kart-annotasjon, siden det er mest brukervennlig for visuell deling.

### Endringer i `src/components/FlightHub2SendDialog.tsx`

**1. State**
- Erstatt `sendRoute: boolean` med `routeMode: "annotation" | "kmz" | "none"`.
- Default: `"annotation"`.

**2. UI**
- Bytt dagens enkle checkbox «Send rutefil (KMZ)» med en `RadioGroup` (3 valg):
  - «Send rute som kart-annotasjon (visuell linje)» — anbefalt
  - «Send rutefil (KMZ for autopilot)»
  - «Ikke send rute»
- Behold checkbox for «Send SORA-soner som kartannotasjoner» uendret.
- Skjul/disable «Flyparametre»-blokken og DJI-modellvelger når `routeMode !== "kmz"` (de er kun relevante for KMZ-eksport).

**3. Send-logikk i `handleSend`**
- Hvis `routeMode === "kmz"` → kjør dagens `upload-route`-flyt.
- Hvis `routeMode === "annotation"` og `route.coordinates.length >= 2`:
  - Bygg LineString GeoJSON via ny helper `buildRouteLineGeoJson(coords, color)` (farge f.eks. `#10B981` grønn for å skille fra SORA-sonene).
  - Kall `flighthub2-proxy` med `action: "create-annotation"`, `annotationType: 1` (line), navn = `routeName`, beskrivelse «Planlagt rute generert av Avisafe».
- Suksess-toast oppdateres til å reflektere hvilken modus som ble brukt («rute som annotasjon», «rutefil», «X SORA-soner»).

**4. Validering av Send-knapp**
- Disabled når `routeMode === "none" && !sendAnnotation`, eller når valgt modus ikke har gyldige data (f.eks. <2 koordinater).

### Antakelser
- `flighthub2-proxy` sin `create-annotation`-action støtter allerede `annotationType: 1` for linjer (samme endepunkt brukes for SORA-polygoner med type 2). Hvis FH2 OpenAPI krever en annen type-kode for LineString, justeres verdien — proxyen videresender feltet uendret.
- Ingen endringer i edge-funksjonen er nødvendige; kun klient-siden bygger en annen GeoJSON-geometri.

### Filer som endres
- `src/components/FlightHub2SendDialog.tsx`

### Resultat
Brukeren får en tydelig valg i dialogen: standard sendes ruta som en visuell grønn linje (kart-annotasjon) sammen med eventuelle SORA-soner. KMZ-eksport for autopilot er fortsatt tilgjengelig som alternativ.

