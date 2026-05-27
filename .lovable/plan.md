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

### Batch 2 — Dashboard widgets (next up)
- `MissionsSection.tsx` — risk/checklist fallbacks, AlertDialog copy, toast strings.
- `IncidentsSection.tsx` — "Rapporter hendelse", badges, status labels.
- `DocumentSection.tsx` — section title, "Utløpt" badge, empty state.
- `CalendarSection.tsx` / `CalendarWidget.tsx` — weekdays + month names via `date-fns` locale switch, "Aktive flyginger", "Fri flyging", "Vis på kart", "Kommende oppdrag".
- `ActiveFlightsSection.tsx` — labels and live status.
Locale keys go under `dashboard.*` namespaces in `en.json` + `no.json`.

### Batch 3 — DB-value translation helpers
Values stored in Norwegian in the DB (mission status, approval status, incident status/severity/category/root cause, document category). Add display-only mappers in `src/lib/i18nHelpers.ts`:
`translateMissionStatus`, `translateApprovalStatus`, `translateIncidentStatus`, `translateSeverity`, `translateIncidentCategory`, `translateRootCause`, `translateDocCategory`.
DB stays Norwegian — filters, joins, existing data untouched. Then thread these mappers through Batch 2/4/5 components where the value is rendered.

### Batch 4 — Secondary dialogs and pickers
`RiskAssessmentTypeDialog`, `NotamDialog`, `MissionDetailDialog`, `AddMissionDialog`, `AddIncidentDialog`, `NewsSection`, `StatusPanel`, `AISearchBar` ("Internt søk (regelverkssøk)"), resource status cards.

### Batch 5 — Main pages outside the dashboard
`Oppdrag`, `Hendelser`, `Resources`, `Documents`, `Kalender`, `Kart`, `Statistikk`, `SoraProcess`, `Marketing`, admin shells.

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
