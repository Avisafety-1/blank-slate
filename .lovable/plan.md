

## Problem

Battery analytics data is correctly fetched from the DroneLog API and stored in the `flight_logs` table. However, the **Equipment Logbook UI** ("Batteritrend" tab in `EquipmentLogbookDialog.tsx`) only displays **2 metrics** (cycles and health %) out of the **7+ available** in the database.

### Data already stored but not shown

| DB Column | Description | Shown in UI? |
|---|---|---|
| `battery_cycles` | Charge cycles | Yes |
| `battery_health_pct` | Health score % | Yes |
| `battery_temp_min_c` | Min temperature | No |
| `battery_temp_max_c` | Max temperature | No |
| `battery_voltage_min_v` | Min voltage | No |
| `battery_full_capacity_mah` | Full capacity mAh | No |
| `dronelog_warnings` (cell_deviation) | Cell voltage deviation | No |

### API field coverage vs docs

All relevant `BATTERY.*` fields from `docs/dronelog-api-fields.md` are already requested. No missing fields.

---

## Plan

### 1. Expand the `fetchBatteryTrend` query

Add the missing columns to the SELECT: `battery_temp_min_c`, `battery_temp_max_c`, `battery_voltage_min_v`, `battery_full_capacity_mah`.

### 2. Redesign the Batteritrend tab

Replace the current 2-card layout with a richer dashboard:

- **Summary cards** (top row, 4 cards):
  - Sykluser (current value + trend)
  - Helse % (color-coded)
  - Siste maks temperatur (color-coded: green < 40, yellow 40-50, red > 50)
  - Min spenning (color-coded)

- **Capacity card**: Show `battery_full_capacity_mah` trend (capacity degradation over time)

- **History table**: Expand each row to show date, cycles, health, temp range, min voltage, and capacity per flight

### 3. File changes

Only one file needs modification: `src/components/resources/EquipmentLogbookDialog.tsx`

- Update `BatteryTrendEntry` interface to include new fields
- Update `fetchBatteryTrend` query to select additional columns
- Update the "battery" `TabsContent` to render the expanded cards and table

No database changes needed — all data already exists.

