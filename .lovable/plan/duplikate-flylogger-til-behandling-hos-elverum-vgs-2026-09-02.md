# Duplikate flylogger til behandling hos Elverum vgs

## Bekreftet: ja, det ligger dobbelt

Sjekk mot databasen for Elverum Videregående Skole:

- 186 logger ligger til behandling (`pending`), 350 er ferdig behandlet.
- Av de 186 har 130 en numerisk DJI-ID og 56 en 64-tegns SHA-ID.
- 56 flyturer finnes to ganger — samme starttidspunkt, samme varighet, samme drone og **samme sha256-sum på filen**, men to forskjellige logg-ID-er.

Eksempel (Mini 5 Pro "Rane", 01.09 kl. 10:31, 289 sek):

| Opprettet | Logg-ID | sha256 |
| --- | --- | --- |
| 01.09 11:17 | e8e11ef3…c08d | e8e11ef3…c08d |
| 01.09 21:20 | 709899298 | e8e11ef3…c08d |

## Hvorfor det skjer

To ulike veier inn skriver hver sin rad:

1. **Manuell opplasting** (bulk-opplasting av .txt i appen) lagrer raden med `dji_log_id = sha256`-summen av filen.
2. **Nattlig DJI-skysynk** henter samme flytur fra DroneLog og lagrer den med DroneLog sin numeriske logg-ID.

Duplikatsjekken i synken skjer kun på `dji_log_id` (og unik-indeksen er `company_id + dji_log_id`). Siden de to veiene bruker helt ulike ID-formater, ser synken aldri at loggen allerede ligger der. Synk-arbeideren sjekker riktignok sha256 mot `flight_logs`, men ikke mot `pending_dji_logs` — så en logg som er lastet opp manuelt, men ennå ikke behandlet, blir hentet på nytt om natten.

Det er altså ikke dobbel synk eller dobbel kjøring — det er manuell opplasting + autosynk som møtes.

## Fiks

1. **Sha256-dedupe i synk-arbeideren** (`dji-sync-worker`): etter parsing, før innsetting i `pending_dji_logs`, sjekk om selskapet allerede har en ventende rad med samme `parsed_result->>'sha256Hash'`. Finnes den, hopp over innsettingen, marker jobben som `done` (grunn: duplikat), og skriv den numeriske DJI-ID-en inn på den eksisterende raden hvis den mangler (selvlæring, samme mønster som i `process-dronelog`).
2. **Signaturfilter i køleggingen** (`dji-sync-enqueue`): hopp også over kandidater der selskapet allerede har en ventende logg med starttid innenfor ±3 min og varighet innenfor ±2 min. Da slipper vi å laste ned og parse i det hele tatt. Samme toleranser som brukes i dagens signaturmatch.
3. **Opprydding av eksisterende duplikater**: én engangs-sletting av de nyeste dublett-radene per (selskap, sha256) blant `status = 'pending'`. Den eldste raden (den manuelt opplastede) beholdes, slik at ingen ubehandlet flytur forsvinner. Kjøres for alle selskaper som har samme mønster, ikke bare Elverum — men kun på `pending`-rader, aldri på `approved` eller ferdige flylogger.

Ingen endringer i tabellstruktur, tilgangsregler eller behandlede flylogger.

## Teknisk

- `supabase/functions/dji-sync-worker/index.ts`: utvid duplikatsteget (i dag kun `flight_logs.dronelog_sha256`) med oppslag mot `pending_dji_logs` på sha256; ny returstatus `duplicate` i jobbresultatet.
- `supabase/functions/dji-sync-enqueue/index.ts`: legg til ett batch-oppslag mot `pending_dji_logs` (flight_date, duration_seconds) for perioden som synkes, og filtrer kandidater på signatur i tillegg til ID.
- Sletting av eksisterende dubletter kjøres som datajobb (SQL), ikke migrasjon.

## Verifisering

- Etter opprydding: tell ventende logger for Elverum og bekreft at ingen (starttid, varighet) forekommer to ganger.
- Kjør synken på nytt manuelt og bekreft at den ikke gjenoppretter dublettene.
