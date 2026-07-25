## Problem

Polish PANSA zones (DRA-P *and* DRA-R, e.g. EPTR11B, EPTR22A/C, MCTR EPIR, EPTS10A) are "flexible" — they only impose restrictions when activated (via NOTAM / DroneTower). Today we treat them as always-restricted, which:

1. Shows a red WARNING banner on missions passing near/through them (screenshot 3 — 8+ false warnings on one route).
2. Only DRA-P popups show the yellow "Activated by NOTAM" notice; DRA-R popups (EPTR11B etc.) look like hard restrictions.

Confirmed from PANSA's own zone descriptions in screenshots 1–2:
- DRA-P: "UAV flights are prohibited in the *active* zone" + "If inactive, does not cause any restrictions"
- DRA-R: "In the *active* DRA-R zone, consent from the TRA Zone Manager is required" (implicit: inactive = no restriction)

## Changes

Scope: Poland only. NO/DK/SE/DE/FI behaviour unchanged. Moderavdeling-only (unified pipeline is still allowlist-gated).

### 1. Popup notice for DRA-R (`src/lib/unifiedZonePopup.ts`)
Extend the existing PANSA branch so both `DRA-P` and `DRA-R` render the yellow "Activated by NOTAM" info box, with slightly different wording:
- DRA-P: "Flight prohibited *only when active*. Check NOTAM / DroneTower before flight." (existing text kept)
- DRA-R: "Manager consent required *only when active*. Check NOTAM / DroneTower before flight."

New i18n keys under `pages.map.popups.unified.pansa.*` in both `no.json` and `en.json`.

### 2. Downgrade mission warnings for flexible PL zones
Route-proximity severity is set in `src/lib/airspaceUnified.ts` → `severityFromRestriction()`. Currently any PL DRA-P/DRA-R inside the route → `warning` (red).

Adjust so PANSA "flexible" zones (source starts with `pansa`, zone_type in DRA-P / DRA-R families incl. EPTR/EPTS/MCTR corridors) map to `note` (blue info) instead of `warning`/`caution`, regardless of inside/outside. Rationale: without live NOTAM activation data we cannot assert a hard restriction. The popup already tells the pilot to check NOTAM.

DRA-I stays as `note` (unchanged).

### 3. AI risk assessment (`check_mission_airspace_unified` + `ai-risk-assessment` edge function)
Same rule: for PL PANSA zones, pass them to the AI as *informational* ("flexible zone, verify NOTAM") rather than as hard conflicts, so `AI: Caution` isn't triggered purely by DRA-R/DRA-P overlap.

### Out of scope
- Actually ingesting live PANSA activation state (would need a separate PANSA activity API integration). Follow-up if desired.
- Any change to NO / DK / SE / DE / FI zones.

## Technical touch-points

```
src/lib/unifiedZonePopup.ts          # extend pansaBlock for DRA-R
src/lib/airspaceUnified.ts           # severityFromRestriction: PL flexible → note
src/i18n/locales/no.json, en.json    # new pansa.* keys
supabase/functions/ai-risk-assessment/index.ts   # tag PL PANSA zones as informational
```

No DB migration needed — classification of the 2,738 PL zones stays as is.
