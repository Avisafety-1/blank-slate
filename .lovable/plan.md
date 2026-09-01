# Gamle importer som aldri blir filtrert bort

## Situasjonen (verifisert i databasen)

- 1463 flylogger totalt: 563 har `dji_log_id`, kun 4 har `dji_file_name`.
- 489 logger uten `dji_log_id` har starttidspunkt og kan treffes av signaturmatchen (start ±3 min, varighet ±2 min) — disse blir filtrert i dag, og selvlæringen fyller inn ID/filnavn ved første listing.
- 411 logger mangler både ID, filnavn og `start_time_utc`, men har `flight_date` med klokkeslett og varighet, så de dekkes også av signaturmatchen.
- 263 gamle flylogger kan kobles direkte mot en `pending_dji_logs`-rad med ekte numerisk DJI-ID via tidspunkt/varighet — dette er en engangs-tilbakeføring vi kan gjøre nå.
- Hovedhullet: hvis en logg likevel ikke matcher og brukeren importerer den på nytt, stopper flyten på «duplikat» (SHA-256-treff) og skriver aldri `dji_log_id`/`dji_file_name` på den eksisterende raden. Da gjentar problemet seg i det uendelige.

## Kan vi stole på ID-en vi skriver?

Nei — ikke for gamle rader. Den numeriske logg-ID-en (9 sifre) tilhører DroneLog-kontoen/API-nøkkelen som listet loggen, ikke DJI selv. Etter overgangen til personlige DroneLog-nøkler kan samme fysiske flytur få ny ID, og det var nettopp derfor eksakt ID-match feilet tidligere. En tilbakeføring av gamle ID-er fra `pending_dji_logs` ville derfor kunne skrive ID-er som aldri dukker opp igjen i listen — de gjør ingen skade, men gir heller ingen garantert gevinst.

Det vi **kan** stole på:
- `dji_file_name` (`DJIFlightRecord_2026-06-02_[17-12-51].txt`) kommer fra selve loggfilen og er stabil på tvers av kontoer og nøkler.
- ID-er som skrives via selvlæring — de kommer fra nøyaktig den listen brukeren ser akkurat nå, så de er per definisjon riktige for den nøkkelen.

Planen bygger derfor på filnavn + signatur som sannhet, og bruker ID kun som rask snarvei skrevet fra en faktisk listing.

## Løsning

### 1. Ingen blind ID-tilbakeføring
Vi tilbakefører ikke gamle numeriske ID-er fra `pending_dji_logs`, siden de kan tilhøre en annen DroneLog-nøkkel. Matching av gamle logger skjer på filnavn og signatur (start ±3 min, varighet ±2 min), som allerede virker, og riktig ID skrives automatisk første gang loggen faktisk dukker opp i listen.


### 2. Duplikattreff skal lære (viktigste fiksen)
Når importen finner et SHA-256-duplikat skal den eksisterende flyloggen oppdateres med DJI-listens `dji_log_id` og `fileName` dersom feltene er tomme, før meldingen «allerede importert» vises. Gjelder alle tre stiene:
- enkeltimport fra DJI-sky (`checkDuplicate` / `findMatchingFlightLog` i `UploadDroneLogDialog.tsx`),
- bulkimport fra DJI-sky (`checkDuplicateAll`),
- batchbehandling (`BatchLogPanel.tsx`).

Brukermelding endres fra ren «duplikat» til «Allerede importert – merket, blir skjult heretter».

### 3. Signaturmatch også mot pending-køen
I `annotateDjiImportStates` (`process-dronelog`) matches i dag `pending_dji_logs` kun på eksakt ID. Utvid til samme signaturmatch (tidspunkt/varighet) slik at logger som ligger til behandling med en annen ID også merkes som «Til behandling» og skjules.

### 4. Selvlæring også på filnavn i pending
Når en pending-rad signaturmatches, lagres listens `dji_log_id` på pending-raden når den er tom, slik at neste listing treffer eksakt.

## Teknisk

- Data: én `UPDATE`-spørring for tilbakeføringen (ca. 263 rader).
- Kode: `src/components/UploadDroneLogDialog.tsx`, `src/components/upload/BatchLogPanel.tsx`, `supabase/functions/process-dronelog/index.ts`.
- i18n: nye/endrede nøkler for duplikatmeldingen i både `no.json` og `en.json`.
- Ingen endringer i RLS, tilgangsregler eller databaseskjema.

## Verifisering

- Kjør TypeScript-sjekk og `deno check` for `process-dronelog`.
- Kontroller i databasen at antall flylogger med `dji_log_id` øker etter tilbakeføringen, og at ingen andre felter er rørt.
- I preview: åpne DJI-listen, bekreft at flere logger skjules som standard, og at en logg som fortsatt dukker opp og gir «allerede importert» forsvinner permanent etter ett forsøk.
