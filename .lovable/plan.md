# Add "Activated by NOTAM" notice to Polish DRA-P zone popups

## Background
PANSA DRA-P ("Drone Restricted Area — Prohibited") zones in Poland are **flexible zones**: they only actually prohibit flight when activated. On dronemap.pansa.pl this is shown as "None current activity of zone" / "Check activity". In practice these zones are activated via NOTAM (and reported live via DroneTower).

Right now our popup labels them simply "Prohibited area", which misleads users into thinking every red corridor is a hard no-fly. Most of the time they are not active.

## Scope
Presentation-only change. No data reclassification, no DB updates, no changes to the safety-analysis logic (a DRA-P remains PROHIBITED for automated risk scoring — that is the conservative default and matches PANSA's own guidance). The change is purely additional text inside the popup card, and only affects Poland (source starts with `pansa`). Norway and other countries are untouched.

## Changes

1. **`src/lib/unifiedZonePopup.ts` — `pansaBlock()`**
   - When `pansa_restriction` is `DRA-P` / `DRAP`, insert a highlighted notice block at the top of the popup body:
     > ⚠️ **Activated by NOTAM** — This is a flexible zone. Flight is only prohibited when the zone is active. Always check current NOTAM / DroneTower activity before flight.
   - Keep the existing restriction label ("Drone Restricted Area – Prohibited") and the "More info on PANSA DroneMap" link.
   - Optional: for `DRA-R` add a lighter note ("May require approval — check activation status"), since DRA-R is also conditionally activated. Confirm with user if desired; default plan does DRA-P only.

2. **i18n keys** (both `no.json` and `en.json`, under `pages.map.popups.unified.pansa.*`):
   - `activatedByNotam.title` — "Activated by NOTAM" / "Aktiveres via NOTAM"
   - `activatedByNotam.body` — full explanatory sentence
   - `activatedByNotam.checkLink` — "Check PANSA DroneMap for current activity"

3. No changes to:
   - `backfill-poland-kml` edge function
   - `airspace_zones` DB rows
   - Risk assessment / `check_mission_airspace_unified`
   - Any non-PL country

## Verification
- Load the map as a Moderavdeling user, click a red DRA-P corridor in PL → new NOTAM notice visible, styling consistent with existing popup.
- Click a DK/SE/DE/FI/NO prohibited zone → popup unchanged.
- Switch language EN ↔ NO → notice text switches correctly.
