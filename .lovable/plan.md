

# Add "SSB data" as default option for "Nærhet til mennesker"

## Summary

The proximity-to-people selector currently has three manual options: Ingen, Få, Mange. The edge function already fetches SSB population density and land use data automatically. This change adds a fourth option, "SSB data", as the new default, which tells the AI to rely entirely on the automatically fetched SSB data rather than a manual pilot estimate.

## Changes

### 1. Frontend: `src/components/dashboard/RiskAssessmentDialog.tsx`

**Add new option and change default:**

- Change default value from `'none'` to `'ssb_data'` (line 79)
- Add a new `<SelectItem value="ssb_data">` as the first option in the proximity select (line 486), labeled "SSB data (automatisk)"
- Keep existing options (Ingen, Få, Mange) as manual overrides

### 2. Edge function: `supabase/functions/ai-risk-assessment/index.ts`

**Update AI prompt to handle `ssb_data` value:**

- In the prompt section around line 855, update the fallback logic: when `proximityToPeople` is `"ssb_data"`, instruct the AI to use SSB population density and land use data as the sole source for proximity assessment -- no fallback to manual input needed
- When `proximityToPeople` is one of the manual values (`none`, `few`, `many`), instruct the AI to use the pilot's manual assessment as an override, but still consider SSB data if available

### 3. Translations: `src/i18n/locales/no.json` and `src/i18n/locales/en.json`

- Add `riskAssessment.proximity.ssbData` key: "SSB data (automatisk)" / "SSB data (automatic)"

## Technical details

The edge function already fetches SSB data (lines 390-475 for land use, population density fetched separately). The `proximityToPeople` field currently serves as a fallback when SSB data is unavailable (line 855). With `"ssb_data"` as the value, the AI prompt will be adjusted so SSB data is treated as authoritative rather than supplementary, and the manual options become explicit overrides when the pilot has local knowledge that contradicts the data.

