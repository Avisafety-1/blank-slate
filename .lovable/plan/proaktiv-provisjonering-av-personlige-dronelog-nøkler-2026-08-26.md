# Proaktiv provisjonering av personlige DroneLog-nøkler

## Bakgrunn (verifisert)

- `user_dronelog_keys` har i dag 2 rader: `hauggard@gmail.com` (Elverum Videregående Skole) og `support@avisafe.no`.
- Edge-loggene for `process-dronelog` 26.08 kl. 14:25–14:27 viser `source=user` på hver nedlasting — den personlige nøkkelen opprettes én gang og gjenbrukes. Flowen fungerer.
- De øvrige Elverum-brukerne med lagrede DJI-credentials (matmad, sveras, selv.dronefag) har ingen personlig nøkkel ennå.
- `dji-sync-enqueue` kaller allerede `resolveDronelogKey(..., provision: true)`, men bare for brukere med `auto_sync_enabled = true`, og maks 50 brukere per kjøring. Brukere uten auto-sync får derfor aldri nøkkel før de logger inn manuelt.

## Mål

Alle brukere med lagrede DJI-credentials skal få sin egen DroneLog-nøkkel uten å måtte logge inn interaktivt først, slik at ingen faller tilbake på delt selskaps-/globalnøkkel (og dermed delt rate limit).

## Løsning

Ny Edge Function `dronelog-provision-keys` (backend-only, cron-beskyttet med samme cron-secret som øvrige jobber):

1. Hent brukere fra `dji_credentials` som mangler rad i `user_dronelog_keys` (og mangler legacy `dronelog_api_key_encrypted`).
2. Behandle maks N brukere per kjøring (foreslått 10), sekvensielt med kort pause mellom kall — dette er `POST /keys` mot DroneLog, ikke innlogging, så belastningen er lav, men vi holder oss godt under rate limit.
3. For hver bruker: kall `provisionUserKey` fra `_shared/dronelog-auth.ts` med masternøkkelen `DRONELOG_AVISAFE_KEY`, navn `"<selskap> – <dji_email>"`, og lagre kryptert i `user_dronelog_keys`.
4. Ved `429` eller `master_key_invalid`: stopp resten av kjøringen umiddelbart og returner status; neste kjøring fortsetter der den slapp.
5. Logg kun `user_id`, selskap og resultatstatus — aldri nøkkelverdi.

Planlegging: legg jobben på pg_cron én gang i timen fram til køen er tom (funksjonen er en no-op når alle har nøkkel). Alternativt kan den kalles manuelt én gang for å ta unna de eksisterende brukerne.

## Teknisk

- Ny fil: `supabase/functions/dronelog-provision-keys/index.ts`.
- Gjenbruker `provisionUserKey` og `encryptSecret` fra `_shared/dronelog-auth.ts` — ingen ny kryptologikk.
- Ingen skjemaendring; `user_dronelog_keys` finnes allerede med service-role-grants og RLS uten klientpolicyer.
- Cron-oppføring via migrasjon (pg_cron/pg_net), samme mønster som `dji-sync-enqueue`.

## Verifisering

1. Kjør funksjonen manuelt én gang og bekreft i loggen hvor mange nøkler som ble opprettet, uten nøkkelverdier i loggen.
2. Spør databasen: antall rader i `user_dronelog_keys` skal øke og dekke de tre Elverum-brukerne.
3. Bekreft ved neste DJI-handling at loggen viser `source=user` for disse brukerne.
