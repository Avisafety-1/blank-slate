
Mål: gjøre SafeSky til førsteprioritet på /kart, slik at lufttrafikk vises raskt og stabilt selv når cache-tabellen er tom ved oppstart.

Hva jeg fant
- `OpenAIPMap.tsx` starter mange tunge kartkall først (`fetchNsmData`, `fetchRpasData`, `fetchAipRestrictionZones`, osv.), og SafeSky startes senere med ekstra `setTimeout(..., 500)`.
- `mapSafeSky.ts` leser bare fra `public.safesky_beacons`. Den kan ikke selv “varme opp” data hvis tabellen er tom.
- `safesky-beacons-fetch` fyller tabellen bare når det finnes aktiv `map_viewer_heartbeats` eller aktive DroneTag-flyvninger.
- DB-sjekk viste at `safesky_beacons` var tom da problemet oppstod, og noen sekunder senere ble den fylt igjen. Det betyr at dagens løsning er avhengig av forsinket backend-oppvarming, ikke umiddelbar kartlasting.

Plan
1. Prioriter SafeSky i kart-init
- Flytt heartbeat + SafeSky-start helt opp i `OpenAIPMap.tsx`, før øvrige kartdatasett lastes.
- Fjern den faste 500 ms forsinkelsen.
- Start øvrige lag etterpå, slik at SafeSky får første nettverks-/render-prioritet.

2. Legg inn aktiv “warm-up” av SafeSky-cache
- Utvid `mapSafeSky.ts` slik at første `start()`:
  - sikrer heartbeat først
  - triggere `safesky-beacons-fetch` eksplisitt via edge function
  - gjør noen korte oppstarts-retries hvis første databasekall fortsatt returnerer 0 beacons
- Dette gjør at kartet ikke må vente på at cron alene oppdager at noen ser på kartet.

3. Behold og bygge videre på robustheten som allerede er lagt inn
- Behold dagens guards mot Leaflet-feil, reconnect-logikk og session-refresh.
- Kombiner dette med “initial fast path” for første lasting.

4. Gjør SafeSky-tilstanden tydelig i UI
- Legg inn enkel SafeSky-status i kartet:
  - “Laster lufttrafikk…”
  - “Ingen lufttrafikk funnet akkurat nå”
  - eventuelt “Kunne ikke hente lufttrafikk”
- Dette gjør at blankt lag ikke ser ut som en feil.

5. Valgfri backend-opprydding etterpå
- Når on-demand warm-up er på plass, kan vi vurdere å redusere cron-frekvensen for `safesky-beacons-fetch` (den står nå ekstremt aggressivt) og bruke cron som fallback i stedet for primærmekanisme.
- Dette krever DB-migrasjon for pg_cron-jobben, men er ikke nødvendig for første fix.

Filer som bør endres
- `src/components/OpenAIPMap.tsx`
  - rekkefølge på init
  - heartbeat først
  - SafeSky-start før andre fetches
- `src/lib/mapSafeSky.ts`
  - on-demand warm-up via edge function
  - kort oppstarts-retry når cache er tom
  - enkel status/state for initial lasting
- Valgfritt: pg_cron-migrasjon
  - justere jobb for `safesky-beacons-fetch` senere

Tekniske detaljer
- Anbefalt init-sekvens:
```text
map created
-> sendHeartbeat()
-> safeSkyManager.start()
   -> invoke safesky-beacons-fetch
   -> immediate DB fetch
   -> short retry burst if empty
-> load other map layers
```
- Viktig at warm-up i `mapSafeSky.ts` er deduplisert, så vi ikke spammer edge function ved hvert toggle/re-render.
- Realtime-subscriptionen på `safesky_beacons` beholdes, slik at beacons dukker opp straks backend har fylt tabellen.

Forventet effekt
- SafeSky vises raskere ved åpning av kartet.
- Tom cache ved oppstart blir ikke lenger en “død periode”.
- Opplevelsen blir mer forutsigbar: SafeSky laster først, øvrige kartlag kommer etter.