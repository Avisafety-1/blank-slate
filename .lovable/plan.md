

## Erstatt 393/394 med 1065/1068 + rydd opp i payload

### Endringer

**`src/config/eccairsFields.ts`**
- Fjern felt 393 (Assessment) og 394 (Safety Recommendation) fra ECCAIRS_FIELDS
- Legg til felt 1065: label «Risikoklassifisering (intern)», entityPath `'53'`, format `'string_array'`, type `'text'`, group `'analysis'`, helpText «Maks 200 tegn»
- Legg til felt 1068: label «Risikovurdering»,  entityPath `'53'`, format `'text_content_array'`, type `'textarea'`, group `'analysis'`

**`supabase/functions/_shared/eccairsPayload.js`** (kun opprydding)
- Fjern `'393': '14'` og `'394': '14'` fra ENTITY_PATH_OVERRIDES
- Legg til en SKIP_ATTRIBUTES-liste med `'216'`, `'393'`, `'394'` som filtreres bort i `buildSelections` — dette hindrer gamle DB-rader fra å bli sendt til E2

### Filer som endres
- `src/config/eccairsFields.ts`
- `supabase/functions/_shared/eccairsPayload.js`

