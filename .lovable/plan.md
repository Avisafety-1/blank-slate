

## Fix: NAIS kartlag viser ingen trafikk

### Problem
Edge-funksjonen bruker feil URL. OpenAPI-dokumentasjonen viser at base-URL-en er:
```
https://live.ais.barentswatch.no/live
```

Men edge-funksjonen kaller:
```
https://live.ais.barentswatch.no/v1/latest/combined
```

Den mangler `/live` i stien. Riktig URL er:
```
https://live.ais.barentswatch.no/live/v1/latest/combined
```

I tillegg: `POST /v1/latest/combined` bruker `LatestAisCombinedFilterInput`-skjemaet som forventer felter som `modelType`, `modelFormat`, og evt. `since` + `geometry`-filter. Nåværende body sender `downsample: false` som ikke er et gyldig felt for dette endepunktet.

### Endringer

#### `supabase/functions/barentswatch-ais/index.ts`

1. Endre alle 3 forekomster av URL fra:
   - `https://live.ais.barentswatch.no/v1/latest/combined`
   til:
   - `https://live.ais.barentswatch.no/live/v1/latest/combined`

2. Oppdater request body til å bruke riktige feltnavn i henhold til OpenAPI-spesifikasjonen:
```json
{
  "modelType": "Full",
  "modelFormat": "Geojson"
}
```
(fjern `downsample: false` som ikke er et gyldig felt for `/latest/combined`)

3. Legg til bedre logging av API-responsen for enklere feilsøking

### Filer som endres

| Fil | Endring |
|-----|---------|
| `supabase/functions/barentswatch-ais/index.ts` | Fix URL (legg til `/live`), rett request body |

