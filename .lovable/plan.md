

## Problem

The `check_mission_airspace` database function only checks the `aip_restriction_zones` table, which contains P, R, D, RMZ, TIZ, and ATZ zones from OpenAIP. It does **not** check three other important spatial tables:

1. **`rpas_ctr_tiz`** - Contains 20 CTR (Control) zones and 31 TIZ zones from Avinor/ArcGIS
2. **`nsm_restriction_zones`** - Contains 154 NSM sensor restriction zones (photography/sensor bans)
3. **`rpas_5km_zones`** - Contains airport 5km buffer zones with airport names

This means warnings for CTR zones, NSM areas, and airport proximity are completely missing from mission cards.

## Solution

Update the `check_mission_airspace` PostgreSQL function to also query these three additional tables, unioning the results with the existing AIP zone checks.

### Database Changes

Modify the `check_mission_airspace` RPC function to add three additional CTEs that check each extra table:

- **CTR/TIZ from `rpas_ctr_tiz`**: Use `properties->>'Zone'` for zone type (CTR or TIZ), and `properties->>'NAVN'` for name (falling back to the `name` column). Severity: **WARNING** for CTR (requires ATC clearance).
- **NSM from `nsm_restriction_zones`**: Zone type = "NSM", name from `properties->>'navn'`. Severity: **WARNING** (sensor/photography restrictions).
- **5km zones from `rpas_5km_zones`**: Zone type = "5KM", name from `properties->>'NAVN'` or `name` column. Severity: **CAUTION** (airport proximity).

All three will use the same convex-hull envelope (`v_envelope`) for spatial pre-filtering and compute `route_inside` and `min_distance` identically to the existing logic.

The results will be UNIONed together and filtered with the same `route_inside = true OR min_distance < 5000` condition.

### Frontend Changes

No frontend changes needed — the `AirspaceWarnings.tsx` component already maps `z_type` and `z_name` from the RPC response into readable messages like "Ruten går gjennom CTR-sone «Oslo lufthavn»". The new zone types (CTR, NSM, 5KM) will automatically appear with correct severity coloring (warning/caution).

### Technical Details

The updated SQL function will look like this (simplified):

```text
RETURN QUERY
WITH candidate_zones AS (
  -- existing: aip_restriction_zones (P, R, D, RMZ, TIZ, ATZ)
  SELECT z.zone_id, z.zone_type, z.name, z.geometry
  FROM aip_restriction_zones z
  WHERE ST_DWithin(z.geometry::geography, v_envelope::geography, 50000)

  UNION ALL

  -- rpas_ctr_tiz (CTR, TIZ from Avinor)
  SELECT c.id::text, properties->>'Zone',
         COALESCE(properties->>'NAVN', c.name), c.geometry
  FROM rpas_ctr_tiz c
  WHERE ST_DWithin(c.geometry::geography, v_envelope::geography, 50000)

  UNION ALL

  -- nsm_restriction_zones (sensor restrictions)
  SELECT n.id::text, 'NSM',
         COALESCE(n.properties->>'navn', n.name), n.geometry
  FROM nsm_restriction_zones n
  WHERE ST_DWithin(n.geometry::geography, v_envelope::geography, 50000)

  UNION ALL

  -- rpas_5km_zones (airport 5km buffers)
  SELECT a.id::text, '5KM',
         COALESCE(a.properties->>'NAVN', a.name), a.geometry
  FROM rpas_5km_zones a
  WHERE ST_DWithin(a.geometry::geography, v_envelope::geography, 50000)
),
route_check AS ( ... same logic ... )
SELECT ... with updated severity mapping:
  - P, R       -> WARNING
  - CTR, NSM   -> WARNING
  - D, RMZ, TMZ, TIZ, ATZ -> CAUTION
  - 5KM        -> CAUTION
```

This restores the full airspace warning coverage that existed before.

