# Plan: Filtrering av allerede importerte DJI-logger

## Mål
DJI-logglisten skal som standard kun vise logger som ikke allerede er importert eller sendt til behandling i AviSafe. En bryter («Se alle») skal vise hele listen, inkludert importerte logger med tydelig merking. «Velg alle» skal aldri velge logger som allerede er kjent som importerte/i behandling.

## Nåværende tilstand
- DJI-listen henter opptil 200 logger og viser alle uten importstatus.
- Duplikatsjekk skjer først etter at loggen er lastet ned og parset, via SHA-256. Det gir unødvendige API-kall ved «Velg alle».
- Auto-sync lagrer DJI sin numeriske logg-ID i `pending_dji_logs` og `dji_sync_jobs`.
- Manuell DJI-skyimport lagrer i dag SHA-256 i `pending_dji_logs.dji_log_id`, slik at den opprinnelige DJI-logg-IDen går tapt.
- `flight_logs` har unik SHA-256-indeks, men ingen kolonne for DJI sin logg-ID.

## Endringer

### 1. Database
- Legg til nullable kolonne `flight_logs.dji_log_id text`.
- Legg til en ikke-unik indeks på `(company_id, dji_log_id)` for rask oppslag.
- Tilbakefør `dji_log_id` til eksisterende flylogger der det finnes en godkjent `pending_dji_logs`-rad med numerisk DJI-ID og kobling til flyloggen.
- Ingen RLS-policyer eller tilgangsregler endres.

### 2. Merk DJI-listen med kjent status
- Utvid `dji-list-logs` i `process-dronelog` slik at hver logg får en AviSafe-status før listen returneres:
  - `imported`: finnes i `flight_logs` med samme DJI-logg-ID.
  - `pending`: finnes som ventende rad i `pending_dji_logs`.
  - `queued`: finnes i `dji_sync_jobs`.
  - `dismissed` / `unsupported`: vises med egen status når «Se alle» er på.
- Oppslaget skjer kun innen innlogget brukers aktive selskap.

### 3. Ny filterbryter i importdialogen
- Legg til en Switch øverst i DJI-logglisten:
  - Standard: «Kun nye logger» / «Se alle» av.
  - Når av: skjul logger som er importerte, ventende eller i synk-kø.
  - Når på: vis alle logger, men kjente logger får badge som «Importert», «Til behandling» eller «I kø» og kan ikke velges.
- Vis antall skjulte logger, f.eks. «12 allerede importert/i behandling er skjult».
- «Velg alle» velger kun synlige logger som faktisk kan importeres.

### 4. Bevar DJI-logg-ID ved nye importer
- Enkeltimport fra DJI-sky: lagre aktiv DJI-logg-ID på `flight_logs` ved oppretting, oppdatering og kobling til oppdrag.
- Bulkimport fra DJI-sky: bruk faktisk DJI-logg-ID i `pending_dji_logs.dji_log_id` fremfor SHA-256. SHA-256 ligger fortsatt i `parsed_result`.
- Behold eksisterende SHA-256-duplikatsjekk, men utvid pending-sjekken til også å finne eldre rader der SHA-256 ligger i `dji_log_id` eller `parsed_result`.
- Ved eventuell unik-konflikt på `(company_id, dji_log_id)` behandles loggen som allerede kjent, ikke som en feil.

### 5. Oversettelser
- Legg til nye nøkler i både `src/i18n/locales/no.json` og `src/i18n/locales/en.json` for filter, badges og tom-visning.

## Begrensning
- Logger som allerede ble importert via eldre manuell DJI-skyimport, der kun SHA-256 ble lagret, kan ikke alltid matches mot DJI-listen før loggen eventuelt parses igjen. Auto-sync-logger, tilbakeførte godkjente logger og alle nye importer etter denne endringen matches eksakt.

## Verifisering
- Kjør TypeScript-sjekk.
- Verifiser migrasjon uten endrede tilgangsregler.
- Test i preview at:
  - Nye logger vises som før.
  - Kjente/importerte logger skjules som standard.
  - «Se alle» viser dem med riktig badge.
  - «Velg alle» kun velger importerbare logger.
  - Importknappen ikke teller importerte logger.
