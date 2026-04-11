

# Plan: Collapsible tree for VL390 (Event Type) + insert missing RPAS values

## Problem
1. VL390 has 3145 values shown as a flat list — needs a hierarchical tree like VL391
2. RPAS-specific child values under `99010401` are **missing** from the database (the user provided 22 values: 1090000, 1091000, 99012383-99012386, 99200004-99200026)

## Approach

### 1. Database migration — Insert missing RPAS Event Type values
Insert the 22 RPAS-specific values the user provided into `eccairs.value_list_items` with `value_list_key = 'VL390'`. These are all level-4 children of `99010401` (RPAS Specific Events).

Values to insert:
- 1090000: RPAS/UAS Excursion out of its operational volume
- 1091000: RPAS/UAS Landing outside its safety zone
- 99012383-99012386: Excursion, Landing, Loss of Link (designed/undesigned)
- 99200004-99200026: Flight termination, Battery failure, Flight control failure, Ground control failure, Collision avoidance failure, Loss of Visual Contact, CMU, EMI, Airspace/Geo infringement, etc.

Note: Some value_ids (1090000, 1091000) already exist with different descriptions (Equipment sub-items). These need to be handled — either update the existing rows or insert with VL390-specific entries. Since the table key is `(value_list_key, value_id)`, duplicate VL390 entries should be checked.

### 2. New component — `EccairsEventTypeTreeSelect.tsx`
Create a dedicated tree component for VL390, similar to `EccairsPhaseOfFlightSelect.tsx`:

**Top-level nodes** (level 1, always visible):
- Equipment (1000000)
- Operational (99010158)
- Personnel (99010159)  
- Organisational (99010164)
- RPAS Specific Events (99010401)
- Consequential Events (3000000)
- Any Other Events (99012035)
- Unknown (99000000)

**Parent-child derivation strategy:**
- For Equipment (1xxxxxx): derive parent from numeric pattern (ATA chapters — zeros at end indicate parent level)
- For 99010401 children: use a hardcoded PARENT_MAP linking the 22 RPAS values to `99010401`
- For other 99xxxxxx values: group under their respective top-level parent using prefix patterns

The component will:
- Fetch all VL390 items (limit 500+, paginated if needed)
- Build a tree with collapsible nodes
- Support search with auto-expand
- Auto-expand path to selected value

### 3. Update `EccairsMappingDialog.tsx`
Add a conditional check for `field.code === 390` to render `EccairsEventTypeTreeSelect` instead of the flat `EccairsTaxonomySelect`.

### 4. No other VLs need tree structure now
- VL430 (37 values) and VL32 (75 values) are small enough for flat lists
- VL454 is already auto-suggested

## Files to change
- `supabase/migrations/<timestamp>_add_vl390_rpas_values.sql` (new)
- `src/components/eccairs/EccairsEventTypeTreeSelect.tsx` (new)
- `src/components/eccairs/EccairsMappingDialog.tsx` (add field 390 routing)

