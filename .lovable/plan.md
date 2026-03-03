
## Problem

Da vi endret CTR-sonene fra `zone_type = 'R'` til `zone_type = 'CTR'`, forsvant de fra kartet. Grunnen er at **ingen av kartlagene spør etter `CTR`**:

- `fetchAipRestrictionZones` filtrerer `.in('zone_type', ['P', 'R', 'D'])` — CTR faller ut
- `fetchRmzTmzAtzZones` filtrerer `.in('zone_type', ['RMZ', 'TMZ', 'ATZ'])` — CTR faller ut
- `MissionMapPreview` og `ExpandedMapDialog` har styling for P/R/D/RMZ/TMZ/ATZ, men ingen `CTR`-gren

Tilsvarende gjelder **TIZ** som allerede var korrekt i databasen men mangler i kartfiltrene.

## Løsning

Legg til `CTR` og `TIZ` i kartets datahenting og styling. Naturlig plass er sammen med RMZ/TMZ/ATZ-laget.

### Filer som endres

| Fil | Endring |
|---|---|
| `src/lib/mapDataFetchers.ts` | Legg til `'CTR', 'TIZ'` i `fetchRmzTmzAtzZones`-filteret + styling (rosa/ec4899 for CTR, lyseblå for TIZ) |
| `src/components/dashboard/MissionMapPreview.tsx` | Legg til CTR/TIZ-styling i zone rendering |
| `src/components/dashboard/ExpandedMapDialog.tsx` | Legg til CTR/TIZ-styling i zone rendering |

### Stilvalg
- **CTR**: `#ec4899` (rosa), solid linje — konsistent med eksisterende CTR-farge fra det gamle ArcGIS-laget
- **TIZ**: `#a78bfa` (lilla), stiplet `8, 6`
