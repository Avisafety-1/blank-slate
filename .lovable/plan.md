# Elverum: dagens flylogger «sitter fast» i synkekøen

## Hva som har skjedd (bekreftet i databasen)

- Dronepilot ELVIS trykket **«Sync nå»** i DJI-fanen kl. 13:35 i dag. Det la **19 logger i synkekøen** (`dji_sync_jobs`, status `queued`, 0 forsøk) — 12 fra i dag og 7 eldre (mars/april).
- Ingen av dem er behandlet ennå. Det er **ingen rader** for i dag i «til behandling»-listen (`pending_dji_logs`) og ingen feil.
- Årsak: bakgrunnsjobben som faktisk laster ned og behandler køen (`dji-sync-worker-drain`) kjører kun i **nattvinduet 21:00–03:59 UTC** (hvert 2. minutt). «Sync nå» legger altså bare loggene i kø — de blir ikke hentet før kl. 23:00 norsk tid i kveld.
- I mellomtiden viser DJI-listen loggene som grået ut med merkelappen «Auto-sync», fordi listen markerer alle logger som ligger i køen som «håndtert». Manuell import er dermed sperret, og loggene finnes ikke noe annet sted. Det er akkurat det Elvis opplever.
- I tillegg sier «Sync nå»-knappen «Sync fullført: 0 nye logger hentet» selv om 19 ble lagt i kø, siden svaret fra køleggingen ikke inneholder feltet knappen leser.

Loggene er altså ikke borte — de ligger trygt i kø og ville dukket opp i «til behandling» i morgen tidlig.

## Fiks

1. **Behandle Elverums 19 logger nå** (engangs): kjør køarbeideren manuelt til køen er tom, slik at loggene havner i «til behandling» i dag og Elvis kan knytte dem til oppdrag.
2. **«Sync nå» skal faktisk hente loggene med en gang**: etter kølegging kaller `dji-auto-sync` køarbeideren i en løkke (kun for denne brukerens jobber, med tak på f.eks. 20 jobber / 50 sek) før den svarer. Svaret får `synced` = antall behandlede logger og `queued` = eventuelle gjenværende, og knappen viser riktig melding («12 logger hentet, 7 legges i kø til i natt»).
3. **Ikke sperr manuell import for logger som bare venter i kø**: logger med status «Auto-sync (venter)» skal fortsatt kunne velges i DJI-listen; velger man en slik logg, kanselleres køjobben og loggen importeres direkte. Merkelappen endres til «I kø – hentes i natt» så det er tydelig hva som skjer.
4. **Dagvindu for køen**: legg til en ekstra cron som tømmer køen hvert 10. minutt på dagtid (04:00–20:59 UTC) med lav batch, slik at manuelt utløste synker aldri blir liggende mer enn noen minutter selv om punkt 2 skulle feile.

## Teknisk

- `supabase/functions/dji-auto-sync/index.ts`: etter videresending til `dji-sync-enqueue`, kall `dji-sync-worker` gjentatte ganger (med `x-cron-secret` fra env, filtrert på `user_id`) til `processed = 0` eller tidsbudsjett brukt opp; returner `{ synced, queued, errors }`.
- `supabase/functions/dji-sync-worker/index.ts`: ny valgfri body `{ userId }` som sendes til `claim_dji_sync_jobs` (ny parameter `_user_id` i RPC-en, migrasjon) slik at «Sync nå» bare drenerer egne jobber.
- `supabase/functions/process-dronelog/index.ts`: `state = "queued"` beholdes, men frontend (`UploadDroneLogDialog.tsx`, `isDjiLogKnown`) unntar `queued` fra sperren; ved import av en `queued`-logg slettes tilhørende rad i `dji_sync_jobs` (status `queued`) via eksisterende RLS/edge-kall.
- `UploadDroneLogDialog.tsx` linje ~3799–3815: bruk `data.synced`/`data.queued` fra nytt svar, i18n-nøkler i både `no.json` og `en.json` (`dronelog.syncNowResult`, `dronelog.queuedWaitingBadge`).
- Migrasjon: `cron.schedule('dji-sync-worker-daytime', '*/10 4-20 * * *', ...)` + utvidet `claim_dji_sync_jobs(_limit int, _user_id uuid default null)`.
- Ingen endringer i tabellstruktur, grants eller RLS på eksisterende tabeller.

## Verifisering

- Etter punkt 1: `pending_dji_logs` for Elverum har 12 rader med `flight_date` = i dag, og DJI-listen viser dem som «Til behandling» i stedet for grået «Auto-sync».
- Trykk «Sync nå» på en testkonto med nye logger: loggene ligger i «til behandling» innen ett minutt, og meldingen viser riktig antall.
