

## Plan: Vis faktisk fløyet rute på PDF-kartutsnitt

### Hva
Når et oppdrag har flylogger med `flight_track`-data (fra DJI-import eller SafeSky), tegnes den faktiske ruten på kartbildet i PDF-eksporten — i tillegg til den planlagte ruten.

### Endringer

**`src/lib/mapSnapshotUtils.ts`**
- Utvid `MapSnapshotInput` med valgfri `flightTracks?: Array<{ positions: Array<{lat, lng}> }>` 
- Inkluder flight track-koordinater i bounds-beregningen (allPoints) for riktig zoom
- Tegn hver flight track som en solid linje i en distinkt farge (f.eks. oransje `#f97316`) etter den planlagte ruten, slik at den synes oppå

**`src/lib/oppdragPdfExport.ts`**
- Send `mission.flightLogs` sine `flight_track`-data inn til `generateMissionMapSnapshot` via det nye feltet
- Filtrer ut logger som faktisk har track-data (`flight_track?.positions?.length > 0`)
- Legg til «Faktisk fløyet rute» i kart-legenden (solid oransje linje)

### Visuelt
- Planlagt rute: blå stiplet linje (som nå)
- Faktisk fløyet rute: oransje solid linje
- Flere flylogger tegnes alle (typisk overlappende)

### Filer
- `src/lib/mapSnapshotUtils.ts`
- `src/lib/oppdragPdfExport.ts`

