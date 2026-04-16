

## NOTAM Text Generator

### What We're Building
A NOTAM text generator dialog accessible from mission cards. It auto-fills fields from mission data and generates a copyable NOTAM text following the Norwegian AIP BVLOS format. Saved NOTAMs show a badge on the mission card.

### NOTAM Text Format (per user example)
```text
MON-FRI 0800-1600
Unmanned ACFT (BVLOS) will take place in Rennebu
PSN 631234N 0101234E, radius 0.5 NM.
MAX HGT 400 FT AGL.
For realtime status ctc Avisafe AS, tel +47 123 45 678
```

### Database Migration
Add 16 nullable columns to `missions`:

```sql
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_text text;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_operation_type text;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_start_utc timestamptz;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_end_utc timestamptz;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_schedule_type text;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_schedule_days text[];
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_schedule_windows jsonb;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_area_name text;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_center_lat_wgs84 double precision;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_center_lon_wgs84 double precision;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_radius_nm double precision;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_max_agl_ft integer;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_submitter_name text;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_submitter_company text;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_realtime_contact_name text;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS notam_realtime_contact_phone text;
```

### New Component: `NotamDialog.tsx`
- Editable form fields pre-filled from mission data (coordinates, location, times, company)
- Defaults: `operation_type` = "BVLOS", `radius_nm` = 0.5, `max_agl_ft` = 400
- Schedule picker: continuous / daily with day+time selection
- Generated NOTAM text in read-only textarea with **Copy** button
- **Save** persists all fields + generated text to missions table
- Coordinate helper: decimal → `DDMMSSN DDDMMSSE` format

### UI Integration

**MissionCard.tsx** — Add "NOTAM" dropdown menu item + green "NOTAM" badge when `notam_text` exists. Wire `onNotam` callback.

**MissionDetailDialog.tsx** — Add "NOTAM" button + display saved text section.

**MissionsSection.tsx** — Show small "NOTAM" badge when `mission.notam_text` is set.

**Oppdrag.tsx** — Wire NotamDialog state management.

### Files
| File | Action |
|------|--------|
| `src/components/dashboard/NotamDialog.tsx` | Create |
| `src/components/oppdrag/MissionCard.tsx` | Edit — menu item + badge |
| `src/components/dashboard/MissionsSection.tsx` | Edit — badge |
| `src/components/dashboard/MissionDetailDialog.tsx` | Edit — button + display |
| `src/pages/Oppdrag.tsx` | Edit — wire dialog |
| Migration | 16 columns on `missions` |

