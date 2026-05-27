## Problem

The strings under **Ground Risk Class** in the risk assessment UI (population band, calculation, footprint description, iGRC reasoning, GRC calculation method, all four mitigation `reasoning` texts) are still Norwegian on the English UI.

They are **not** AI-generated — they are deterministic, hardcoded Norwegian strings built inside the edge function `supabase/functions/ai-risk-assessment/index.ts`, then sent back as data fields the frontend renders verbatim. That's why the system-prompt translation instruction does not affect them, and why frontend `t()` calls cannot fix them (the value, not the label, is Norwegian).

The edge function already receives a `language` parameter from the client, so we can branch on it.

## Fix (backend only — edge function)

Introduce a small locale helper inside `ai-risk-assessment/index.ts` and translate exactly these deterministic outputs:

1. `getPopulationBand(densityPerKm2)` — return English bands when `lang === 'en'`:
   - "Controlled ground area"
   - "Sparsely populated (<100/km²)"
   - "Populated (<500/km²)"
   - "Densely populated (<1500/km²)"
   - "Gatherings of people (>1500/km²)"

2. `computePopulationDensity(...)` outputs:
   - `calculation`: "X people in dimensioning 250 m cell × 16 = Y people/km²"
   - `footprintDescription`: "Planned route + Flight Geography + Contingency + Ground Risk Buffer (N m from route)."
   - `driver` text: "near segment P1–P2 (107 m from SSB cell centre)" / "within the operation footprint"

3. iGRC block in the main computation:
   - `population_density_footprint` fallback: "Planned route with operational volume and ground risk buffer."
   - `grc_calculation_method`: "System-calculated using the fixed SORA iGRC matrix. AI output cannot modify iGRC/fGRC."
   - `igrc_reasoning`: "System-calculated iGRC=N from the SORA table based on characteristic dimension … m (…), max speed … m/s (…) and dimensioning SSB 250 m population density … people/km² (…)."
   - `igrc_table_basis`: "Dimension class …, speed class …, population class …"

4. Mitigation `reasoning` strings (the four M1A/M1B/M1C/M2 explanations).

5. The longer SSB explanation paragraph (~line 1560) used elsewhere in the response.

6. Numeric formatting: keep `nb-NO` for Norwegian; use `en-GB` (space thousands, dot decimal — matches what's already shown like "9.6 kg") when `lang === 'en'`. Add a `formatNumber(value, decimals, lang)` helper alongside the existing `formatNbNumber`.

Pass `language` (already destructured at line 355) into `computePopulationDensity` and the iGRC reasoning block. Default to `'no'` when missing so existing Norwegian customers see no change.

## Out of scope

- No frontend changes — `GroundRiskAnalysisSection.tsx` already uses `t()` for labels.
- No DB / migration / prompt logic changes.
- Other batches (Dashboard widgets, DB enums, etc.) from the existing plan remain queued.

## Verification

After deploy, open a risk assessment on the English UI and confirm the Ground Risk section reads in English end-to-end. The Norwegian UI should be unchanged.
