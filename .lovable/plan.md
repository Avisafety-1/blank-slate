## Scope

Continue Poland rollout for "Moderavdeling" (allowlist-gated, unified pipeline). NO/DK/SE/DE/FI users unaffected.

Two pieces left:
1. **Nature protection areas** (GDOŚ — Natura 2000 + national parks / reserves)
2. **NOTAM** coverage for Poland via existing notaminfo pipeline

Airspace (PANSA, 2 738 zones) and popup/severity handling for flexible DRA-* zones are already in.

---

## 1. Poland nature areas (GDOŚ)

**Source:** GDOŚ Geoserwis WFS (`https://sdi.gdos.gov.pl/wfs`), same pattern as `sync-sweden-nature` and `sync-de-drone-zones`. Layers to ingest:

- `Natura 2000 — Special Protection Areas (SPA/OSO)` — bird directive
- `Natura 2000 — Special Areas of Conservation (SAC/SOO)` — habitats directive
- `National parks (Parki Narodowe)`
- `Nature reserves (Rezerwaty przyrody)`
- `Landscape parks (Parki krajobrazowe)`

**New edge function:** `supabase/functions/sync-pl-nature/index.ts`
- Tiled WFS fetch (bbox loop, similar to German adapter) to stay under response caps.
- Normalize into `airspace_zones` with:
  - `country_code = 'PL'`
  - `source = 'pl_gdos_<layer>'` (e.g. `pl_gdos_natura2000_spa`, `pl_gdos_park_narodowy`)
  - `restriction_type = 'NATURE_SENSITIVE'` (matches SE nature classification — never a hard block, just caution + popup)
  - `zone_type = 'NATURE'`
  - `name`, `short_name`, `theme` populated from feature properties (`nazwa`, `kod`, `typ`), so popups read cleanly.
  - `authority = 'GDOŚ'` and an official info URL in `properties` (per-area link when available).
- Upsert by `(source, external_id)` and mark stale rows inactive — same convention as other adapters.

**Backfill:** run the function once after deploy; expected ~2 000 protected areas.

**UI:** no changes required. Auto-reveal along routes (`unifiedRouteProximityLayers`) and the shared popup builder (`unifiedZonePopup.ts`, `naturvardsverket` styling reused for the `pl_gdos_*` source prefix — small `sourceLabel` addition to return "GDOŚ (PL)").

## 2. Poland NOTAM

**Source:** notaminfo per-country briefing (already used for FR/IE/IT/etc.).

**DB:** insert a `notam_rss_feeds` row:
```
name: 'notaminfo: Poland'
country: 'Poland'
source_type: 'country_briefing'
feed_url: 'https://notaminfo.com/latest?country=Poland'
enabled: true
```

**Code:** `supabase/functions/fetch-notams/index.ts` — add `Poland: 'POL'` to `countryToIso3`. No parser changes; the existing block scraper handles PL briefings.

**Verification:** manually invoke `fetch-notams`, confirm PL NOTAMs land in `notams` with `country_code = 'POL'` and render on the map (existing NOTAM layer already filters by bbox, so PL is picked up automatically inside Moderavdeling's viewport).

## 3. Risk assessment

Nothing new. `check_mission_airspace_unified` already returns PL zones for allowlisted companies. `NATURE_SENSITIVE` maps to `note`/blue (same as SE), so no false red warnings. NOTAM contribution flows through the existing NOTAM path.

---

## Out of scope

- Live PANSA activation state (would need a separate DroneTower API integration).
- Any change to NO / DK / SE / DE / FI behaviour.
- Rolling out beyond "Moderavdeling".

## Technical touch-points

```
supabase/functions/sync-pl-nature/index.ts          # NEW
supabase/functions/fetch-notams/index.ts            # + Poland: 'POL'
src/lib/unifiedZonePopup.ts                         # sourceLabel: pl_gdos_* → 'GDOŚ (PL)'
notam_rss_feeds                                     # insert Poland row (migration)
```

No schema changes needed — nature areas reuse the existing `airspace_zones` shape.
