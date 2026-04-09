

## Legg til takeoff-punkt i KMZ-filen

### Bakgrunn

Rutepunktene vises nå i FlightHub 2! Advarselen "Altitude mode is Relative to Takeoff Point (ALT). The flight route will be correctly displayed after the takeoff point is set" er forventet oppførsel -- DJI trenger å vite *hvor* dronen tar av fra for å beregne høydene relativt til bakken.

DJI WPML-spesifikasjonen støtter et `<wpml:takeOffRefPoint>`-element i `missionConfig` som definerer takeoff-posisjonen direkte i KMZ-filen. Uten dette må brukeren sette punktet manuelt i FH2.

### Plan

**1. Utvid `DJIExportOptions` i `src/lib/kmzExport.ts`**
- Legg til valgfritt `takeOffPoint: { lat: number; lng: number }` i options-interfacet
- Dersom ikke angitt, bruk første waypoint i ruten som fallback
- Skriv `<wpml:takeOffRefPoint>lng,lat,0</wpml:takeOffRefPoint>` i `missionConfig` i **både** `template.kml` og `waylines.wpml`

**2. Send pilotposisjon fra `src/pages/Kart.tsx`**
- Bruk `pilotPosition` fra rutedata (allerede tilgjengelig) som takeoff-punkt
- Fallback til første waypoint hvis pilotposisjon ikke er satt

**3. Oppdater `FlightHub2SendDialog.tsx`**
- Send `takeOffPoint` videre til `generateDJIKMZ`

### Filer som endres
1. `src/lib/kmzExport.ts` -- legg til `takeOffRefPoint` i missionConfig
2. `src/pages/Kart.tsx` -- send pilotposisjon til FH2-dialogen
3. `src/components/FlightHub2SendDialog.tsx` -- videresend takeoff-punkt til KMZ-generatoren

