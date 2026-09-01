# Hvorfor «57 allerede importert» ikke endrer seg

Å logge inn og ut av DJI hjelper ikke — problemet er ikke sesjonen, men hvilke selskaper vi leter i når vi sjekker om en logg allerede finnes.

## Bekreftet årsak

- support@avisafe.no ligger i selskapet **Moderavdeling**.
- Filtreringen sjekker i dag kun: eget selskap + direkte moderselskap + direkte underavdelinger.
- Loggene Rikard har importert ligger i selskapet **Avisafe** (128 flylogger, 31 med DJI-ID) — et eget rotselskap som ikke er med i dette utvalget.

Eksempel: DJI-listen viser fortsatt `DJIFlightRecord_2025-07-14_[22-50-33].txt` (8 min), men den finnes allerede som flylogg i Avisafe med DJI-ID `657696393`. Fordi Avisafe ikke er i søkeområdet blir loggen aldri gjenkjent — verken på ID, filnavn eller tidssignatur.

De 57 som skjules i dag er de som tilfeldigvis ligger i Moderavdeling-hierarkiet.

## Hva som skal endres

1. **Utvid søkeområdet ved gjenkjenning**
   Bruk samme selskapsutvalg som resten av appen (`get_user_visible_company_ids`) i stedet for «eget + forelder + barn», slik at hele hierarkiet brukeren faktisk har tilgang til dekkes — inkludert rotselskap og søsken-/barnebarnavdelinger. Gjelder oppslag mot `flight_logs`, `pending_dji_logs` og `dji_sync_jobs`.

2. **Samme utvalg ved duplikatsjekk under import**
   Import-/duplikatlogikken må bruke nøyaktig samme selskapsutvalg, ellers kan en logg bli skjult i listen men fortsatt forsøkt importert (eller motsatt).

3. **Litt mer robust signaturmatch**
   - Ta med rader der `flight_date` er satt til midnatt men `start_time_utc` har korrekt klokkeslett (i dag kan tidsvindufilteret hoppe over dem).
   - Fallback: hvis tidsstempel mangler, utled tidspunkt fra filnavnet (`DJIFlightRecord_YYYY-MM-DD_[HH-MM-SS]`) tolket i norsk lokaltid.

4. **Selvlæring beholdes**
   Når en listet logg matcher en eksisterende flylogg, skrives DJI-ID og filnavn på den flyloggen, slik at neste listing matcher direkte.

## Teknisk

- Fil: `supabase/functions/process-dronelog/index.ts` — funksjonen `annotateDjiImportStates` (selskapsutvalg linje 70–80, tidsvindu 82–96, signaturmatch 135–165) og duplikatsjekken i importflyten.
- Selskapsutvalg hentes via RPC `get_user_visible_company_ids(auth.uid())` med fallback til dagens logikk hvis kallet feiler.
- Ingen databaseendringer, ingen endringer i RLS eller tilgangsregler. Kun lesing i bredere, allerede tillatt selskapsutvalg.

## Forventet resultat

Etter endringen skal DJI-listen for support@avisafe.no skjule alle logger som allerede finnes som flylogger i hele det synlige hierarkiet (inkludert Avisafe), ikke bare de 57.
