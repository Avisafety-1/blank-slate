

## Fix: Garbled Text in PDF Logbook Export

### Root Cause
The flight log title uses `→` (Unicode right arrow, U+2192) as separator: `Flytur: Ørland → Rennebu`. This character is not supported by the subset of Roboto embedded in jsPDF. When jsPDF encounters an unsupported glyph, it corrupts the entire text run, causing every character to render with `&` separators or spaces between them.

### Fix
Two changes needed:

**1. `src/lib/pdfUtils.ts` — Add `→` to `sanitizeForPdf`**
Replace the arrow with a simple ASCII alternative (`->` or `-`):
```
.replace(/→/g, '->')
```

**2. `src/components/resources/EquipmentLogbookDialog.tsx` and `src/components/resources/DroneLogbookDialog.tsx`**
As a belt-and-suspenders fix, also replace `→` in the title construction:
```typescript
title: `Flytur: ${log.departure_location} -> ${log.landing_location}`,
```

This ensures both existing data (via sanitize) and new data (via source) are safe.

### Scope
- `src/lib/pdfUtils.ts` — 1 line addition in `sanitizeForPdf`
- `src/components/resources/EquipmentLogbookDialog.tsx` — replace `→` with `->`
- `src/components/resources/DroneLogbookDialog.tsx` — replace `→` with `->`
- `src/components/FlightLogbookDialog.tsx` — check for same pattern

