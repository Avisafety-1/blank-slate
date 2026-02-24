

# Fix: Feil kolonnenavn ved opprettelse av oppdrag fra DJI-logg

## Problem

I `handleCreateNew` (linje 323 i `UploadDroneLogDialog.tsx`) brukes feil kolonnenavn:

```typescript
risk_level: 'Lav'  // FEIL — kolonnen heter risk_nivå
```

Supabase avviser insert-spørringen fordi `risk_level` ikke finnes i `missions`-tabellen. Det korrekte kolonnenavnet er `risk_nivå`.

## Løsning

**Fil: `src/components/UploadDroneLogDialog.tsx`**, linje 323:

Endre `risk_level` til `risk_nivå`:

```typescript
// Fra:
tidspunkt: effectiveDate.toISOString(), status: 'Fullført', risk_level: 'Lav',

// Til:
tidspunkt: effectiveDate.toISOString(), status: 'Fullført', risk_nivå: 'Lav',
```

En enkelt-tegn endring som fikser hele problemet.

