# Filtrer bort "canceling statement"-støy i system-health-monitor

## Problem
`system-health-monitor` kjører hvert 10. min og varsler ved ≥10 DB-feil. Den teller ALLE `ERROR/FATAL/PANIC` i `postgres_logs`, inkludert `canceling statement due to user request` — som er ufarlige avbrutte queries (React Query AbortController når komponenter unmountes eller bruker navigerer bort). Daglig digest 07:00 UTC er noe annet og uberørt.

## Endring i `supabase/functions/system-health-monitor/index.ts`

Oppdater `dbErrSql` til å ekskludere kjente støy-meldinger:

```sql
select count(*) as n from postgres_logs
cross join unnest(metadata) as m
cross join unnest(m.parsed) as parsed
where parsed.error_severity in ('ERROR','FATAL','PANIC')
  and postgres_logs.timestamp > timestamp_sub(current_timestamp(), interval 10 minute)
  and event_message not like '%canceling statement due to user request%'
  and event_message not like '%canceling statement due to statement timeout%'
```

Resten av funksjonen, terskler og config er uendret.

## Konsekvens
- Brukeravbrutte queries teller ikke lenger som "DB-feil" → ingen falske 10-min varsler.
- Reelle feil (constraint violations, RLS-avslag, syntax-feil osv.) varsles fortsatt.
- Daglig 07:00-digest fortsetter som før (separat job).
