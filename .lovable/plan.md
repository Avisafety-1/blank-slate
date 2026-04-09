

## Prøv begge DJI API-variantene (gammel + ny)

### Rotårsak

Det finnes to separate DJI FlightHub API-er som bruker SAMME organisasjonsnøkkel men med forskjellig header-navn og URL-sti:

| | Gammel (FlightHub Sync) | Ny (OpenAPI V1.0) |
|---|---|---|
| Prosjektliste | `/manage/api/v1.0/projects` | `/openapi/v0.1/project` |
| Header-navn | `X-Organization-Key` | `X-User-Token` |
| Status | Produksjon | "Developing" |

Vi har kun prøvd den nye. Den gamle API-en kan fungere med nøyaktig samme nøkkel -- bare med annet header-navn og URL-sti.

### Plan

**Edge function (`flighthub2-proxy/index.ts`)**:

1. **test-connection**: Prøv den nye API-en først (`/openapi/v0.1/project` + `X-User-Token`). Hvis 401, prøv den gamle (`/manage/api/v1.0/projects` + `X-Organization-Key`). Rapporter hvilken som fungerte.
2. **list-projects**: Samme logikk -- prøv ny først, fall tilbake til gammel.
3. Lagre hvilken API-versjon som fungerte i responsen slik at andre actions kan bruke riktig variant.
4. **upload-route / create-annotation / get-sts-token**: Bruk gammel API-sti (`/manage/api/v1.0/...`) med `X-Organization-Key` som fallback hvis den nye feiler.

```text
Konkret:
- Ny: GET /openapi/v0.1/project  + header X-User-Token: <key>
- Gammel: GET /manage/api/v1.0/projects  + header X-Organization-Key: <key>
- Begge mot samme base URL (es-flight-api-us.djigate.com)
```

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- legg til fallback til gammel API

