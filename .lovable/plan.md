

## Fix: NAIS returnerer 0 skip

### Problem
1. URL-en har feil sti: `/live/v1/latest/combined` skal være `/v1/latest/combined` (subdomenet er allerede `live.ais.barentswatch.no`)
2. Vi logger ikke rå array-lengden, så vi kan ikke se om APIet gir 0 eller om filteret fjerner alt
3. `modelType`/`modelFormat` sendes i body, men ifølge docs skal de sendes som **query-parametre** for `/v1/latest/combined`

### BarentsWatch API-eksempel fra docs
```bash
curl --location --request POST \
  'https://live.ais.barentswatch.no/v1/latest/combined' \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data-raw '{ "shipTypes": [30] }'
```

Respons-felt: `latitude`, `longitude`, `courseOverGround`, `speedOverGround`, `trueHeading`, `name`, `shipType`, `mmsi`, `destination`

### Endringer i `supabase/functions/barentswatch-ais/index.ts`

1. **Fix URL**: Endre fra `/live/v1/latest/combined` tilbake til `/v1/latest/combined`
2. **Flytt modelType/modelFormat til query-params**: `?modelType=Full&modelFormat=Geojson`
3. **Legg til rå-lengde logging**: `console.log("Raw count:", Array.isArray(data) ? data.length : data?.features?.length)`
4. **Logg bounds**: Print mottatte bounds for feilsøking
5. Gjør samme endring for retry-blokken

### Filer som endres

| Fil | Endring |
|-----|---------|
| `supabase/functions/barentswatch-ais/index.ts` | Fix URL, flytt params, bedre logging |

