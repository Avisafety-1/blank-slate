# Marker historiske oppdrag uten værsnapshot

## Bakgrunn
Tanken er at vær låses på fullføringstidspunktet for historisk analyse. Men eksisterende oppdrag i DB har `weather_data_snapshot = null` av tre grunner:

1. Snapshot-logikken trigger kun ved status-overgang til "Fullført" — flylogg-oppdrag som ble opprettet rett i Fullført hoppet over den.
2. Oppdrag fullført før snapshot-feltet ble innført fikk aldri muligheten.
3. Gammel logikk krevde koordinater for å skrive noe — mangler de, ble feltet `null` (ikke engang en "ikke tilgjengelig"-markør).

`drone-weather` edge-funksjonen returnerer kun nåtidsvær, så vi **kan ikke** hente faktisk historisk vær i ettertid. Det eneste ærlige svaret er å markere disse oppdragene som "Historisk værdata ikke tilgjengelig" og **stoppe live-henting** på dem.

## Endring 1: UI-guard (umiddelbar effekt, dekker også fremtidige edge-caser)
I `MissionCard.tsx:597–601` og `MissionDetailDialog.tsx:316–320` — bytt ut:

```ts
savedWeatherData={isCompleted && hasWeatherSnapshot ? hasWeatherSnapshot : undefined}
```

med en guard som syntetiserer en `unavailable: true`-stub når oppdraget er fullført, mangler snapshot, og er > 24t gammelt:

```ts
const isHistoricalNoSnapshot =
  isCompleted &&
  !hasWeatherSnapshot &&
  mission.tidspunkt &&
  (Date.now() - new Date(mission.tidspunkt).getTime()) > 24 * 60 * 60 * 1000;

const effectiveSavedWeather =
  hasWeatherSnapshot
    ? hasWeatherSnapshot
    : isHistoricalNoSnapshot
      ? { unavailable: true, reason: 'historical', captured_at: new Date().toISOString() }
      : undefined;
```

Sendes til `<DroneWeatherPanel savedWeatherData={effectiveSavedWeather} />`. Panelet (`DroneWeatherPanel.tsx:246–254`) viser allerede "Værdata ikke tilgjengelig for historiske oppdrag" og hopper over fetch når `savedWeatherData.unavailable === true`.

**Effekt:** Ingen flere live `drone-weather`-kall for historiske oppdrag — uten å vente på DB-backfill.

## Endring 2: Engangs backfill-migrasjon (rydder DB-data)
For at PDF-eksport, AI-risikovurdering og andre systemer skal se samme markør, sett feltet på alle gamle Fullført-rader:

```sql
UPDATE public.missions
SET weather_data_snapshot = jsonb_build_object(
  'captured_at', now(),
  'unavailable', true,
  'reason', 'historical',
  'source', 'backfill_2026_06'
)
WHERE status = 'Fullført'
  AND weather_data_snapshot IS NULL
  AND tidspunkt < now() - interval '24 hours';
```

Trygt: rører kun rader som allerede er > 24t gamle og mangler snapshot. Overskriver ikke faktiske værdata.

## Verifisering
1. Last inn oppdragslisten på nytt → ingen `drone-weather`-requests i Network for gamle oppdrag.
2. Åpne et eksisterende fullført oppdrag fra forrige uke → panelet viser "Værdata ikke tilgjengelig for historiske oppdrag".
3. Åpne et fullført oppdrag fra siste time uten snapshot → live vær hentes som før (det er ikke "historisk" ennå).
4. Et nylig opprettet flylogg-oppdrag (> 24t) → har `unavailable: true, reason: 'historical', source: 'flight_log_import'` (fra forrige fiks).
5. Spørring i Supabase: `SELECT count(*) FROM missions WHERE status='Fullført' AND weather_data_snapshot IS NULL AND tidspunkt < now() - interval '24 hours'` → 0 etter backfill.

## Senere mulighet (ikke i denne planen)
Hvis ekte historisk vær er ønskelig, må vi bytte vær-kilde til en som støtter historiske oppslag (f.eks. MET Frost API eller OpenWeather History API). Da kan vi backfille `unavailable: true`-radene med faktisk data. Krever ny edge-funksjon + sannsynligvis betaltlisens — separat oppgave.
