

# Plan: Import VL391 RPAS/UAS values and fix prefix filter

## Problem
Field 391 (Risk Classification / Phase of Flight) needs 128 RPAS/UAS values in the 1,000,000 series. These are missing from `eccairs.value_list_items`. The current `valueIdPrefix: '1'` filter is too broad — it matches the existing 10,000-series values too.

## Changes

### 1. Database migration — Insert 128 RPAS/UAS values
Create a migration that inserts all values from the provided list into `eccairs.value_list_items` with:
- `value_list_key = 'VL391'`
- `value_list_name = 'VL391'`
- `value_id` = the ID (e.g. `'1000000'`)
- `value_synonym` = description (e.g. `'RPAS/UAS'`)
- `value_description` = same as synonym

All 128 rows from: 1000000 (root), 16 level-2 items, ~80 level-3 items, ~13 level-4 items.

### 2. `src/config/eccairsFields.ts` — Update prefix filter
Change `valueIdPrefix` from `'1'` to `'100000'` so only the 1,000,000-series RPAS values appear (filtering out 10,000-series manned aircraft values).

## Files to change
- `supabase/migrations/<timestamp>_add_vl391_rpas_values.sql` (new)
- `src/config/eccairsFields.ts` (one line)

