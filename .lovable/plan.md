

## Plan: Fix equipment list filter mismatch

### Problem
`EquipmentListDialog.tsx` line 26-29 recalculates status using only `calculateMaintenanceStatus(neste_vedlikehold, varsel_dager)` (date-based). But the equipment items passed from `useStatusData` already have a fully aggregated `.status` property (including hours, missions, manual DB status). The dashboard shows 3 yellow, but the dialog filter finds 0 because it ignores non-date factors.

### Fix
In `EquipmentListDialog.tsx`, change the filter to use the pre-computed `e.status` (same as DroneListDialog already does):

```typescript
// Before (line 26-29):
return equipment.filter(e => {
  const s = calculateMaintenanceStatus(e.neste_vedlikehold, e.varsel_dager ?? 14);
  return s === statusFilter;
});

// After:
return equipment.filter(e => e.status === statusFilter);
```

Remove the unused `calculateMaintenanceStatus` import if no longer needed.

### File
- `src/components/dashboard/EquipmentListDialog.tsx` — 1 line change in filter logic

