# Avdelingsfilter på loggfiler

Loggfil-listen låser i dag alle spørringer til brukerens egen avdeling (`company_id = min avdeling`). Derfor ser en administrator i morselskapet bare morselskapets logger, selv om databasereglene allerede tillater å se hele hierarkiet.

## Hva som endres

- **Administrator (og superadmin) i et morselskap** ser loggfiler fra egen avdeling og alle underavdelinger.
- **Vanlig bruker** ser kun sin egen avdelings logger — uendret.
- **Nytt filter «Avdeling»** vises kun når brukeren faktisk har flere avdelinger å velge mellom. Standardvalg: «Alle avdelinger».
- Avdelingsfilteret følger samme kryssavhengige logikk som de andre filtrene: velger man en avdeling, tilpasser drone-, pilot- og kildevalgene seg, og avdelingslisten viser kun avdelinger som faktisk har logger i gjeldende kombinasjon.
- Loggkortene viser avdelingsnavn når man ser på tvers av flere avdelinger.

## Teknisk

- `src/hooks/useFlightLogsList.ts`
  - Hent tillatte avdelings-ID-er: hvis `isAdmin` → RPC `get_user_visible_company_ids(user.id)`, ellers `[companyId]`. (Databasens SELECT-policy på `flight_logs` bruker allerede samme funksjon, så ingen migrasjon trengs.)
  - Bytt `eq("company_id", companyId)` i `applyFilters` til `in("company_id", allowedCompanyIds)`, pluss `eq("company_id", filters.companyId)` når et konkret valg er gjort.
  - Legg `companyId: "alle"` i `FlightLogFilters`/defaults og støtt `skip: "company"` i `applyFilters` slik at avdelingsvalgene skannes på samme måte som drone/pilot/kilde; slå opp navn i `companies (id, navn)`.
  - Utvid søket (`missions`-oppslaget) til å bruke `in("company_id", allowedCompanyIds)` i stedet for `eq`.
  - Beriking (`enrich`) henter avdelingsnavn til visning.
- `src/components/flightlogs/` — filterlinjen får en `Select` for avdeling (skjules når kun én avdeling er tilgjengelig), og loggkortet viser avdelingsbadge ved flere avdelinger.
- Nye i18n-nøkler i både `no.json` og `en.json`: avdeling / alle avdelinger.
