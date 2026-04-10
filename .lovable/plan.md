

## Fix: "Test tilkobling" should only appear after saving

### Problem
When pasting a new FH2 key and clicking "Test" without saving first, the button hangs. The `handleTestFh2` saves the key then immediately calls `test-connection`, but the test may fail or hang because the DB hasn't fully processed the save.

### Solution

**File: `src/components/admin/ChildCompaniesSection.tsx`**

1. **Hide "Test tilkobling" when the user has entered a new unsaved key** -- only show it when there's a saved key in DB (i.e. `fh2Token === FH2_MASK` or `fh2Connected` is true).

2. **After successful save (`handleSaveFh2`), auto-set `fh2Token` to `FH2_MASK`** so the Test button becomes visible.

3. **Simplify `handleTestFh2`** -- remove the save-token branch entirely. It should only call `test-connection` since the key is guaranteed to already be saved.

### UI button visibility logic:
- **"Lagre"**: visible when `fh2Token !== FH2_MASK && fh2Token !== ""` (new key entered)
- **"Test tilkobling"**: visible only when `fh2Token === FH2_MASK` (key is saved in DB)
- **"Slett"**: visible when `fh2Connected`

### Changes in `handleSaveFh2`:
- After successful save, set `fh2Token(FH2_MASK)` and `fh2Editing.current = false` so the Test button appears

### Changes in `handleTestFh2`:
- Remove the `save-token` branch (lines 531-535)
- Only call `test-connection`

