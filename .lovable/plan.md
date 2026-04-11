

# Plan: Fix State/Area of Occurrence (field 454) county mappings

## Problem
The postcode-to-county auto-mapping in `eccairsAutoMapping.ts` has incorrect value IDs for two counties:
- **Telemark**: mapped to `1117` (Svalbard) instead of `1118` (Telemark)
- **Østfold**: mapped to `1112` (Oppland) instead of `1122` (Østfold)

The field 454 UI itself already works correctly — it uses `EccairsMultiSelect` with `VL454` taxonomy which contains all Norwegian counties (1103-1122). The auto-fill logic already suggests `['179' (Norway), countyId]` based on the incident's postcode.

## What already works
- Field 454 is configured as `content_object_array` → renders with `EccairsMultiSelect`
- All 20 Norwegian counties exist in the `eccairs.value_list_items` table (VL454, IDs 1103-1122)
- Auto-mapping extracts postcode from `lokasjon` and maps to Norway + county
- Users can manually search and select any country/region from VL454

## Changes

### File: `src/lib/eccairsAutoMapping.ts`
- Fix `POSTCODE_TO_COUNTY` default map: key `'4'` should map to `1121` (Vest-Agder) — this is already correct
- Fix Telemark: change `1117` → `1118`
- Fix Østfold: change `1112` → `1122`
- Fix Nord-Trøndelag comment: value `1111` is correct per DB

No other files need changes — the field is already properly configured and rendered.

