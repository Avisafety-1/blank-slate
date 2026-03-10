

## Legg til CSV-eksport på /status

### Endring i `src/pages/Status.tsx`

**1. Ny funksjon `handleExportCSV`** (etter `handleExportPDF`):
- Bygger en CSV-streng med alle samme datasett som Excel-eksporten (KPI, oppdrag per måned, status, risiko, hendelser, årsaker, alvorlighetsgrad, dronestatus, utstyrstatus, flyvetimer, dokumenter)
- Separerer seksjoner med en tom linje mellom hver
- Bruker semikolon som separator (norsk standard)
- Laster ned som `.csv`-fil via `Blob` + `URL.createObjectURL`
- Lagrer også til Supabase Storage + documents-tabellen (samme mønster som Excel)

**2. Ny menyvalg i dropdown** (linje ~1086):
```tsx
<DropdownMenuItem onClick={handleExportCSV}>
  <Download className="w-4 h-4 mr-2" />
  Eksporter til CSV
</DropdownMenuItem>
```

Dropdown vil da ha 3 valg: Excel, PDF, CSV.

