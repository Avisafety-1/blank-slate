

## Redusere databasebelastning fra cron-jobber

### Rotårsak

Cron-jobbene fra databasen viser tydelig problemet:

| Jobb | Frekvens | Kall/min |
|------|----------|----------|
| `safesky-beacons-norway` (jobid 7) | **1 sekund** | **60** |
| `safesky-cron-refresh` (jobid 2) | **5 sekunder** | **12** |
| Alle andre | 15 min eller sjeldnere | ~0 |

Det betyr **72 edge function-kall per minutt** bare fra disse to. Selv om `safesky-beacons-fetch` har "skip if no active viewers"-logikk, krever hvert kall fortsatt en DB-spørring mot `map_viewer_heartbeats` + `active_flights` for å sjekke dette.

I tillegg sender klienten heartbeat hvert 30. sekund fra **alle innloggede brukere** (ikke bare de som ser kartet), via `useAppHeartbeat`. Så beacons-fetch vil aldri skippe.

### Plan

#### 1. Endre cron-frekvenser (SQL via Supabase insert-tool)

| Jobb | Nå | Ny frekvens | Begrunnelse |
|------|-----|-------------|-------------|
| `safesky-beacons-norway` | 1s | **10s** (`*/10 * * * * *`) | Beacons lever 30s i DB, 10s gir 3 oppdateringer per beacon-levetid -- mer enn nok |
| `safesky-cron-refresh` | 5s | **15s** (`*/15 * * * * *`) | Advisory-data endres sjelden, 15s er fortsatt nær-sanntid |

Dette reduserer fra **72 → 10 kall/min** (85% reduksjon).

SQL som kjøres via Supabase insert-tool (ikke migrasjon):
```sql
SELECT cron.unschedule('safesky-beacons-norway');
SELECT cron.schedule(
  'safesky-beacons-norway',
  '*/10 * * * *',
  $$ SELECT net.http_post(...) $$
);
-- tilsvarende for safesky-cron-refresh med */15
```

#### 2. Heartbeat kun fra kartside (kodeendring)

Flytt `useAppHeartbeat()` fra global app-nivå til kun `Kart.tsx`. Slik at beacons-fetch faktisk skipper når ingen ser kartet.

**Fil:** `src/hooks/useAppHeartbeat.ts` -- ingen endring
**Fil:** `src/App.tsx` -- fjern `useAppHeartbeat()`-kallet
**Fil:** `src/pages/Kart.tsx` -- legg til `useAppHeartbeat()`

#### 3. Øk BEACON_MAX_AGE i edge function

I `safesky-beacons-fetch/index.ts`, øk `BEACON_MAX_AGE_MS` fra 30s til 60s slik at beacons overlever mellom 10s-intervallene uten å bli slettet for tidlig.

#### 4. Spre daglige jobber

Tre jobber kjører alle kl 03:00 og tre kl 07:00:
- `dji-auto-sync-daily`: 0 3 → **0 2**
- `sync-openaip-airspaces-daily`: 0 3 → **0 3** (beholdes)
- `sync-openaip-obstacles-daily`: 10 3 → **30 3** (allerede spredt, OK)
- `check-document-expiry-daily`: 0 7 → **0 7**
- `check-competency-expiry-daily`: 0 7 → **10 7**
- `check-maintenance-expiry-daily`: 0 7 → **20 7**

### Resultat

- **72 → 10 cron-kall/min** for SafeSky
- Heartbeat-trafikk eliminert når ingen er på kartsiden
- Daglige jobber spredd for å unngå samtidige spikes
- Ingen funksjonalitetstap -- beacons oppdateres hvert 10s, advisory hvert 15s

### Filer som endres
1. `src/App.tsx` -- fjern `useAppHeartbeat()`
2. `src/pages/Kart.tsx` -- legg til `useAppHeartbeat()`
3. `supabase/functions/safesky-beacons-fetch/index.ts` -- `BEACON_MAX_AGE_MS = 60000`
4. Cron-jobber oppdateres via Supabase SQL (ikke migrasjon)

