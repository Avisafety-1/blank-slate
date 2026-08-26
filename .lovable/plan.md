# DJI-innlogging: egen API-nøkkel per bruker + caching

## Bakgrunn (bekreftet)

- All DJI-innlogging går via DroneLog `/accounts/dji` fra edge functions, med `companies.dronelog_api_key` eller fellesnøkkelen `DRONELOG_AVISAFE_KEY`.
- 75 selskaper, 61 med nøkkel — men bare 34 unike nøkler. Mange deler nøkkel, og 14 selskaper bruker fellesnøkkelen.
- Hver operasjon logger inn på nytt (behandling av 5 logger = 5 innlogginger), selv om `dji_credentials.dji_account_id` allerede er lagret.
- `manage-dronelog-key` viser at vi kan opprette nye nøkler mot `POST /keys` med masternøkkelen — så per-bruker-nøkler er teknisk mulig i dag.

Derfor: bruker A bruker opp forsøk for bruker B.

## Løsning i to deler

### Del 1 — Cache innloggingen (størst effekt, minst risiko)

- Ny delt hjelper `resolveDjiAccount()` i `supabase/functions/_shared/dji-parser.ts`:
  - Har brukeren `dji_credentials.dji_account_id`? Hopp over `/accounts/dji` og gå rett på `/logs/{accountId}`.
  - Kun hvis account-id mangler, eller list-kallet svarer 401/403, gjøres en ny innlogging (og ny account-id lagres).
  - Ved 429: respekter `Retry-After`, ikke blind 35-sekunders retry.
- Tas i bruk i `dji-process-single`, `dji-sync-enqueue`, `dji-sync-worker` og `process-dronelog`.
- Nattlig sveip stopper videre innlogginger på samme nøkkel etter første 429 i stedet for å brenne opp potten for manuelle brukere.

### Del 2 — Egen DroneLog-nøkkel per bruker

- Ny kolonne på `dji_credentials`: `dronelog_api_key_encrypted` (kryptert med samme AES-GCM-mønster som DJI-passordet).
- Første gang en bruker gjør en DJI-operasjon etter dette (lazy provisioning): opprett en nøkkel via `POST /keys` med masternøkkelen, navn `"{Selskap} – {e-post}"`, krypter og lagre den på brukeren.
- Nøkkelvalg blir: brukerens egen nøkkel → selskapets nøkkel → fellesnøkkel. Ingen big-bang; eksisterende brukere flyttes over etter hvert som de bruker DJI.
- Ved 401 på brukerens nøkkel: fall tilbake til selskaps-/fellesnøkkel og marker nøkkelen for ny provisionering.

## Viktige forbehold

- Hvis DroneLog struper per IP (Laravel «Too Many Attempts» gjør typisk det), hjelper ikke egne nøkler alene — alle kallene våre kommer fra samme Supabase-egress. Derfor gjøres Del 1 uansett, og vi måler effekten av Del 2 etterpå. Vi kan også spørre DroneLog direkte om grensen er per nøkkel eller per IP.
- Kvote/forbruk rapporteres per nøkkel. `dronelog-usage` (superadmin) må summere brukernøkler for et selskap, ellers ser tallene lavere ut enn de er.
- Hvis DroneLogs abonnement har et tak på antall nøkler, må vi vite det før vi ruller ut per bruker.

## Teknisk

- Migrasjon: én ny tekstkolonne på `dji_credentials` (ingen endring av eksisterende data).
- Filer: `_shared/dji-parser.ts` (ny `resolveDjiAccount()` + `resolveDronelogKey()`), `dji-process-single/index.ts`, `dji-sync-enqueue/index.ts`, `dji-sync-worker/index.ts`, `process-dronelog/index.ts`, `manage-dronelog-key/index.ts` (gjenbruk av nøkkeloppretting), `dronelog-usage/index.ts` (aggregering).
- UI: tydeligere feiltekst i `UploadDroneLogDialog.tsx` og `PendingDjiLogsSection.tsx` som skiller «felles grense nådd» fra «feil passord» (i18n i både no.json og en.json).

## Verifisering

- Behandle 3 logger etter hverandre: maks én innlogging i edge-loggene.
- Kjøre `dji-sync-enqueue` manuelt: kraftig fall i antall `/accounts/dji`-kall.
- Elverum-brukerne (ELVIS, Sverre, Martin) skal kunne behandle logger rett etter hverandre uten 429.
- Bekrefte at en nyprovisjonert brukernøkkel faktisk lister logger, og at fallback fungerer hvis den avvises.
