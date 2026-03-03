

## Problem: Edit button in MissionDetailDialog closes dialog and loses state

When opened from AISearchBar, clicking the edit pencil button calls `handleEditClick` which:
1. Calls `onOpenChange(false)` — this triggers `setSelectedMission(null)` in AISearchBar
2. MissionDetailDialog unmounts (since `open={!!selectedMission}` becomes false)
3. The `editDialogOpen` state and `AddMissionDialog` are destroyed before they can render

### Fix

**File: `src/components/dashboard/MissionDetailDialog.tsx`**

Remove the line `onOpenChange(false)` from `handleEditClick` (line 141). The detail dialog should stay open (but hidden behind) while the edit dialog opens, or better: keep both dialogs managed inside the component without closing the parent.

Actually the cleanest fix: Don't close the detail dialog when opening edit. Just open the edit dialog on top. The detail dialog will naturally be behind it. When edit completes, `handleMissionUpdated` already calls `onOpenChange(false)`.

Change `handleEditClick` from:
```typescript
const handleEditClick = () => {
  onOpenChange(false);
  setEditDialogOpen(true);
};
```
To:
```typescript
const handleEditClick = () => {
  setEditDialogOpen(true);
};
```

This works because `AddMissionDialog` renders as its own Dialog on top, and when editing is done, `handleMissionUpdated` closes everything properly.

Also noted: there are **duplicate "Rediger rute" buttons** on lines 160-164 and 166-170 — will clean that up too.

