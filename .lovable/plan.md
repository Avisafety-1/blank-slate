

# Fix: Blank PDF when opening exported mission report

## Root Cause

The PDF export in `oppdragPdfExport.ts` (and `oppdragKmzExport.ts`) stores the **full public URL** in the `fil_url` field:

```typescript
// oppdragPdfExport.ts line 683
fil_url: publicUrl,  // "https://pmucsvrypogtttrajqxq.supabase.co/storage/v1/object/public/documents/..."
```

Every other export in the codebase stores the **relative storage path**:

```typescript
// e.g. DroneLogbookDialog.tsx, incidentPdfExport.ts, etc.
fil_url: filePath,  // "companyId/filename.pdf"
```

The document viewer in `DocumentDetailDialog.tsx` checks if `fil_url` starts with `https://` -- if it does, it opens the URL directly via `window.open()`. Since the `documents` bucket is private, that URL returns empty content, resulting in a blank PDF.

When `fil_url` is a relative path, the viewer correctly generates a **signed URL** via `supabase.storage.createSignedUrl()`, which works properly.

## Fix

Two lines to change:

1. **`src/lib/oppdragPdfExport.ts` line 683**: Change `publicUrl` to `filePath`
2. **`src/lib/oppdragKmzExport.ts` line 59**: Change `publicUrl` to `filePath` (same bug)

No other changes needed. The `getPublicUrl` calls (lines 673-675 in PDF, lines 52-54 in KMZ) can also be removed since the public URL is no longer used.

## Impact

- Fixes blank PDF when opening exported mission reports
- Fixes the same issue for KMZ exports
- Aligns with the pattern used by all other file exports in the codebase
- No functional changes beyond the bug fix

