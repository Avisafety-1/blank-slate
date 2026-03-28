

## Fix: Sanitere ArduPilot-data før flight_logs insert

### Problem
ArduPilot-data går allerede gjennom **nøyaktig samme insert-logikk** som DJI (linje 1622-1630 i `UploadDroneLogDialog.tsx`). Problemet er at edge function returnerer verdier som er ugyldige for databasen — f.eks. `NaN`, `Infinity`, eller sentinel-verdier som `999`/`-999` som lekker gjennom `buildExtendedFields`.

### Rot-årsak i edge function
I `process-ardupilot/index.ts` settes f.eks.:
- `minVoltage` starter som `999` og sjekkes med `< 999`, men kan lekke
- `maxBatteryTemp` kan bli `-999` via dual-battery worst-case i frontend
- `durationMinutes` kan bli `NaN` hvis ingen GPS-data
- Diverse felter kan bli `Infinity` fra beregninger

### Løsning
**Én endring i `supabase/functions/process-ardupilot/index.ts`**: Legg til en sanitizer-funksjon som rydder hele returverdien før den sendes til frontend. Denne konverterer:
- `NaN` → `null`
- `Infinity` → `null`  
- `-Infinity` → `null`

Pluss eksplisitt sikre at alle numeriske felter som sendes er enten gyldige tall eller `null`.

### Filer som endres

| Fil | Endring |
|-----|---------|
| `supabase/functions/process-ardupilot/index.ts` | Legg til `sanitize()`-funksjon som kjøres på hele resultatet før `return`. Sikre at `durationMinutes` aldri er `NaN`, at `minVoltage`/`maxBatteryTemp` sentinel-verdier erstattes med `null`. |

### Konkret
```typescript
function sanitizeValue(v: any): any {
  if (typeof v === 'number' && (!Number.isFinite(v))) return null;
  return v;
}
```

Kjøres rekursivt på hele result-objektet. I tillegg: sikre at `totalTimeSeconds` og `durationMinutes` har fallback til `0` (ikke `NaN`).

