

# Plan: Fix JSON array parsing for content_object_array and code_and_additional_text

## Problem
Fields 454, 1064, 495, 1072 store `value_id` as JSON array strings (e.g. `'["1116"]'`). The `selectionToE2Value` function calls `asInt(valueId)` which returns `null` for these, causing all four fields to be rejected.

## Solution

### File: `supabase/functions/_shared/eccairsPayload.js`

1. **Add shared helper `parseValueIds(valueId)`** that:
   - Tries `JSON.parse` if string starts with `[`
   - Returns array of integers (via `asInt`) filtering out nulls
   - Falls back to `[asInt(valueId)]` for plain strings
   - Returns `null` if no valid integers found

2. **Update `content_object_array` branch** (line 281-285):
   - Use `parseValueIds(sel.valueId)` instead of `asInt(sel.valueId)`
   - Map each integer to `{ content: [n] }`

3. **Update `code_and_additional_text` branch** (line 301-308):
   - Use `parseValueIds(sel.valueId)` instead of `asInt(sel.valueId)`
   - Map each integer to `{ content: [n], additionalText: sel.text }` (text on first item only)

4. **Add field 454 to `FORMAT_OVERRIDES`** as `'code_and_additional_text'` per ECCAIRS spec ("Code and Additional Text" data type).

### Helper function:
```javascript
function parseValueIds(valueId) {
  if (!valueId) return null;
  try {
    if (typeof valueId === 'string' && valueId.startsWith('[')) {
      const arr = JSON.parse(valueId);
      const ids = (Array.isArray(arr) ? arr : [arr]).map(v => asInt(v)).filter(n => n != null);
      return ids.length > 0 ? ids : null;
    }
  } catch (e) { /* fall through */ }
  const n = asInt(valueId);
  return n != null ? [n] : null;
}
```

### Expected result
Fields 454, 1064, 495, 1072 will no longer appear in `rejected`. Edge function redeploy required (automatic).

