

## Fix Attributt 215 og fjern 216

### Endringer

**`src/config/eccairsFields.ts`**
- Felt 215: Sett `defaultValue: '1799998'`, oppdater helpText til å nevne «Norway → Other» som standard
- Fjern felt 216 (Operatørnavn) helt fra ECCAIRS_FIELDS-arrayet

**`supabase/functions/_shared/eccairsPayload.js`**
- Sjekk om det finnes spesialbehandling av felt 216 som må fjernes

### Filer som endres
- `src/config/eccairsFields.ts`
- `supabase/functions/_shared/eccairsPayload.js` (hvis relevant)

