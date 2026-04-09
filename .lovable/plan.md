

## Fiks FlightHub 2 autorisasjon -- legg til X-Project-Uuid fra JWT

### Rotårsak
DJI-dokumentasjonen sier eksplisitt:
> "FlightHub 2 will authorize based on the provided `X-User-Token` **and** `X-Project-Uuid`."

JWT-tokenet inneholder `project_uuid`, men vi sender det ikke som header. Uten `X-Project-Uuid` returnerer DJI `200401 Unauthorized`.

### Løsning

**Edge function (`flighthub2-proxy/index.ts`)**:

1. Etter at `fh2Token` er hentet, dekod JWT-payload og ekstraher `project_uuid` og `organization_uuid`
2. Hvis `X-Project-Uuid` ikke er satt av klienten, bruk `project_uuid` fra JWT automatisk
3. Logg hvilke verdier som brukes for debugging

```text
Endring i commonHeaders-oppsettet:
- Dekod JWT (del 2, base64)
- Sett commonHeaders["X-Project-Uuid"] = jwt.project_uuid (hvis ikke allerede satt)
- Logg: "Using project_uuid from JWT: <uuid>"
```

4. For `list-projects` spesifikt: prøv først UTEN `X-Project-Uuid`, og hvis det feiler med 401, prøv på nytt MED `X-Project-Uuid` fra JWT

**Admin UI (`ChildCompaniesSection.tsx`)**:
- Vis `organization_uuid` og `project_uuid` fra JWT-diagnostikken i testresultatet
- Vis at begge verdier ble funnet og brukt

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- ekstraher project_uuid fra JWT, send som header
2. `src/components/admin/ChildCompaniesSection.tsx` -- vis org/prosjekt-UUID fra JWT i test

