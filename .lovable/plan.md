# DJI pending logs – grenser og onboarding

## Bakgrunn

I dag finnes to harde grenser:
- `dji-auto-sync` henter `?limit=50` per pilot per kjøring fra DJI API
- `PendingDjiLogsSection` (UI) viser kun 50 logger totalt med `.limit(50)`

For Tensio er det 89 pending logger fordelt på 3 piloter (41 / 34 / 14). UI-en viser de 50 nyeste på tvers av piloter – derfor «50 fordelt på flere personer».

I tillegg: Magnus har 20 logger uten `parsed_result`. Etter forrige fix lagres `error_code` først ved neste klikk. Første klikk gir derfor fortsatt en rå feilmelding før UI-en kan vise den pene varianten.

For nye selskaper med 1 000–10 000 historiske DJI-logger er dagens flyt ikke brukbar (rate-limit, full parsing per logg, lang ventetid).

## Endringer

### 1. Heve UI-grensen og gi paginering
- `PendingDjiLogsSection`: bytt `.limit(50)` til `.limit(200)` som default, og legg til «Last flere»-knapp som henter neste 200 (offset/keyset).
- Beholde «Kun mine»-toggle. Når aktiv, filtrere serverside på `user_id = auth.uid()` så grensen blir per pilot.
- Sortere uparsede + feilede øverst (eller egen seksjon) så det er tydelig hva som krever oppmerksomhet.

### 2. Heve auto-sync-grensen forsiktig
- `dji-auto-sync`: øke `?limit=50` til `?limit=200` per pilot per kjøring (DJI tillater dette).
- Beholde 5s pause mellom piloter for å unngå rate-limit.
- Cron kjører fortsatt jevnlig – over tid tar man inn alt uten store bursts.

### 3. Vis feilmelding ved første klikk uten å vente
- Når brukeren klikker en logg som ikke er parset, vis umiddelbart en in-line spinner («Henter fra DJI…»).
- Hvis edge function returnerer `success:false` med `error_code`: oppdater pending-raden lokalt med `error_code` og vis feilmeldingen direkte i kortet (uten å trenge full refresh).
- Gjør refresh av listen i bakgrunnen så «vent 2 min»-tilstanden fanges med samme klikk.

### 4. Bulk-onboarding for store historikker
Ny knapp i admin/innstillinger: **«Importer hele DJI-historikk»** (per pilot, krever DJI-credentials):

- Ny edge function `dji-bulk-import` som:
  - Lister ALLE logger fra DJI med paginering (`?limit=200&offset=N` til tomt resultat)
  - Lagrer alle som `pending_dji_logs` med `parsed_result = null` og `import_source = 'bulk'`
  - Returnerer totalt antall funnet
- Egen background processor `dji-bulk-process` som kjører via cron (hvert 5. min):
  - Plukker opp inntil 20 uparsede `bulk`-logger
  - Sekvensiell parsing med 2s pause mellom hver
  - Stopper umiddelbart ved 429 og venter til neste cron-kjøring
  - Skriver progress på en ny `dji_bulk_import_jobs`-rad (total, processed, failed, status)
- UI-progresslinje på admin-siden: «4 230 / 10 000 logger importert. Estimert tid: 6 t.»
- Brukeren kan lukke siden – jobben fortsetter i bakgrunnen.

### 5. Smart deduplisering før parsing
For å spare DJI-kall i bulk-jobben:
- DJI-listing returnerer `id`, `flight_date`, `aircraft_sn`, `duration` allerede
- Sjekk mot eksisterende `flight_logs` (samme dato + dronens SN + duration ±30s) før vi laster ned filen
- Markér som `status='auto_dismissed_duplicate'` hvis match – sparer 90 % av kallene for selskaper som allerede har data manuelt registrert.

## Database-endringer

```sql
-- Spore bulk-import-jobber
CREATE TABLE dji_bulk_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid not null,
  total_found integer default 0,
  processed integer default 0,
  failed integer default 0,
  status text default 'discovering', -- discovering | processing | done | failed
  started_at timestamptz default now(),
  completed_at timestamptz
);

-- Markere kilde for pending-logger
ALTER TABLE pending_dji_logs
  ADD COLUMN import_source text DEFAULT 'auto_sync'; -- auto_sync | bulk | manual
```

## Tekniske noter

- Auto-sync cron beholdes som i dag, men med høyere `limit`.
- Bulk-jobben respekterer alltid 429 og bruker backoff. Den «spiser» seg gradvis gjennom historikken.
- Pending-listen i UI får et nytt filter: «Auto-sync», «Bulk-import», «Med feil».
- For sluttbruker er bulk-importen «fire-and-forget»: start, lukk fanen, kom tilbake senere.

## Filer som endres

- `supabase/functions/dji-auto-sync/index.ts` (limit 50 → 200)
- `src/components/PendingDjiLogsSection.tsx` (limit 50 → 200, paginering, sortering, lokal error-oppdatering)
- `src/components/UploadDroneLogDialog.tsx` (oppdater pending-rad lokalt ved feil)
- Ny: `supabase/functions/dji-bulk-import/index.ts`
- Ny: `supabase/functions/dji-bulk-process/index.ts` (cron hvert 5. min)
- Ny: `src/components/DjiBulkImportPanel.tsx` (admin/innstillinger)
- Migrasjon: `dji_bulk_import_jobs` + `import_source` på `pending_dji_logs`
