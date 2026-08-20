# Filtrering på /oppdrag skal gjelde alle oppdrag

## Problemet

Siden laster kun 10 oppdrag om gangen. Både nedtrekkslistene (kunde / pilot / drone) og selve filtreringen bygges i dag utelukkende på de oppdragene som allerede er lastet inn. Resultatet er at piloter, droner og kunder som kun finnes på oppdrag lenger ned i listen mangler i filteret — og velger du et filter, søkes det bare i de 10 første.

## Slik skal det bli

- Nedtrekkslistene viser **alle** kunder, piloter og droner som er tilknyttet minst ett oppdrag brukeren har tilgang til — uavhengig av hva som er lastet inn på siden.
- Når du velger et filter, hentes oppdragene på nytt fra databasen med filteret lagt inn i spørringen. Du får altså treff også på oppdrag som ikke var lastet.
- Filteret gjelder valgt fane (Pågående/kommende eller Fullført) og kombineres med søkefeltet.
- Fortsatt sidevis lasting: 10 om gangen, med «Last flere oppdrag»-knappen nederst når det finnes flere treff.
- Bytte av filter nullstiller listen til første side.
- Dronelisten viser modell + serienummer der flere droner deler modell, slik at filteret treffer riktig enhet.

## Teknisk

**Database**
- Ny SECURITY DEFINER-funksjon `get_mission_filter_options()` som returnerer distinkte kunder (id, navn), piloter (profile_id, full_name) og droner (id, modell, serienummer) på tvers av alle oppdrag i selskapene fra `get_user_visible_company_ids()`. Én spørring i stedet for tre klientkall, og den følger samme synlighetsregler som oppdragslisten.
- Ingen nye tabeller. Indekser på `mission_personnel.mission_id`/`profile_id` og `mission_drones.mission_id`/`drone_id` legges til hvis de mangler.

**`src/hooks/useOppdragData.ts`**
- Ny state `filters: { customerId, pilotId, droneId }` med setter som nullstiller paginering og henter side 0 på nytt.
- `fetchMissionsForTab` utvides:
  - kunde → `.eq('customer_id', customerId)`
  - pilot/drone → forhåndsoppslag av `mission_id` fra `mission_personnel` / `mission_drones`, deretter `.in('id', ids)` på hovedspørringen (kombineres med AND når begge er satt).
  - Paginering (`range`) beholdes uendret, så «Last flere» fungerer på det filtrerte settet.
- `searchMissions` får samme filterlogikk, så søk + filter virker sammen.
- Ny `filterOptions`-state fylt fra RPC-en ved oppstart og ved companyId-bytte, cachet i offline-cache på linje med oppdragene.
- Realtime-refresh henter samme filtersett som er aktivt.

**`src/pages/Oppdrag.tsx`**
- Fjerner klientsidens `uniqueCustomers/uniquePilots/uniqueDrones` og `filteredMissions`-filtrering — listene og filteret kommer nå fra hooken.
- `visibleCount`-baserte «Vis flere» erstattes av server-pagineringens `hasMoreData`/`loadMore`, slik at det bare finnes én «Last flere oppdrag»-knapp.
- Deep-link-logikken (som i dag kaller `loadMore` i loop for å finne et oppdrag) beholdes, men respekterer aktive filtre.

**`src/components/oppdrag/OppdragFilterBar.tsx`**
- Verdiene i nedtrekkene endres fra navnestrenger til id-er, med visningsnavn som label (drone: `modell (SN)` når nødvendig).
- Legger til «Nullstill filtre»-knapp når minst ett filter er aktivt.
- Alle nye tekster via `t()` med nøkler i både `no.json` og `en.json`.
