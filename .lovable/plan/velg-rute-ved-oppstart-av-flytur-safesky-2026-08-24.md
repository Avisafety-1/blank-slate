# Velg rute ved oppstart av flytur (SafeSky)

Oppdrag kan nå ha flere ruter. I «Start flytur»-dialogen skal oppdrag med flere ruter listes én gang per rute, slik at piloten velger hvilken rute som publiseres som SafeSky advisory.

## Slik blir det

- Oppdrag med 0 eller 1 rute: vises som i dag, én linje.
- Oppdrag med flere ruter: én linje per rute — «Oppdragsnavn – Rute 1», «Oppdragsnavn – Rute 2» osv., med sted og antall punkter/km på linjen, og fargeprikk som matcher rutefargen i kartet.
- Valgt linje vises i knappen med rutenavnet, så det er tydelig hvilken rute som publiseres.
- Advarselen «for få punkter» gjelder den valgte ruten (SafeSky krever minst 3 punkter). Ruter med færre enn 3 punkter listes fortsatt, men gir samme feilmelding ved advisory-publisering som i dag.
- Arealsjekkene (50 km² bekreftelse, 150 km² sperre) regnes ut fra den valgte ruten.
- Live UAV / «Ingen»-modus påvirkes ikke av rutevalget utover at valgt rute lagres på flyturen.

## Teknisk

**`src/components/StartFlightDialog.tsx`**
- Bygg listen fra `segmentsFromRouteData(mission.route)` (`src/lib/routeSegments.ts`). Ett `CommandItem` per (oppdrag, rute) med `value` som inkluderer tittel, sted og «rute N» for søk.
- Ny state `selectedRouteId: string | null` ved siden av `selectedMissionId`; velges samtidig i `onSelect`. Oppdrag uten ruter gir `routeId = null`.
- `publish_advisory`-invokasjonene (både forhåndssjekk og `forcePublish`) sender med `routeId`.
- `onStartFlight`-signaturen utvides med `routeId?: string | null` (siste parameter, bakoverkompatibelt).

**`supabase/functions/safesky-advisory/index.ts`**
- `publish_advisory` / `refresh_advisory` leser valgfri `routeId` fra body. Finn ruten i `mission.route.routes` etter id; faller tilbake til `mission.route.coordinates` når `routeId` mangler eller ikke finnes (eldre oppdrag).
- Polygon, areal, SORA-høyder og terrengoppslag bruker den valgte rutens koordinater.
- Advisory-id-en blir `AVS_<missionId første 8>` som i dag når det bare er én rute; med valgt rute legges en kort rute-suffiks til, slik at ulike ruter i samme oppdrag ikke overskriver hverandre i SafeSky.

**`src/hooks/useFlightTimer.ts`**
- `startFlight` tar imot `routeId` og lagrer bare den valgte ruten i `active_flights.route_data` (som `RouteData` med `coordinates` = valgt rute og `routes` = [valgt rute], slik at eksisterende lesere fungerer).

**`src/pages/Index.tsx`**
- `confirmStartFlight` sender `routeId` videre til `startFlight`.

**`supabase/functions/safesky-cron-refresh/index.ts`**
- Bruk `flight.route_data` når den finnes (den inneholder allerede den valgte ruten), og fall tilbake til `mission.route` som i dag. Da refreshes riktig rute.

**i18n**: nye nøkler i `no.json` + `en.json` for rute-etiketten i listen (gjenbruker `routeN` der det passer).
