

## Analyse av test-resultatene

Resultatene er klare:

| Endepunkt | Status | Resultat |
|-----------|--------|----------|
| `/device` (org-liste) | 200 | `data.list: null` — tom |
| `/device/hms` | 200 | `data.list: null` — tom |
| `/device/{sn}/state` | **403** | **Forbidden** |

### Konklusjon

API-nøkkelen (X-User-Token) har **ikke rettigheter til å se enheter på organisasjonsnivå**. Den kan liste prosjekter, men ikke enheter. `device_state` bekrefter dette med eksplisitt 403.

### Hva koden allerede gjør

`list-devices` har faktisk en **prosjekt-fallback** som itererer over alle 14 prosjekter og kaller `/openapi/v0.1/project/device` med `X-Project-Uuid`-header for hvert prosjekt. Men test-device-api tester **ikke** dette endepunktet — den tester bare org-nivået.

### Plan: Test prosjekt-nivå device-endepunkt

**1. Utvide `test-device-api` med et fjerde kall**

Legge til test av `/openapi/v0.1/project/device` med `X-Project-Uuid` satt til det første prosjektet fra prosjektlisten. Dette tester om nøkkelen har device-tilgang *per prosjekt* selv om den ikke har det på org-nivå.

Steg:
- Hente prosjektliste (som allerede virker)
- Ta første prosjekt sin UUID
- Kalle `GET /openapi/v0.1/project/device` med `X-Project-Uuid: {uuid}`
- Returnere rå-responsen

**2. Oppdatere UI**

Vise det fjerde resultatet i test-panelet. Ingen andre endringer.

### Teknisk

- Fil: `supabase/functions/flighthub2-proxy/index.ts` — utvide `test-device-api` action
- Fil: `src/components/admin/FH2DevicesSection.tsx` — ingen endring nødvendig (viser allerede hele `results`-objektet)

### Mulige utfall

- Hvis prosjekt-device returnerer data: Problemet er at org-nivå ikke har tilgang, men prosjekt-nivå fungerer. Da bør `list-devices`-fallbacken allerede fungere — og vi trenger bare å finne hvorfor den ikke gjør det.
- Hvis prosjekt-device også returnerer null: Nøkkelen mangler device-rettigheter helt. Da må Tensio oppdatere API-nøkkelen/brukerrettighetene i DJI FlightHub 2.

