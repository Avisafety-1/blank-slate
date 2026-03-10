

## Fiks: Soner flytter seg ved bytte mellom korridor og konveks modus

### Rotårsak

Begge bufferfunksjonene (`bufferPolyline` og `bufferPolygon`) bruker **ulike referansepunkter** og **ulik `avgLat`** for den lokale meterprojeksjonen:

- `bufferPolyline` bruker `points[0]` (første rutepunkt) som referanse og beregner `avgLat` fra alle rutepunkter.
- `bufferPolygon` bruker `hull[0]` som referanse — men `computeConvexHull` sorterer punktene, så `hull[0]` er et *annet* punkt (det med lavest lat). Den beregner også `avgLat` kun fra hull-punktene, som kan ha annen verdi.

Denne forskjellen i referansepunkt og `avgLat` gir en systematisk posisjonsfeil i den lokale projeksjonen. Alle soner "hopper" litt fordi de beregnes i forskjellige lokale koordinatsystemer.

### Løsning

Beregn **felles referansepunkt og `avgLat`** én gang i `renderSoraZones` (fra de originale `validCoords`), og send dette inn til begge bufferfunksjoner. Da bruker alle sonene identisk projeksjon uansett modus.

### Endringer

**`src/lib/soraGeometry.ts`**:

1. Utvid `bufferPolyline` og `bufferPolygon` med valgfrie parametere `refPoint?: RoutePoint` og `avgLatOverride?: number`.
2. Hvis gitt, bruk disse istedenfor å beregne egne verdier.
3. I `renderSoraZones`, beregn `avgLat` og `refPoint` fra `validCoords[0]` én gang, og send til `makeBuffer` → bufferfunksjonene.
4. Også sørg for at "Flight Geography"-linja (linje 298, alltid `bufferPolyline`) bruker samme referanse.

Ingen andre filer endres. Ren geometri-fiks.

