

Issue: User set custom SafeSky callsign prefix in company settings, but published callsign was still `avisafe01` (default). Edge function logs confirm: `Cron callsign: avisafe01 (company: Avisafe, index: 1)` and `Generated callsign: avisafe01 (company: Avisafe, index: 0)`.

Looking at the cron function code (already shown in current-code), it DOES read `safesky_callsign_prefix` and `safesky_callsign_variable` columns. So the read logic looks correct there.

Let me check the advisory function to see if it was updated similarly, and verify the DB has the prefix saved.

Likely causes:
1. The `safesky-advisory` function (publishing path) may not have been updated to read the new columns — the log shows `Generated callsign: avisafe01 (company: Avisafe, index: 0)` which matches old format string `"company: X, index: Y"`, suggesting old code path.
2. Or the value wasn't saved to DB (ChildCompaniesSection save logic issue).
3. Or it's reading from wrong company (mission's company_id vs current selected company).

Need to verify by reading both files and DB.

## Plan

**Diagnose**
1. Read `supabase/functions/safesky-advisory/index.ts` callsign block — verify it uses `safesky_callsign_prefix`/`safesky_callsign_variable`.
2. Read `src/components/admin/ChildCompaniesSection.tsx` save handler — verify it actually persists the values.
3. Query DB: `SELECT id, navn, safesky_callsign_prefix, safesky_callsign_variable, safesky_callsign_propagate FROM companies` to check if the value is stored.

**Fix (most likely)**
- If `safesky-advisory` was missed in earlier edit: update the callsign-generation block to mirror the cron logic (read prefix + variable, fall back to parent, build callsign from sanitized prefix + counter/drone reg suffix).
- If save handler is broken: fix the update payload in `ChildCompaniesSection.tsx`.
- If mission belongs to a different company than the one configured: use mission's `company_id` (with parent fallback) consistently — already what cron does, but confirm.

**Verify**
- Set prefix=`testop`, start mission, check edge logs show `Generated callsign: testop01`.
- Confirm SafeSky receives `testop01` in published advisory.

**Files to touch (likely 1)**
- `supabase/functions/safesky-advisory/index.ts` — sync callsign logic with cron version.

