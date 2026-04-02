

## Parse NOTAM-koordinater fra tekst til polygon

### Problem
Laminar API returnerer ofte en generalisert sirkel-geometri i stedet for det faktiske polygonet som er beskrevet med koordinater i NOTAM-teksten (f.eks. `623714N 0092208E`). Vi trenger å parse disse koordinatene og bygge riktige GeoJSON-polygoner.

### Løsning
Utvide edge-funksjonen `fetch-notams` til å:
1. Etter at API-geometrien er hentet, sjekke om NOTAM-teksten inneholder koordinatpar i formatet `DDMMSSN DDDMMSSE`
2. Hvis ja, parse koordinatene til desimalgrader og bygg et GeoJSON Polygon
3. Bruk det parsede polygonet **i stedet for** API-ens geometri (som ofte bare er en sirkel)

### Koordinatformat
NOTAMs bruker formatet:
- Breddegrad: `DDMMSSN` eller `DDMMSSS` (6-7 tegn + N/S), f.eks. `623714N` = 62°37'14"N
- Lengdegrad: `DDDMMSSE` eller `DDDMMSSS` (7-8 tegn + E/W), f.eks. `0092208E` = 9°22'08"E

Typisk mønster i teksten: `623714N 0092208E - 624500N 0091500E - ...`

### Tekniske detaljer

**Fil: `supabase/functions/fetch-notams/index.ts`**

1. Ny hjelpefunksjon `parseNotamCoordinates(text: string)`:
   - Regex: `/(\d{2})(\d{2})(\d{2})([NS])\s+(\d{3})(\d{2})(\d{2})([EW])/g`
   - Konverterer hvert treff til `[lng, lat]` desimalgrader
   - Returnerer `null` hvis færre enn 3 koordinatpar funnet (trenger minst 3 for polygon)
   - Bygger GeoJSON Polygon (lukker ringen ved å legge til første punkt på slutten)

2. I hovedløkken, etter linje 82 (`const geometryGeojson = feature.geometry || null`):
   - Kall `parseNotamCoordinates(props.text)`
   - Hvis det returnerer et polygon, bruk det i stedet for `feature.geometry`
   - Fallback til API-geometrien hvis ingen koordinater finnes i teksten

### Filer som endres
1. `supabase/functions/fetch-notams/index.ts` — legg til koordinat-parser og bruk den

