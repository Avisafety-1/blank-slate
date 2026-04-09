

## Fiks FlightHub 2 "Unauthorized" -- forbedret diagnostikk og header-opprydding

### Analyse av loggene

Loggene viser:
- JWT inneholder: `account`, `exp`, `nbf`, `organization_uuid`, `project_uuid`, `sub`, `user_id`
- `project_uuid` er **tom streng** (dette er normalt for en org-nøkkel)
- `organization_uuid`: `4593f426-e454-4ba5-8246-92b109bb0a12` (funnet OK)
- To forskjellige nøkler testet -- begge gir `200401 Unauthorized`
- `system_status` fungerer (server OK), men `list-projects` feiler

### Mulige årsaker

1. **`Content-Type: application/json` sendes på GET-forespørsler**: DJI-dokumentasjonen viser ingen Content-Type for GET-kall. Noen API-gatewayer avviser GET med Content-Type-header. Vi sender dette unødvendig.

2. **JWT `organization_uuid` vises ikke i diagnostikken**: Koden sjekker `org_id`, `oid`, `org` -- men JWT-et bruker `organization_uuid`. Derfor viser admin-panelet `Org: ukjent` selv om verdien finnes.

3. **Manglende synlighet i `account`-feltet**: JWT har et `account`-felt vi ikke viser. Dette kan inneholde viktig info om brukertype eller kontonivå.

### Plan

**1. Edge function (`flighthub2-proxy/index.ts`)**:
- Fjern `Content-Type: application/json` fra `commonHeaders` -- legg det kun til for POST/PUT-kall
- Vis HELE JWT-payloaden (alle felter) i diagnostikken, ikke bare utvalgte felter
- Inkluder `organization_uuid` eksplisitt i `jwt_info`
- Logg full JWT payload (uten selve tokenet) for debugging

**2. Admin UI (`ChildCompaniesSection.tsx`)**:
- Vis alle JWT-felter i testresultatet (organisation_uuid, account, user_id, sub)
- Vis tydelig feilmelding med forslag: "Brukeren bak nøkkelen mangler kanskje prosjekttilgang i FlightHub 2"

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- fjern Content-Type fra GET, vis full JWT
2. `src/components/admin/ChildCompaniesSection.tsx` -- vis alle JWT-diagnostikkfelter

