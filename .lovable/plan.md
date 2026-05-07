## Mål
Utvide `system-health-monitor` (kjører hvert 10. min via cron) med fire nye signaler i tillegg til dagens DB-feil, edge 5xx og auth-feil.

## Nye signaler

### 1. Latency (edge-funksjoner p95)
Query mot `function_edge_logs.metadata.execution_time_ms` siste 10 min, gruppert per `function_id`. Trigger varsel hvis p95 > terskel (default `edge_p95_ms = 10000` finnes allerede i `monitoring_config` men brukes ikke).

### 2. Rate-limit triggers (HTTP 429)
Tell svar med `response.status_code = 429` i `function_edge_logs` siste 10 min. Ny terskel: `rate_limit_per_10m` (default 20). Bryt ned per funksjon i e-posten.

### 3. Store mengder requests (volume spike)
Tell totale requests i `function_edge_logs` siste 10 min vs forrige 10-min-vindu. Trigger hvis nåværende volum > 3× forrige (eller > absolutt terskel `request_volume_per_10m`, default 5000). Top 5 funksjoner listes.

### 4. Feil per IP / User-Agent
Aggregér 4xx/5xx i `function_edge_logs` siste 10 min gruppert på `request.cf_connecting_ip` og `request.headers.user_agent`. Trigger hvis én IP eller én UA står for > `errors_per_ip_per_10m` (default 50) feil — typisk indikator på skanning, brute-force eller misbruk.

## Skjema-endring (`monitoring_config`)
Legg til kolonner med defaults:
- `rate_limit_per_10m INT DEFAULT 20`
- `request_volume_per_10m INT DEFAULT 5000`
- `request_volume_spike_factor NUMERIC DEFAULT 3.0`
- `errors_per_ip_per_10m INT DEFAULT 50`
- `latency_p95_alert_enabled BOOL DEFAULT true`

`edge_p95_ms` finnes allerede og gjenbrukes.

## Endringer i koden

**`supabase/functions/system-health-monitor/index.ts`**
- Fire nye `runAnalytics`-spørringer (Logflare BigQuery-syntaks)
- Fire nye `triggered`-blokker som bygger HTML-rapporter
- Per-type dedupe via eksisterende `alreadyAlerted` (60 min)
- Inkluder topp-5-tabeller i e-postene (per funksjon, per IP, per UA)

**`operations-digest`**: Utvid daglig digest med oppsummering av rate-limits/p95/topp IP-feil siste døgn.

## Tekniske detaljer

```text
Logflare-spørring eksempler:
  p95 latency:
    select m.function_id,
           approx_quantiles(m.execution_time_ms, 100)[offset(95)] as p95
    from function_edge_logs cross join unnest(metadata) as m
    where timestamp > timestamp_sub(current_timestamp(), interval 10 minute)
    group by m.function_id order by p95 desc

  Top errors per IP:
    select request.cf_connecting_ip as ip, count(*) as n
    from function_edge_logs
    cross join unnest(metadata) as m
    cross join unnest(m.request) as request
    cross join unnest(m.response) as response
    where response.status_code >= 400
      and timestamp > timestamp_sub(current_timestamp(), interval 10 minute)
    group by ip order by n desc limit 10
```

Avhengig av at `SB_MANAGEMENT_TOKEN`-secret er satt (samme som dagens monitor bruker). Hvis ikke satt, returnerer `runAnalytics` tom array og varsler trigges ikke — vi logger en advarsel.

## Leveranse
1. Migrasjon: Legg til 5 nye kolonner i `monitoring_config`
2. Oppdater `system-health-monitor/index.ts` med 4 nye sjekker
3. Oppdater `operations-digest/index.ts` med utvidet rapport
4. Deploy begge funksjoner

Cron-jobben kjører videre uendret.