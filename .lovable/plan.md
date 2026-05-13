## Bakgrunn

`dji-sync-enqueue` (id `fd635dd6-...`) traff p95 = 23.7s på én kjøring (n=1). Det er lavt signal (en enkelt cron-sweep med flere brukere), men funksjonen har reelle flaskehalser som er verdt å fjerne før de blir et problem.

Edge functions har ~25-30s soft timeout, så vi ligger farlig nær grensen.

## Hovedårsaker til høy latency

1. **Sekvensiell brukerprosessering** med 500ms `STAGGER_MS` mellom hver bruker → 20 brukere = minst 10s ren venting + N × (login + list + N_logs × 2 DB-roundtrips).
2. **Per-log dupesjekk** gjør 2 separate `SELECT ... maybeSingle()` per logg (én mot `pending_dji_logs`, én mot `dji_sync_jobs`). For 200 logger = 400 sekvensielle DB-roundtrips per bruker.
3. **Login + list mot DroneLog** kan ta flere sekunder per bruker uten parallellitet.

## Plan

### Steg 1 — Batch-dedupe (størst gevinst, ingen risiko)

Erstatt per-log loop som gjør 2 `maybeSingle` med én `SELECT ... IN (...)` mot hver tabell, før innsetting:

```ts
const allIds = logs.map(l => String(l.id || l.logId)).filter(Boolean);
const [{ data: pend }, { data: jobs }] = await Promise.all([
  serviceClient.from("pending_dji_logs")
    .select("dji_log_id").eq("company_id", company.id).in("dji_log_id", allIds),
  serviceClient.from("dji_sync_jobs")
    .select("dji_log_id").eq("company_id", company.id)
    .eq("user_id", cred.user_id).in("dji_log_id", allIds),
]);
const seen = new Set([...(pend||[]), ...(jobs||[])].map(r => r.dji_log_id));
```

Deretter bygg en `insert([...])` batch i ett kall i stedet for N enkle inserts. Beholder eksisterende `23505`-håndtering ved å sette `.upsert(..., { onConflict: '...', ignoreDuplicates: true })` eller fallback per rad ved batch-feil.

Reduserer DB-roundtrips fra ~400 til ~3 per bruker.

### Steg 2 — Parallelliser brukere i små batcher

Bytt sekvensiell loop med 500ms stagger til `Promise.all` i puljer på 4-5 brukere:

```ts
const CONCURRENCY = 4;
for (let i = 0; i < credList.length; i += CONCURRENCY) {
  const chunk = credList.slice(i, i + CONCURRENCY);
  const part = await Promise.all(chunk.map(c => enqueueForUser(serviceClient, c)));
  results.push(...part);
}
```

Beholder begrenset DroneLog-konkurrens (4 samtidige login-kall er trygt mot rate limit), men kutter total tid med ~3-4x.

### Steg 3 — Stram inn per-bruker timeouts (defensivt)

`TIMEOUTS.login` og `TIMEOUTS.list` settes allerede via `withTimeout`. Bekreft verdier (les `_shared/dji-parser.ts`); hvis >8s, vurder å redusere så ett tregt DroneLog-kall ikke trekker hele sweeppen mot 25s-grensen.

### Steg 4 — Verifiser

- Ingen DB-endring nødvendig.
- `supabase--curl_edge_functions` mot `/dji-sync-enqueue` med cron-secret etter deploy, sjekk `elapsed_ms` i respons og logger.
- Følg p95 i analytics neste døgn.

## Hva planen IKKE gjør

- Endrer ikke arkitekturen til en separat job-queue (worker-mønsteret finnes allerede via `dji-sync-worker` — enqueue gjør riktig jobb, den må bare gjøres raskere).
- Endrer ingen DB-skjema, RLS eller policies.
- Endrer ikke kall-signatur; `userId`-self-sync og cron-sweep oppfører seg likt utad.
