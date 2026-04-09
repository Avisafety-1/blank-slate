

## Fiks FlightHub 2 ruteopplasting -- logging og finish-upload payload

### Analyse

Loggene viser:
- OSS-opplasting: **status 200** (suksess)
- `finish-upload`-kallet: **ingen logging** -- vi vet ikke hva DJI returnerer
- Skjermbildet viser "Route (0)" i FlightHub 2, altså ble ruten aldri registrert

**Rotårsak**: `finish-upload` (linje 509-514) sender bare `{ name, object_key }` uten å logge respons. DJI-APIet krever sannsynligvis flere felter i payloaden. Basert på DJI WPML-spesifikasjonen og andre integrasjoner krever `finish-upload` trolig:
- `object_key` -- stien til KMZ-filen i S3
- `name` -- rutens navn  
- Muligens `drone_model_key` eller lignende

Dessuten logger vi ikke `finish-upload`-responsen, så vi er blinde for hva som skjer.

### Plan

**1. Edge function (`flighthub2-proxy/index.ts`) -- legg til grundig logging av finish-upload**

Endre linje 504-517:
- Logg URL, headers (uten token), og body som sendes til `finish-upload`
- Logg fullstendig respons (status, headers, body) fra DJI
- Logg også om `finishRes.ok` er false

Dette lar oss se **nøyaktig** hva DJI returnerer og tilpasse payloaden deretter.

**2. Prøv utvidede felter i finish-upload payload**

Basert på DJI-dokumentasjon og vanlige mønstre, utvid payloaden med:
```json
{
  "name": "Avisafe Route",
  "object_key": "...",
  "drone_model_key": "0-68-0"
}
```
`drone_model_key` brukes ofte i DJI Cloud API for å identifisere drone-typen. Verdien `0-68-0` tilsvarer Matrice 300 (enum 68 som allerede brukes i KML-en).

**3. Klient-side feilhåndtering (`FlightHub2SendDialog.tsx`)**

Forbedre feilmeldingen ved ruteopplasting: vis DJI sin feilmelding (`data?.message`) mer detaljert i toast-en slik at brukeren ser hva som gikk galt.

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- logging + utvidet finish-upload payload
2. `src/components/FlightHub2SendDialog.tsx` -- bedre feilvisning

