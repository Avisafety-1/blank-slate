
## Funn

Jeg sjekket `monitoring_alerts`, postgres-logger og edge-latency for siste uke. Begge varslene er reelle, men skyldes egne feil i monitorering/digest – ikke faktiske problemer i appen.

### 1. "Mange DB-feil" (db_errors)

Eneste DB-feil siste uke er disse to, som dukker opp samtidig hver gang `operations-digest` kjører:

```
ERROR: column missions.created_at does not exist
ERROR: column incidents.created_at does not exist
```

Årsak: `supabase/functions/operations-digest/index.ts` bruker hjelperen `safeCount(table, sinceCol = "created_at", ...)` og kaller `safeCount("missions")` og `safeCount("incidents")`. Begge tabellene bruker `opprettet_dato`, ikke `created_at`. Resultatet er at den daglige drift-rapporten viser `-1` for nye oppdrag og hendelser, og hver kjøring logger 2 DB-feil. Når terskelen (10 feil / 10 min) treffes, sendes varsel.

`mission_risk_assessments` og `flight_logs` har faktisk `created_at`, så de er OK.

### 2. "Høy latency" (high_latency)

Eneste edge-funksjon over 10 s p95 siste døgn er `ai-risk-assessment` med 35 s execution. Det er forventet for en LLM-call og ikke et reelt problem. Funksjonen burde være på `latency_excluded_function_ids` på linje med de to andre tunge AI-funksjonene som allerede er ekskludert.

## Endringer

1. `supabase/functions/operations-digest/index.ts`
   - Endre `safeCount("missions")` → `safeCount("missions", "opprettet_dato")`
   - Endre `safeCount("incidents")` → `safeCount("incidents", "opprettet_dato")`
   - La `mission_risk_assessments` og `flight_logs` stå urørt (de bruker `created_at`).
   - Effekt: daglig digest viser riktige tall, og de to gjentakende DB-feilene forsvinner.

2. Migrasjon: legg edge-function-id for `ai-risk-assessment` (`4b281c52-4bbe-4481-b102-eb24d46300af`) til `monitoring_config.latency_excluded_function_ids`. Da slutter latency-varselet å trigge på normale AI-kjøringer, men terskelen gjelder fortsatt for alle andre funksjoner.

Ingen andre filer, RLS eller frontend berøres.
