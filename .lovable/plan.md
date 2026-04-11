

# Plan: Add additional text support to field 447 (Reporting Entity)

## What
Field 447 (Reporting Entity) has ECCAIRS data type "Code and Additional Text", same as field 215 (Operator). Currently it's configured as a simple select (`content_object_array`). We should change it to `code_and_additional_text` with an additional text field for the company name — mirroring how field 215 works.

## Changes

### 1. `src/config/eccairsFields.ts` — Update field 447 config
- Change `format` from `'content_object_array'` to `'code_and_additional_text'`
- Change `type` from `'select'` to `'code_and_text'`
- Add `additionalTextField: 'Selskapsnavn'` (company name label)
- Add `fixedLabel: 'Aircraft operator'` so the code label is human-readable
- Keep `defaultValue: '6133'`

### 2. `supabase/functions/_shared/eccairsPayload.js` — Add format override
- Add `'447': 'code_and_additional_text'` to `FORMAT_OVERRIDES` so the payload builder generates the correct `{content: [id], additionalText: "..."}` structure.

### 3. Auto-fill company name
- In the auto-mapping logic (`EccairsMappingDialog.tsx` or `eccairsAutoMapping.ts`), populate the additional text for field 447 with the company name from the user's profile/company settings, so it's pre-filled when opening the ECCAIRS dialog.

## Result
Field 447 will render as a code+text field (like 215), with "Aircraft operator" as the fixed code label and a text input for the company/operator name. The payload will correctly include `additionalText` when sent to ECCAIRS.

