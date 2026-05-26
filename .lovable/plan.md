## Mål
Legge til knapper for nedlasting av **GPX** og **KMZ** ved siden av "Analyser"-knappen på hver flylogg i oppdragskortene (faktisk flydd rute fra `flight_track.positions`).

## Endringer

### 1. Ny util: `src/lib/flightTrackExport.ts`
- `buildGpxFromTrack(track, name)` → GPX 1.1 XML-string med `<trkpt lat lng>` (inkluderer `<ele>` og `<time>` om tilgjengelig på posisjonene).
- `buildKmlFromTrack(track, name)` → KML `<LineString>` med `coordinates` (lng,lat,alt) for faktisk flydd spor.
- `downloadGpx(track, baseName)` og `downloadKmz(track, baseName)` → Genererer Blob (KMZ via JSZip slik som `kmzExport.ts`), trigger nettleser-nedlasting via skjult `<a download>`. Ingen Supabase-opplasting (dette er kun lokal nedlasting til bruker).
- Bruker `sanitizeFilename` fra `kmzExport.ts`.

### 2. `src/components/oppdrag/MissionCard.tsx` (ca. linje 782-806)
Legg til to nye knapper rett etter "Analyser":
```
[Analyser]  [GPX]  [KMZ]
```
Begge bruker `variant="ghost" size="sm"` med samme styling som Analyser, ikon `Download`, kaller `downloadGpx`/`downloadKmz` med `log.flight_track` og filnavn `${mission.tittel}-${flight_date}`.

### 3. `src/components/dashboard/MissionDetailDialog.tsx` (ca. linje 372-385)
Samme to knapper ved siden av Analyser-knappen i flyloggraden.

## Teknisk
- Ingen DB- eller backend-endringer.
- Knappene vises kun når `log.flight_track?.positions?.length > 0` (samme betingelse som Analyser).
- KMZ-en her er en enkel "track"-KMZ (ikke DJI-waypoint-format) — riktig for visning i Google Earth/QGIS. Hvis du vil at KMZ skal være DJI-kompatibel waypoint-fil i stedet, si fra.
