## Mål
Utvide FH2 API Debug-sandkassen slik at hvert kall også prøver DJI sin nye **Public Cloud API V2.0** (`/openapi/v2.0/...`), i tillegg til dagens `openapi-v1.0`, `openapi-v0.1` og `manage-v1.0`.

## Endringer

### 1. `supabase/functions/flighthub2-proxy/index.ts` (debug-endpoint action, ca. linje 873-877)
Legg til en ny variant øverst i listen, så `results` returnerer en `openapi-v2.0`-rad ved siden av de andre:

```ts
const variants = [
  { name: "openapi-v2.0", base: `${fh2BaseUrl}/openapi/v2.0/${cleanEndpoint}`, v: NEW_API },
  { name: "openapi-v1.0", base: `${fh2BaseUrl}/openapi/v1.0/${cleanEndpoint}`, v: NEW_API },
  { name: "openapi-v0.1", base: `${fh2BaseUrl}/openapi/v0.1/${cleanEndpoint}`, v: NEW_API },
  { name: "manage-v1.0",  base: `${fh2BaseUrl}/manage/api/v1.0/${cleanEndpoint}`, v: OLD_API },
];
```

Ingen andre handlinger (`list-projects`, `list-devices`, livestream, osv.) endres — kun debug-sandkassen.

### 2. `src/components/admin/FH2DevicesSection.tsx` (debug-dialogen)
- Oppdatere label-teksten fra `"Egendefinert endpoint (uten /openapi/v0.1/ prefiks)"` til `"Egendefinert endpoint (uten /openapi/vX/ prefiks – testes mot v2.0, v1.0, v0.1 og manage)"` slik at det er tydelig at v2.0 nå er med.
- Ingen nye knapper trengs; eksisterende hurtigknapper (System status, Org-enheter osv.) vil automatisk få v2.0-resultater i JSON-svaret siden proxyen alltid kjører alle varianter parallelt.

## Hva som ikke endres
- Ingen produksjons-endepunkter (oppdrag, ruter, annotasjoner, livestream) byttes til v2.0 ennå — kun debug-verktøyet får tilgang. Hvis v2.0 viser seg å fungere kan vi senere planlegge en faktisk migrering av relevante kall.
- Ingen DB-/RLS-endringer.

## Test
1. Åpne FH2 Devices → Debug-sandkasse.
2. Trykk «System status», «List prosjekter» osv. og verifiser at JSON-output nå inneholder en `openapi-v2.0`-blokk med URL `https://es-flight-api-eu.djigate.com/openapi/v2.0/...` og enten 200 eller 404.
3. Kjør et egendefinert endepunkt (f.eks. `wayline`) for å se hvordan v2.0 svarer.