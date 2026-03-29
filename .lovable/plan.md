

## Fix 3 ECCAIRS E2 API validation errors

### Errors
1. **Attribute 244** (Serial number): Value "1581F6GKB2373004" is 16 chars, E2 allows max 11. Need to truncate.
2. **Attribute 495** (Reporting form type): Stored as `value_list_int_array` → sends integer `[501]`, but E2 expects `content_object_array` format `[{content: [501]}]`.
3. **Attribute 1064** (Parties informed): Same issue — stored as `value_list_int_array` → sends integer `[5]`, but E2 expects `content_object_array`.

### Fixes

#### 1. `src/config/eccairsFields.ts`
- Change `code: 244` maxLength from `100` to `11`
- Change `code: 495` format from `value_list_int_array` to `content_object_array`
- Change `code: 1064` format from `value_list_int_array` to `content_object_array`

#### 2. `supabase/functions/_shared/eccairsPayload.js`
- Add a safety truncation for attribute 244 in `selectionToE2Value` or in the main builder: if format is `string_array` and attribute is 244, truncate to 11 chars
- Alternatively, handle in the builder loop where string values are emitted

#### 3. Existing DB rows for this incident
The `incident_eccairs_attributes` rows for 495 and 1064 have `format: 'value_list_int_array'`. The payload builder reads format from DB. Two options:
- **Option A**: Update the DB rows to use `content_object_array` format (requires data update)
- **Option B**: Add a format override map in `eccairsPayload.js` that forces certain attributes to use `content_object_array` regardless of what's stored

I'll use **Option B** (format override in payload builder) since it's more robust and handles existing data.

### Files changed

| File | Change |
|------|--------|
| `src/config/eccairsFields.ts` | Fix formats for 495, 1064; fix maxLength for 244 |
| `supabase/functions/_shared/eccairsPayload.js` | Add FORMAT_OVERRIDES map + truncate string values for attr 244 |

