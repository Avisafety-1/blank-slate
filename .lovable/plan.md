

## Filter VL391 til kun RPAS-relevante verdier (1000000-serien)

### Problem
VL391 (Risikoklassifisering) viser alle verdier i dropdown, men kun verdier i 1000000-serien er relevante for RPAS/drone-operasjoner.

### Løsning
Legg til en valgfri `valueIdPrefix`-prop på `EccairsTaxonomySelect` og `useEccairsTaxonomy`-hooken. For VL391 settes denne til `"1"` slik at kun value_id-er som starter med "1" (1000000-serien) returneres fra databasen.

### Endringer

**`src/hooks/useEccairsTaxonomy.ts`**
- Legg til valgfri `valueIdPrefix`-parameter i `useEccairsTaxonomy`
- Når satt, legg til `&value_id=like.{prefix}*` i URL-en for server-side filtrering

**`src/components/eccairs/EccairsTaxonomySelect.tsx`**
- Legg til valgfri `valueIdPrefix`-prop i interface og send videre til hooken

**`src/config/eccairsFields.ts`**
- Legg til valgfri `valueIdPrefix`-egenskap på `EccairsFieldConfig`-interfacet
- Sett `valueIdPrefix: '1'` på felt 391

**`src/components/eccairs/EccairsMappingDialog.tsx`**
- Send `valueIdPrefix` fra feltkonfigurasjonen videre til `EccairsTaxonomySelect`

