

## Legg til «Additional Text» for Attributt 215 (Operator)

### Problem
ECCAIRS Attributt 215 har datatypen «Code and Additional Text». Det betyr at i tillegg til å velge en verdi fra value list (f.eks. `1799998` = Norway → Other), skal brukeren kunne skrive inn operatørnavnet som fritekst. Dagens implementasjon støtter kun kode-valget, ikke fritekstfeltet.

### Løsning
Utvide systemet med en ny felttype `code_and_text` som kombinerer en dropdown (koden) med et tekstfelt (additional text). For felt 215 vil dette vise:
- Dropdown: Velg operatør fra VL215 (default: Norway → Other)
- Tekstfelt: Skriv inn operatørens navn

### Endringer

**`src/config/eccairsFields.ts`**
- Legg til ny type `'code_and_text'` i `EccairsFieldConfig.type`
- Legg til valgfri `additionalTextField?: string` egenskap for label på fritekstfeltet
- Oppdater felt 215: `type: 'code_and_text'`, `additionalTextField: 'Operatørnavn'`
- Legg til ny format `'code_and_additional_text'` i `EccairsFormat`

**`src/components/eccairs/EccairsMappingDialog.tsx`**
- Legg til rendering av `code_and_text`-felt: dropdown + tekstfelt under
- Lagre additional text i `text_value`-kolonnen, koden i `value_id`

**`supabase/functions/_shared/eccairsPayload.js`**
- Legg til ny format `code_and_additional_text` i `selectionToE2Value`
- Generer E2-format: `[{content: [kode], additionalText: "operatørnavn"}]` (eller tilsvarende per E2 API-spesifikasjon — mest sannsynlig `[1799998, "Company Name"]` som en array med mixed types)

### Filer som endres
- `src/config/eccairsFields.ts`
- `src/components/eccairs/EccairsMappingDialog.tsx`
- `supabase/functions/_shared/eccairsPayload.js`

