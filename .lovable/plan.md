

## Plan: Auto-link checklists when attaching documents to missions

When a user attaches a document with `kategori = "sjekklister"` to a mission via the document picker in AddMissionDialog, it should automatically also be added to the mission's `checklist_ids` array — giving it the same behavior as manually linking via "Tilknytt sjekkliste" (badge, execution dialog, flight-start blocking).

### Changes

**`src/components/dashboard/AddMissionDialog.tsx`**

After inserting `mission_documents`, check which of the selected documents are checklists (kategori = "sjekklister"). For any that are, merge them into the mission's `checklist_ids` array:

1. The `documents` state already contains `kategori` for each document (fetched at line ~270).
2. After the document insert block (both UPDATE path ~line 510-522 and INSERT path ~line 591-603), add logic:
   - Filter `selectedDocuments` to find IDs where the document's `kategori === "sjekklister"`.
   - If any exist, read the mission's current `checklist_ids`, merge in the new checklist IDs (deduplicated), and update the mission row.
   - Also remove from `checklist_ids` any checklist document IDs that were **un-selected** (no longer in `selectedDocuments`).

This ensures:
- Attaching a checklist document → auto-added to `checklist_ids` → badge appears → must complete before flight
- Removing a checklist document → auto-removed from `checklist_ids` → badge disappears
- No duplicate entries in the array
- Existing manually-linked checklists (not in documents) are preserved

### Files to change

1. **`src/components/dashboard/AddMissionDialog.tsx`** — Add checklist_ids sync logic after document insert/update in both the UPDATE and INSERT code paths

