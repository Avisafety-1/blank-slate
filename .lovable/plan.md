## Mål

Sørge for at alle selskaper får sine **nyeste** DJI-logger inn først, slik at en nattlig kjøring rekker å hente det siste døgnets data for alle — selv om enkelte selskaper har stor backlog.

## Problem i dag

`claim_dji_sync_jobs` plukker `ORDER BY scheduled_at ASC` (eldste først), uten fairness mellom selskaper. Ett selskap med 256 gamle jobber blokkerer derfor at andre selskaper får sine nye logger inn.

## Endringer

### 1. Oppdater `claim_dji_sync_jobs` (SQL function)

Bytt plukkelogikk til:
- **Nyeste først** innenfor hvert selskap (`ORDER BY created_at DESC` for `queued`, eldste først for `in_progress`-rescue).
- **Round-robin per selskap** via `ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at DESC)` slik at en enkelt claim aldri tar mer enn N jobber fra samme selskap.

Konkret:

```sql
WITH ranked AS (
  SELECT id, company_id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at DESC) AS rn
  FROM dji_sync_jobs
  WHERE attempts < 5
    AND ((status = 'queued' AND scheduled_at <= now())
      OR (status = 'in_progress' AND locked_until < now()))
),
picked AS (
  SELECT id FROM ranked
  WHERE rn <= 1                  -- maks 1 jobb per selskap per claim
  ORDER BY rn, random()          -- spred utvalget mellom selskaper
  FOR UPDATE SKIP LOCKED
  LIMIT GREATEST(_limit, 1)
)
UPDATE dji_sync_jobs ...
```

Effekt: Hver worker-kall plukker maks 1 jobb per selskap, og alltid den **nyeste** ventende jobben. Med boost-cron (5 parallelle workers × 2 jobber hver / minutt) tømmes nyeste lag på tvers av selskaper først.

### 2. Ingen endring i edge functions eller frontend

`dji-sync-worker` kaller `claim_dji_sync_jobs(_limit := 2)` som før — bare prioriteringen i SQL-funksjonen endres.

## Spørsmål før implementering

- Boost-cron (hvert minutt, 5 parallelle) skal stå urørt — kun prioritetslogikken endres. OK?
- Maks 1 jobb per selskap per worker-kall er foreslått. Vil du heller ha 2 (matcher dagens `_limit=2`)? Med 1 får du raskere round-robin, med 2 høyere throughput per selskap.
