## Problem

`L.geoJSON()` kaster `Invalid GeoJSON object` når:
- ArcGIS-endepunktene sporadisk svarer med et feilobjekt (`{ error: {...} }`) med HTTP 200 i stedet for GeoJSON.
- Enkelt-features har `geometry: null` (vanlig for tomme flyplassrader).

Dette skjer på to steder som brukeren ser i konsollen:
- `/kart` → `fetchAirportsData` (flyplasser ArcGIS)
- `/oppdrag` (mission map preview) → `fetchZones` (NSM / RPAS / CTR ArcGIS)

Ett dårlig svar dropper hele laget i dag.

## Endringer

Legg til en liten helper og bruk den før hvert `L.geoJSON()`-kall på ArcGIS-data.

### 1. `src/lib/mapDataFetchers.ts`
- Ny lokal helper `sanitizeArcgisGeoJson(data)`:
  - Returnerer `null` hvis `data` ikke er objekt, mangler `type`, er `{ error: ... }`, eller ikke er `FeatureCollection`/`Feature`.
  - For FeatureCollection: filtrerer bort features uten gyldig `geometry`/`geometry.type`/`geometry.coordinates`.
  - Returnerer `null` hvis ingen gyldige features gjenstår.
- `fetchAirportsData` (linje ~397): kjør svar gjennom helperen; hopp over `L.geoJSON` hvis `null`. Beholder eksisterende `coordinateFixes`-logikk.

### 2. `src/components/dashboard/MissionMapPreview.tsx` (`fetchZones`, linje ~243)
- Bruk samme helper (importert fra `mapDataFetchers` eller duplisert lokalt — enklest å eksportere fra `mapDataFetchers`).
- Sanitér `nsmData`, `rpasData`, `ctrData` før `L.geoJSON`. Hopp over det respektive laget stille hvis svaret er ugyldig, i stedet for å la hele `fetchZones` catche og logge feil.
- Wrap hvert `L.geoJSON`-kall i try/catch som siste sikring, slik at ett dårlig lag ikke tar ned de andre.

### 3. `src/components/dashboard/ExpandedMapDialog.tsx` (`fetchZones`, linje ~742)
- Samme sanitering på `nsmData` og `ctrData` (ArcGIS-svar).
- Wrap hvert `L.geoJSON` i try/catch for å isolere feil.

## Ikke i scope
- AIP-soner, NOTAM-er, naturvern-soner o.l. har allerede `try/catch` rundt hver `L.geoJSON` — ingen endring der.
- Ingen endring i design, ikoner eller stiler.

## Verifisering
- Reload `/kart` og `/oppdrag`, sjekk at ingen "Invalid GeoJSON object"-feil vises i konsollen selv når ArcGIS returnerer feilobjekt.
- Bekreft at flyplass-, NSM-, RPAS- og CTR-lag fortsatt tegnes når svaret er OK.
