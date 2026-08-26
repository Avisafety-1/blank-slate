# Verifikasjon: DroneLog-nøkkel per bruker + innloggings-caching

## Status i dag (kontrollert nå)

Kodemessig er alt på plass:

- `supabase/functions/_shared/dronelog-auth.ts` finnes og inneholder kryptering, nøkkelrekkefølge (personlig → selskap → global), lazy oppretting via `POST /keys`, 429-cooldown i `app_config`, og innloggings-caching.
- Den brukes av `process-dronelog`, `dji-process-single`, `dji-sync-enqueue` og `dji-sync-worker`.
- `dji-auto-login` returnerer nå cachet `dji_account_id` uten å logge inn; `dji-list-logs` re-logger kun ved 401/403/404.
- Databasekolonnene `dronelog_api_key_encrypted` og `dronelog_key_created_at` finnes på `dji_credentials`.
- `app_config` har primærnøkkel på `key`, så cooldown-upsert fungerer.
- Alle fire funksjonene ble deployet.

Det som **ikke** er bekreftet:

- Ingen bruker har fått personlig nøkkel ennå (0 av 36 rader har `dronelog_api_key_encrypted`). Nøkkel opprettes først ved neste DroneLog-kall.
- `process-dronelog` har ingen logger etter deploy, så ny kode er ikke kjørt i praksis ennå.
- Svarformatet fra DroneLog `POST /keys` er ikke sett i praksis (vi leser `result.key`, `key`, `result.api_key`, `api_key`).

## Svakheter funnet under gjennomgangen

1. **Ingen selvhelbredelse hvis en personlig nøkkel blir ugyldig.** `clearUserKey` er skrevet, men brukes ingen steder. Blir en personlig nøkkel slettet/deaktivert hos DroneLog, får brukeren 401 i det uendelige i stedet for å falle tilbake til selskaps-/global nøkkel.
2. **Brukere uten selskap får aldri personlig nøkkel.** Provisjonering skjer kun inne i blokken som slår opp selskap.
3. **`dronelog-usage` teller fortsatt bare selskaps-/global nøkkel**, så forbruket per personlig nøkkel vises ikke.

## Forslag til verifisering og opprydding

1. Kjør én reell DJI-handling for én bruker (f.eks. lagrede DJI-innstillinger → hent logger) og les loggene: forvent `[dronelog-auth] provisioned personal DroneLog key …` og deretter `source=user`. Sjekk at `dji_credentials.dronelog_api_key_encrypted` er satt for den brukeren.
2. Kjør samme handling én gang til og bekreft at det ikke skjer ny nøkkeloppretting og ingen `/accounts/dji`-innlogging (kun gjenbruk av cachet konto).
3. Bruk `clearUserKey` ved 401/"api_key_invalid" på personlig nøkkel, med umiddelbar fallback til selskaps-/global nøkkel i samme kall.
4. Flytt provisjonering ut av selskaps-blokken slik at brukere uten selskap også får egen nøkkel.
5. Oppdater `dronelog-usage` til å aggregere personlige nøkler i tillegg til selskaps-/global nøkkel.

## Teknisk

Ingen databaseendringer nødvendig. Endringene i punkt 3–5 gjøres i `_shared/dronelog-auth.ts`, `process-dronelog`, `dji-process-single`, `dji-sync-enqueue`/`worker` og `dronelog-usage`, etterfulgt av deploy.
