

# Plan: Fix field 454 validation + restrict field 1072 to single value

## Two issues

### Issue 1: Field 454 still rejected despite parseValueIds fix
The `parseValueIds` fix correctly converts `["1116"]` to `[1116]` for the **payload generation** step. But the **validation step** (`validateValueListSelections`) runs before that and receives the raw `valueId` string `'["1116"]'`. It passes this directly to the DB query `.in("value_id", ['["1116"]'])` which doesn't match `'1116'` in the DB. The validation key also becomes `VL454:["1116"]` instead of `VL454:1116`.

**Fix in `supabase/functions/_shared/eccairsPayload.js`:**
1. In `validateValueListSelections` (line 71-76): Parse JSON array valueIds before adding to the lookup set. Use `parseValueIds` to extract actual IDs.
2. In the validation check (line 426): Also parse the valueId when constructing the lookup key.

### Issue 2: Field 1072 (Deteksjonsfase) should allow max 1 value
Field 1072 uses `content_object_array` format, which renders as `EccairsMultiSelect` with default `maxItems=5`. Per ECCAIRS spec it should be single-value.

**Fix in two places:**
1. `src/config/eccairsFields.ts`: Add `maxValues: 1` to field 1072's config.
2. `src/components/eccairs/EccairsMappingDialog.tsx`: When rendering `EccairsMultiSelect`, pass `maxItems={field.maxValues || 5}` to respect per-field limits.
3. `src/config/eccairsFields.ts`: Add `maxValues` to `EccairsFieldConfig` interface.

## Technical details

### validateValueListSelections fix
```javascript
// Before adding to byCode set, parse JSON arrays
for (const sel of selections) {
  if (!sel?.code || sel?.valueId == null) continue;
  const code = String(sel.code);
  if (!byCode.has(code)) byCode.set(code, new Set());
  // Parse JSON array strings to individual IDs
  const ids = parseValueIds(sel.valueId);
  if (ids) {
    for (const id of ids) byCode.get(code).add(String(id));
  } else {
    byCode.get(code).add(String(sel.valueId));
  }
}
```

### Validation check fix (line 424-434)
Parse valueId to individual IDs and check each:
```javascript
if (sel.format === "value_list_int_array" || sel.format === "code_and_additional_text") {
  if (!sel.valueId) continue;
  const ids = parseValueIds(sel.valueId);
  const allValid = ids && ids.every(id => validSet.has(`VL${sel.code}:${id}`));
  if (!allValid) {
    rejected.push({ attribute_code: sel.code, value_id: sel.valueId, reason: "Not found in eccairs.value_list_items" });
    continue;
  }
}
```

### Field 1072 single-value restriction
Add `maxValues?: number` to `EccairsFieldConfig` and set `maxValues: 1` on field 1072. Pass it through to `EccairsMultiSelect`.

## Files to change
- `supabase/functions/_shared/eccairsPayload.js` - Fix validation to parse JSON array valueIds
- `src/config/eccairsFields.ts` - Add `maxValues` to interface + field 1072 config
- `src/components/eccairs/EccairsMappingDialog.tsx` - Pass `maxItems` from field config

