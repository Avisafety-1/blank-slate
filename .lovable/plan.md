

## Three bugs to fix

### Bug 1: Drone and Equipment aggregated status ignores DB `status` field

In `Resources.tsx`, `_aggregatedStatus` for drones is calculated purely from maintenance dates (`neste_inspeksjon`, accessories, linked equipment). It never considers the DB `status` column (which gets set to "Gul"/"Rød" by warning log uploads). Same issue for equipment — line 483 uses `calculateMaintenanceStatus(item.neste_vedlikehold)` and ignores `item.status`.

**Fix in `Resources.tsx`**:
- Drone: After computing `_aggregatedStatus` from `calculateDroneAggregatedStatus`, also compare with `drone.status` from DB and take the worst (highest priority).
- Equipment: After computing maintenance status, compare with `item.status` from DB and take the worst.

**Fix in `useStatusData.ts`**: Same pattern — the dashboard Status page also ignores DB `status` for equipment.

### Bug 2: Equipment Badge turns blue after "Kvitter ut"

In `EquipmentDetailDialog.tsx` line 318, the Badge uses:
```
variant={equipment.status === 'Grønn' ? 'default' : ...}
```
The `default` variant = `bg-primary` = blue. Should use `getStatusColorClasses` from `maintenanceStatus.ts` like the drone dialog does, with explicit color classes instead of Badge variants.

**Fix**: Import `getStatusColorClasses` and `calculateMaintenanceStatus` in `EquipmentDetailDialog.tsx`. Replace the Badge variant logic with:
```tsx
<Badge className={`${getStatusColorClasses(equipment.status as Status)} border`}>
```

### Bug 3: "Kvitter ut" visibility should also check aggregated status

In `DroneDetailDialog.tsx` line 608, the "Kvitter ut" button shows when `drone.status === 'Gul' || drone.status === 'Rød'`. This is correct for the DB status field. No change needed here — it correctly checks the DB field that was set by the warning.

### Files to change

1. **`src/pages/Resources.tsx`** — Factor in DB `status` when computing displayed status for both drones and equipment
2. **`src/components/resources/EquipmentDetailDialog.tsx`** — Use `getStatusColorClasses` for Badge styling instead of variant-based coloring
3. **`src/hooks/useStatusData.ts`** — Factor in DB `status` for equipment status counting
4. **`src/lib/maintenanceStatus.ts`** — Add a small helper `worstStatus(a, b)` to pick the worst of two statuses

