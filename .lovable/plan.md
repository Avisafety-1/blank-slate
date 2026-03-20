

## Plan: Forbedre flyanalyse med kart-markører for advarsler og andre forbedringer

### 1. Warning-markører på kartet (toggle)

Legg til en toggle-knapp over kartet (f.eks. ved siden av gyro-overlayed) som viser/skjuler advarsels-markører.

**Implementasjon i `FlightAnalysisDialog.tsx`:**
- Ny state: `showWarnings` (default: false)
- Ny toggle-knapp (AlertTriangle-ikon) i øvre venstre hjørne av kartet
- Når `showWarnings` er på: gå gjennom `events`-arrayet, finn posisjon via `t_offset_ms` → closest position index (samme logikk som `eventIndices` i Timeline), og legg til `L.circleMarker` for hver warning
- Fargekoding: rød for RTH/kritisk, gul for LOW_BATTERY, oransje for APP_WARNING
- Popup ved klikk på markør som viser meldingen
- Egen `useRef` for warning-markør-gruppen (`L.LayerGroup`) som ryddes ved toggle av/på

### 2. Klikk på event-markør i timeline → hopp til posisjon

**I `FlightAnalysisTimeline.tsx`:**
- Gjør event-markørene på slideren klikkbare
- Ved klikk: kall `onIndexChange(e.index)` slik at kartet hopper til warning-posisjonen

### 3. Farge trail etter hastighet (heatmap-stil)

**I `FlightAnalysisDialog.tsx`:**
- I stedet for ensfarga blå trail, del polyline i segmenter farget etter hastighet (grønn→gul→rød)
- Bruk `L.polyline` per segment med farge basert på `speed`-verdien
- Toggle mellom ensfarga og hastighets-farget trail via en liten knapp

### Filer som endres
- `src/components/dashboard/FlightAnalysisDialog.tsx` — warning markers layer, speed-colored trail, toggle UI
- `src/components/dashboard/FlightAnalysisTimeline.tsx` — klikkbare event-markører på slider

