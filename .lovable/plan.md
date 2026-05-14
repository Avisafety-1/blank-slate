## Hva som er galt

Edge-funksjonen `safesky-beacons-fetch` henter trafikken fra SafeSky Sandbox riktig (~115 beacons hvert 10. sekund), men hver upsert feiler:

```
ERROR Error upserting beacons: code 22008
date/time field value out of range: "1778740735"
```

Resultat: `safesky_beacons`-tabellen er tom (`select count(*) → 0`), så kartet har ingenting å vise.

Årsaken: SafeSky returnerer `last_update` som Unix epoch i sekunder (heltall), mens kolonnen `safesky_beacons.last_update` er `timestamptz`. Funksjonen sender tallet rett inn uten konvertering:

```ts
last_update: beacon.last_update || beacon.timestamp || null,
```

Postgres tolker "1778740735" som år 1778740735 → out of range, og hele upserten ruller tilbake.

## Fix

I `supabase/functions/safesky-beacons-fetch/index.ts`, normaliser `last_update` før upsert:

- Hvis tall og < 1e12 → epoch sekunder → `new Date(n * 1000).toISOString()`
- Hvis tall og ≥ 1e12 → epoch ms → `new Date(n).toISOString()`
- Hvis string som allerede er ISO → behold
- Ellers → `null`

Liten hjelpefunksjon `toIsoTimestamp(v)` brukt på `beacon.last_update || beacon.timestamp`.

Ingen DB-endringer, ingen RLS-endringer, ingen frontend-endringer.

## Verifisering

1. Vente på neste cron-tick (kjører hvert 10. sek når kartet er åpent).
2. Sjekke logger: `Upserted N beacons` i stedet for 22008-feil.
3. `select count(*) from safesky_beacons` → > 0.
4. Trafikkmarkører dukker opp på kartet i Norge-bbox.
