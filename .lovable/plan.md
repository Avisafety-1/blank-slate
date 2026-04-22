

## Plan: Vis "CAA Norway" i stedet for bare "CAA" for VL453 (felt 453 – Ansvarlig enhet)

### Bakgrunn
ECCAIRS-taksonomien VL453 ("Responsible Entity") inneholder ~190 oppføringer som alle har `value_description = "CAA"` — ingen landangivelse. Dette gjør at både den valgte verdien og dropdown-listen viser bare "CAA", og brukeren kan ikke skille Norges CAA (value_id `2133`) fra alle andre lands CAA-er.

Default-verdien er allerede satt til `2133` i `eccairsFields.ts`, men UI-et viser fortsatt bare "CAA".

### Løsning (to deler)

**Del 1 — Fast etikett for valgt verdi (rask seier)**
Sett `fixedLabel: 'CAA Norway'` på felt 453 i `src/config/eccairsFields.ts`. `EccairsTaxonomySelect` støtter allerede `fixedLabel` og vil da vise "CAA Norway" så lenge `value === 2133`.

Problem: hvis brukeren åpner dropdownen og bytter, viser knappen feil etikett. Derfor må vi også løse dropdown-visningen.

**Del 2 — Vis `value_id` ved siden av "CAA" i dropdownen for VL453**
I `src/components/eccairs/EccairsTaxonomySelect.tsx`:
- Når `valueListKey === 'VL453'`: rendre `{item.value_description} ({item.value_id})` i `CommandItem` slik at brukeren ser "CAA (2133)", "CAA (2102)" osv.
- For valgt verdi: hvis `value === '2133'` vis "CAA Norway", ellers vis `CAA ({value_id})` som fallback (i stedet for `fixedLabel` som blir feil etter bytte).

Konkret endring i `EccairsTaxonomySelect.tsx` rundt linje 75 og 116:
```tsx
// Linje 75 — selected label
const isVL453 = valueListKey === 'VL453';
const selectedLabel = isVL453 && value === '2133'
  ? 'CAA Norway'
  : isVL453 && selectedItem
    ? `${selectedItem.value_description} (${selectedItem.value_id})`
    : (selectedItem?.value_description || (value ? `ID: ${value}` : placeholder));

// Linje 116 — list item label
{isVL453 && item.value_id === '2133'
  ? 'CAA Norway'
  : isVL453
    ? `${item.value_description} (${item.value_id})`
    : item.value_description}
```

Dette holder seg generelt — søkbart, og brukeren ser tydelig at 2133 er Norge.

**Del 3 — Forbedre søk i VL453**
I `useEccairsTaxonomy` (`src/hooks/useEccairsTaxonomy.ts`) gjøres ingen endringer; dagens server-side ILIKE-søk på `value_description`/`value_synonym` vil fortsatt finne "CAA". Fordi `value_synonym` allerede er value_id-en, vil søk på "2133" treffe Norge CAA direkte.

### Filer som endres
- `src/config/eccairsFields.ts` — legg til `fixedLabel: 'CAA Norway'` på felt 453
- `src/components/eccairs/EccairsTaxonomySelect.tsx` — spesialhåndtering når `valueListKey === 'VL453'`

### Resultat
- Default-verdien vises som **"CAA Norway"** i feltet "Ansvarlig enhet" (VL453).
- Dropdownen viser **"CAA Norway"** øverst for 2133 og **"CAA (2102)"**, **"CAA (2049)"** osv. for de andre, slik at brukeren faktisk kan skille dem.
- Alle 190+ CAA-entries beholder samme `value_id` til ECCAIRS — kun visningen endres.

