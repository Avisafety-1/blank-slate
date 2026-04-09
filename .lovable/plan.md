

## Fiks FlightHub 2 "Unauthorized" -- fjern X-Project-Uuid fra list-projects

### Rotårsak funnet

Problemet er at vi sender `X-Project-Uuid`-headeren på **alle** API-kall, inkludert `list-projects` og `test-connection`. Dette skjer fordi koden på linje 185-189 dekoder JWT-tokenet og setter `X-Project-Uuid` som en global header i `commonHeaders` FØR den sjekker hvilken action som skal utføres.

Fra DJI-dokumentasjonen:
> "FlightHub 2 will authorize based on the provided `X-User-Token` **and** `X-Project-Uuid`."

Når `X-Project-Uuid` sendes, prøver DJI å autorisere brukeren mot det spesifikke prosjektet. Hvis nøkkelen ikke har tilgang til akkurat det prosjektet (eller verdien er ugyldig), returneres `200401 Unauthorized` -- selv for endepunkter som `list-projects` som egentlig bare trenger org-nøkkelen.

Dokumentasjonen sier tydelig at `X-Project-Uuid` skal hentes FRA `list-projects`-responsens `data.list.uuid`, altså ETTER at du har listet prosjektene. Det er en catch-22 å sende den på selve list-kallet.

### Løsning

**Edge function (`flighthub2-proxy/index.ts`)**:

1. Flytt `X-Project-Uuid` ut av `commonHeaders` -- sett den IKKE som default
2. For `list-projects` og `test-connection` (project-sjekk): send UTEN `X-Project-Uuid`
3. For `upload-route`, `create-annotation`, `get-sts-token`: send MED `X-Project-Uuid` (klient-valgt fra prosjektlisten, eller JWT-fallback)
4. Legg til en `projectHeaders`-funksjon som returnerer `commonHeaders` med `X-Project-Uuid` kun når det trengs

```text
Konkret endring:
- Fjern linje 186-189 (automatisk X-Project-Uuid i commonHeaders)
- I upload-route/create-annotation/get-sts-token: bruk { ...commonHeaders, "X-Project-Uuid": effectiveProjectUuid }
- list-projects og test-connection: bruk commonHeaders uten X-Project-Uuid
```

### Filer som endres
1. `supabase/functions/flighthub2-proxy/index.ts` -- flytt X-Project-Uuid fra global til per-action

### Ingen endringer i UI
Klientkoden sender allerede `projectUuid` som parameter for de actionene som trenger det. Denne endringen sørger bare for at headeren ikke "lekker" til kall som ikke skal ha den.

