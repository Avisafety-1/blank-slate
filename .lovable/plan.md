## Why the screenshot still shows Norwegian

The edge function `ai-risk-assessment` was redeployed (deploys are automatic on file save). However, every risk assessment is **persisted** in `mission_risk_assessments.ai_analysis` as a JSON blob. The strings you see ("Tynt befolket…", "Systemberegnet iGRC=3 fra SORA-tabellen…", "Ikke automatisk kreditert…") were baked into that row when the assessment was first generated — **before** the edge function was localized.

The new code only takes effect when a fresh assessment is produced. Open the mission and click **"Run SORA-based reassessment"** (or generate a new assessment) — the new run will be saved in English.

### Verification step before any new work

1. Pick any mission.
2. Run a fresh AI risk assessment on the English UI.
3. Confirm the Ground Risk section reads end-to-end in English.

If anything is still Norwegian after a fresh run, that string is a residual hardcode we'll patch — but no new code should be written until we know whether step 2 is clean.

### Optional: backfill / display-time fallback

We have two ways to handle the historical Norwegian rows. Pick one — I will **not** implement anything until you choose:

- **A. Leave history as-is.** Simplest. Old assessments stay in the language they were generated in. Re-run reassessment to refresh. Recommended.
- **B. Display-time fallback.** Detect a handful of known Norwegian phrases in `GroundRiskAnalysisSection` and translate them on render. Brittle (string-matching), adds frontend logic, but no DB rewrite.
- **C. One-off backfill script.** Run an admin script that re-generates the deterministic ground-risk block for every existing row in English. Safe but touches data; needs a confirmation gate.

## Plan for translating the rest of the app

I'll work in the same 5 batches we agreed on earlier, but tightened with concrete acceptance gates. Each batch is a separate implementation pass — we ship it, you verify in the English UI, then we start the next.

### Batch 2 — Dashboard widgets ✅ DONE
- `MissionsSection.tsx` — approval toasts ("Gjennomfør SORA først", "Kunne ikke sjekke godkjennere", "Ingen i selskapet har rollen…", "Kunne ikke sende til godkjenning"), checklist `itemName` fallback, and the "Send til godkjenning?" AlertDialog (title, description, cancel, confirm) now go through `t('dashboard.missions.*')`.
- `CalendarWidget.tsx` — dynamic event titles ("… utgår", "… - inspeksjon", "… - vedlikehold") and the document-created toast now use existing `dashboard.calendar.*` keys.
- `IncidentsSection.tsx`, `DocumentSection.tsx`, `ActiveFlightsSection.tsx` — scanned, already fully t()-driven; remaining Norwegian literals are DB enum values handled in Batch 3.
- `CalendarSection.tsx` — unused (mock-data legacy), not touched.
New keys added under `dashboard.missions.*` in both `en.json` and `no.json`.

### Batch 3 — DB-value translation helpers ✅ DONE
Added display-only mappers in `src/lib/i18nHelpers.ts` (DB values stay Norwegian — filters/joins untouched):
`translateMissionStatus`, `translateApprovalStatus`, `translateIncidentStatus`, `translateSeverity`, `translateIncidentCategory`, `translateDocCategory`, `translateSoraStatus`, `translateAIRiskRecommendation`, `translateRootCause`.
- Wired existing `getApprovalStatusLabel` and `getAIRiskLabel` in `oppdragHelpers.ts` to the new mappers, so every caller (mission cards, badges, lists, PDF helpers reading these labels) auto-translates.
- Threaded mappers through `IncidentsSection` (severity/category/status badges, both tabs), `DocumentSection` (category chip), and `MissionStatusDropdown` (badge label, popover items, "Status changed to …" toast, post-flight checklist AlertDialog).
- Added i18n keys for the post-flight checklist dialog and status-change toast under `dashboard.missions.*`.
DB stays Norwegian — filters, joins, existing data untouched. Then thread these mappers through Batch 2/4/5 components where the value is rendered.

### Batch 4 — Secondary dialogs and pickers ✅ PARTIAL
Done:
- `MissionDetailDialog` — "Send til godkjenning?" AlertDialog (title/description/cancel/confirm), "Godkjenn i Ninox?" AlertDialog, and SORA/approver toast errors now via `t('dashboard.missions.*')`. Added `approveInNinoxTitle/Description/approve` keys.
- `AISearchBar` — "Internt søk", "(regelverkssøk)", regulations placeholder now via `t('dashboard.search.*')`.
- `NotamDialog` — full pass: title, all field labels (operation type, area, lat/lon, radius, max height, schedule + select items, from/to date pickers + "Velg dato", from/to time UTC, company/contact/phone + note, VHF + note, generated NOTAM, submit disclaimer), action buttons (copy/save/saving/submit/submitting), toasts (copied/saved/couldNotSave/couldNotSubmit/submittedSuccess/clipboardFallback), dynamic contact-availability strings (daily / 24-7 / no-dates) with interpolation, and elevation-loading footnote. New `dashboard.notam.*` namespace added to en.json + no.json.
- `RiskAssessmentTypeDialog`, `NewsSection`, `StatusPanel` — re-scanned, already fully i18n-ed.

Deferred (large forms — Batch 4B):
- `AddMissionDialog` — has 21 Norwegian strings (form labels, command-input placeholders "Søk personell/dokumenter/...", "Søk og redning" select item, mission-status SelectItems "Pågående"/"Fullført", default risk_nivå literal). Big form; wants its own pass.
- `AddIncidentDialog` — has 23 Norwegian strings (severity/status/kategori SelectItems, "Velg hovedårsak", "Søk i oppdrag", "Søk pilot/drone/person", error/success toasts). Big form; wants its own pass.

### Batch 5 — Main pages outside the dashboard ✅ MOSTLY DONE
Done: `Oppdrag`, `Hendelser`, `Documents`, `Kalender`, `Kart`, `Statistikk`, `Priser` (full pass — `pages.pricing.*` namespace added), `Resources` (filter placeholders, status/category/role select items, "no results" fallback — uses `resources.searchVehiclePlaceholder` interpolation with `terminology.vehicleLower`).
Remaining: `SoraProcess` (616-line static explainer page), `Marketing` shell + sub-sections, admin shells. Static SoraProcess is its own pass — large surface, mostly long-form Norwegian copy.

### Working method per batch
1. Grep the target files for hardcoded Norwegian (`scripts/i18n-scan.ts` already exists — I'll lean on it).
2. Add keys to `src/i18n/locales/en.json` + `no.json` under a clear namespace.
3. Replace literals with `t('...')`. No business logic touched.
4. After each batch you flip to English and spot-check.

### Out of scope (explicitly not touched in this round)
- Backend prompts / AI-generated copy (already handled).
- Database schemas, RLS, enum values.
- PDF export templates — separate pass if you want.
- ECCAIRS / SORA process pages — Batch 5 only.

## Recommended next action

1. Run a fresh AI risk assessment to confirm the edge-function localization is live.
2. Tell me **A / B / C** for historical assessments.
3. Say "go" and I'll start Batch 2.
