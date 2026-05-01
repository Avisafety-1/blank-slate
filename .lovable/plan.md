# DJI pending logs – grenser og UX-forbedringer

## Bakgrunn

I dag finnes to harde grenser:
- `dji-auto-sync` henter `?limit=50` per pilot per kjøring fra DJI API
- `PendingDjiLogsSection` (UI) viser kun 50 logger totalt med `.limit(50)`

For Tensio er det 89 pending logger fordelt på 3 piloter (41 / 34 / 14). UI-en viser de 50 nyeste på tvers av piloter – derfor «50 fordelt på flere personer».

I tillegg: Magnus har 20 logger uten `parsed_result`. Etter forrige fix lagres `error_code` først ved neste klikk. Første klikk gir derfor fortsatt en rå feilmelding før UI-en kan vise den pene varianten.

Bulk-onboarding for store historikker (10 000+ logger) er **ikke** med i denne planen – tas eventuelt senere.

## Endringer

### 1. Heve UI-grensen og gi paginering
- `PendingDjiLogsSection`: bytt `.limit(50)` til `.limit(200)` som default, og legg til «Last flere»-knapp som henter neste 200.
- Beholde «Kun mine»-toggle. Når aktiv, filtrer serverside på `user_id = auth.uid()` så grensen blir per pilot.
- Sortere uparsede + feilede øverst så det er tydelig hva som krever oppmerksomhet.

### 2. Heve auto-sync-grensen
- `dji-auto-sync`: øke `?limit=50` til `?limit=200` per pilot per kjøring.
- Beholde 5s pause mellom piloter for å unngå rate-limit.
- Cron kjører fortsatt jevnlig – over tid tar man inn alt uten store bursts.

### 3. Vis feilmelding ved første klikk uten å vente
- Når brukeren klikker en logg som ikke er parset, vis umiddelbart en in-line spinner («Henter fra DJI…»).
- Hvis edge function returnerer `success:false` med `error_code`: oppdater pending-raden lokalt med `error_code` og `last_error_at` så feilmeldingen og «vent 2 min»-tilstanden vises i samme klikk – uten å trenge full refresh.
- Bakgrunnsrefresh av listen så andre piloter også ser oppdatert status.

## Filer som endres

- `supabase/functions/dji-auto-sync/index.ts` (limit 50 → 200)
- `src/components/PendingDjiLogsSection.tsx` (limit 50 → 200, paginering, serverside «Kun mine», sortér feil/uparsede øverst, ekspose lokal updateLog-funksjon via ref)
- `src/components/UploadDroneLogDialog.tsx` (oppdater pending-rad lokalt ved feil via ref)

Ingen migrasjoner kreves.
