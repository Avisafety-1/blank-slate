## Mål
Legge til ny dokumentkategori **"Operasjonsmanual"** (verdi: `operasjonsmanual`) som kan brukes ved opplasting/redigering av dokumenter og som filtreres på i `/dokumenter`.

## Endringer

Kategorien er definert som union-type på 5 steder i frontend (ingen DB-constraint — `kategori` er fri TEXT). Alle må oppdateres:

1. **`src/pages/Documents.tsx`** (linje 17) — legg til `"operasjonsmanual"` i `DocumentCategory`-typen.

2. **`src/components/documents/DocumentsFilterBar.tsx`** (linje 18-30) — legg til `{ value: "operasjonsmanual", label: "Operasjonsmanual" }` i `CATEGORIES`-array (filterchips).

3. **`src/components/documents/DocumentsList.tsx`** (linje 55-67) — legg til `operasjonsmanual: "Operasjonsmanual"` i `CATEGORY_LABELS`.

4. **`src/components/documents/DocumentCardModal.tsx`**
   - Linje 70-82: legg til i `CATEGORIES`-array (vises i nedtrekksmeny i edit-dialog).
   - Linje 87: legg til `"operasjonsmanual"` i `z.enum(...)` schema.

5. **`src/components/documents/DocumentUploadDialog.tsx`** (linje 260-268) — legg til `<SelectItem value="operasjonsmanual">Operasjonsmanual</SelectItem>` i opplastingsdialogen.

## Tekniske detaljer
Ingen migrasjon trengs — `documents.kategori` er TEXT uten CHECK-constraint, så nye verdier kan settes inn uten DB-endring. Plassering i listen: rett før "Annet" for konsistens.