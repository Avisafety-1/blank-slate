

# Legg til helsesjekk for DroneLog API

## Problem
Vi kan ikke teste om DroneLog API-nøkkelen fungerer uten å laste opp en faktisk DJI-flylogg. Vi trenger en enkel helsesjekk.

## Losning
Legge til stotte for GET-foresporsler i `process-dronelog`-funksjonen som en helsesjekk. Denne kaller DroneLog sitt `GET /api/v1/fields`-endepunkt for a verifisere at API-nokkelen er gyldig og API-et svarer.

### Endring i `supabase/functions/process-dronelog/index.ts`

Legg til en GET-handler for linje 12 (etter OPTIONS-sjekken):

```text
Hvis req.method === "GET":
  1. Hent DRONELOG_AVISAFE_KEY fra secrets
  2. Kall GET https://dronelogapi.com/api/v1/fields med Bearer-token
  3. Returner { ok: true, fields: [...] } ved suksess
  4. Returner { ok: false, error: "..." } ved feil
```

Ingen auth-sjekk pa GET (helsesjekk), slik at vi kan teste direkte med curl-verktøyet.

### Fil som endres

| Fil | Endring |
|---|---|
| `supabase/functions/process-dronelog/index.ts` | Legg til GET-handler for helsesjekk mot DroneLog API |

Etter implementering kjorer vi helsesjekken umiddelbart for a verifisere at API-nokkelen fungerer.
