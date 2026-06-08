## Feilen

`kmlImport.ts` regner `totalDistance` i **meter** (`R = 6371000`), mens resten av appen (manuell rute via `mapGeometry.calculateTotalDistance`) regner i **kilometer**. Det betyr at:

- Toastene etter KML-import deler på 1000 → ser riktig ut der.
- Men selve `route.totalDistance` lagres som meter, og `MissionCard` viser den som `${value.toFixed(2)} km`. Resultat: 11 256,82 m vises som "11256,82 km" (faktisk ~11,26 km).
- Samme problem i PDF-eksport (`oppdragPdfExport.ts:289`) og KMZ-eksport (`kmzExport.ts:215`) for ruter som kommer fra KML-import.

## Plan

1. **Standardiser `kmlImport.ts` til km.**
   - Endre `haversineDistance` i `src/lib/kmlImport.ts` til `R = 6371` (km) slik at output matcher `mapGeometry`.
2. **Fjern de nå-feilaktige `/1000` i toasts** etter KML-import:
   - `src/pages/Kart.tsx:292`
   - `src/hooks/useOppdragData.ts:531`

Ingen DB-endringer, ingen UI-endringer ellers. Eksisterende lagrede ruter fra tidligere KML-import vil fortsatt vise feil tall – men det er ingen pålitelig måte å skille dem fra korrekt lagrede ruter på, så vi lar de gamle ligge (de kan re-importeres ved behov).
