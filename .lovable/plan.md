## DJI auto-sync → ekte kø-system (endelig plan)

Alle tidligere presiseringer beholdt. Endring i denne runden: **gammel `dji-auto-sync` blir en tynn wrapper** rundt det nye køsystemet, slik at all inngang (gammel UI, ny UI, manuell, cron) går samme vei.

### Arkitektur

```text
gammel UI ──┐
ny UI ──────┤
manuell ────┼──► dji-auto-sync (WRAPPER) ──► dji-sync-enqueue ──► dji_sync_jobs
cron ───────┘                                                          │
                                                                       ▼
                                              dji-sync-worker (cron */2 min, 02–04)
                                                  claim_dji_sync_jobs(2) SKIP LOCKED
                                                  → download + parse + insert
```

Ingen tung sync-logikk lever lenger i `dji-auto-sync`. Den tar imot samme payload som før (`{}` eller `{ userId }`), kaller `dji-sync-enqueue` internt, og returnerer et lite status-objekt (`{ enqueued: true, jobs_added: N }`).

---

### 1. Migrasjon — `dji_sync_jobs` + funksjoner

Tabell `public.dji_sync_jobs`:
- `id`, `company_id`, `user_id`, `dji_log_id`, `download_url`, `payload jsonb`
- `status` (`queued | in_progress | done | failed | unsupported`)
- `attempts int default 0`, `last_error text`, `last_error_at timestamptz`
- `step_durations jsonb` — `{login_ms, list_ms, download_ms, parse_ms, insert_ms, total_ms}`
- `scheduled_at`, `locked_until`, `created_at`, `updated_at`
- **Unique:** `(company_id, user_id, dji_log_id)`
- Indekser: `(status, scheduled_at)`, `(status, locked_until)`, `(company_id)`, `(user_id)`
- RLS: service role full; admins SELECT i egen company; vanlige brukere ingen.

Funksjoner (SECURITY DEFINER):
- `claim_dji_sync_jobs(_limit int)` — plukker `queued` ELLER `in_progress AND locked_until < now()` (stuck recovery), `attempts < 5`, med `FOR UPDATE SKIP LOCKED`, setter `in_progress` + `locked_until = now()+5 min`.
- `retry_dji_sync_job(_job_id uuid)` — kun admin/superadmin i company; nullstiller status/attempts/error, `scheduled_at=now()`.

---

### 2. Edge function `dji-sync-enqueue` (NY)

- Trigger: pg_cron (02:00 daglig) eller invoke fra UI / fra wrapper.
- Body: `{}` (alle aktive brukere) eller `{ userId }` (kun den).
- Begrensninger:
  - Max **20 brukere** per kjøring (sortert `last_sync_at NULLS FIRST`).
  - 500 ms stagger mellom brukere.
- Hard timeouts via `AbortController`:
  - Login DroneLog: **12 s**
  - GET /logs: **15 s**
- Per logg: hvis ikke i `pending_dji_logs` ELLER `dji_sync_jobs` → INSERT i `dji_sync_jobs`.
- Skriver `last_sync_at` på `dji_credentials`.
- Returnerer `{ users_processed, jobs_added, skipped }`. Skal alltid fullføre under 60 s.

---

### 3. Edge function `dji-sync-worker` (NY)

- Trigger: pg_cron `*/2 2-3 * * *`.
- `BATCH_SIZE = 2` (konstant øverst i fila — enkel å justere til 3/5 etter validering).
- Plukker via `claim_dji_sync_jobs(BATCH_SIZE)`.
- Per jobb (med stopwatch per steg → `step_durations`):
  - Download fil: timeout **20 s**
  - Upload + parse: timeout **30 s**
  - Suksess → `status='done'`, INSERT i `pending_dji_logs` (samme logikk som dagens kode).
  - Unsupported format → `status='unsupported'` (final).
  - 429 → `status='queued'`, `scheduled_at = now()+5 min`, ikke tell forsøk.
  - Annen feil → `status='failed'` hvis `attempts >= 5`, ellers behold `in_progress` med utløpt `locked_until` så den plukkes igjen.
- Returnerer `{ processed, done, failed, total_ms }`.

---

### 4. Edge function `dji-auto-sync` (WRAPPER — endring)

All eksisterende tung kode (login + GET + per-bruker fan-out + download + parse) **fjernes** fra denne funksjonen og lever kun i `dji-sync-enqueue` / `dji-sync-worker`.

Wrapperens hele jobb:

```ts
// dji-auto-sync/index.ts (forenklet)
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const { data, error } = await supabase.functions.invoke('dji-sync-enqueue', {
    body, // { } eller { userId }
  });
  if (error) return json({ ok: false, error: error.message }, 502);

  return json({
    ok: true,
    legacy_endpoint: true,
    forwarded_to: 'dji-sync-enqueue',
    ...data, // users_processed, jobs_added, skipped
  });
});
```

Konsekvenser:
- Gammel frontend, ny frontend, manuell knapp og evt. eksisterende integrasjoner trenger ingen endring.
- Ingen risiko for at gammel og ny flyt konkurrerer om samme logger — alt går gjennom `dji_sync_jobs` med unique constraint.
- Når vi senere er trygge, kan wrapperen slettes uten å påvirke køen.

---

### 5. pg_cron

```sql
SELECT cron.unschedule('dji-auto-sync-daily');  -- gammel daglig kjøring av av

SELECT cron.schedule('dji-sync-enqueue-daily', '0 2 * * *', $$
  SELECT net.http_post(url:='…/dji-sync-enqueue', headers:=…, body:='{}'::jsonb);
$$);

SELECT cron.schedule('dji-sync-worker', '*/2 2-3 * * *', $$
  SELECT net.http_post(url:='…/dji-sync-worker', headers:=…, body:='{}'::jsonb);
$$);
```

---

### 6. UI

I Admin → DJI status:
- Tellere: `queued / in_progress / failed / unsupported / done (24t)`.
- Tabell over `failed` med `last_error`, `attempts`, knapp **"Prøv på nytt"** → `retry_dji_sync_job(id)`.
- Brukerprofil: knapp **"Synkroniser meg nå"** → invoker `dji-sync-enqueue` direkte (eller wrapperen — samme resultat).

---

### 7. Akseptansekriterier før batch-økning / frekvens-utvidelse
- 7 dager uten worker-timeout (sjekkes i edge-loggene).
- `step_durations` på minst 100 jobber for å se hvor flaskehalsen ligger.
- Failed-rate < 5 %.
- Ingen 429-kaskader.
Etter dette: batch 2 → 3 → 5, utvid worker-vindu, og evt. fjern wrapperen.

### Det jeg IKKE rører
- `pending_dji_logs` (review-flow uendret).
- `dji-process-single` (manuell upload).
- RLS-migrasjon 2 — utsatt til DJI-køen er stabil.

### Implementasjons­rekkefølge
1. Migrasjon: `dji_sync_jobs` + funksjoner.
2. Deploy `dji-sync-worker` (uten cron — testes med curl).
3. Deploy `dji-sync-enqueue` (testes manuelt for én bruker).
4. Endre `dji-auto-sync` til wrapper.
5. Validér end-to-end på én company.
6. pg_cron: unschedule gammel + schedule ny enqueue + worker.
7. UI-status og retry-knapp.
8. Observasjonsperiode → tuning.

Si fra om planen er godkjent som den står, så starter jeg med Migrasjon (steg 1).