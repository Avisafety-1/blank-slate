# Duplikate "til behandling"-logger hos Elverum vgs

## Bekreftet: ja, det stemmer

Sjekk mot databasen for Elverum Videregående Skole:

- 97 logger ligger til behandling, 386 er ferdig behandlet.
- **91 av de 97** har nøyaktig samme filsignatur (sha256) som en logg som allerede er behandlet og har en ferdig flylogg. De er altså reelle duplikater.
- 77 av dem har numerisk DroneLog-ID (kom fra nattsynken), resten sha-baserte ID-er.
- De ble opprettet 26.08 (40 stk), 27.08 (40 stk) og 01.09 (11 stk).

## Hvorfor de ble laget

Nattsynken hopper over en logg hvis filsignaturen allerede finnes i `flight_logs.dronelog_sha256`. For 79 av de 80 duplikatene fra 26.–27.08 er **den kolonnen tom** på den ferdige flyloggen.

Årsaken ligger i importflyten: når man knytter en logg til et **eksisterende** oppdrag (`handleLinkToMission`) fjernes `dronelog_sha256` bevisst fra raden før innsetting (for å unngå unik-konflikt), og samme skjer når man oppretter nytt oppdrag på en logg som allerede fantes. Da mister systemet den eneste nøkkelen nattsynken sjekker mot, og henter loggen på nytt.

Dedupe mot ventende rader (lagt inn 02.09) fanger dette fremover, men de eksisterende 91 radene ligger igjen.

## Fiks

1. **Rydd opp de eksisterende duplikatene**: slett de ventende radene der filsignaturen allerede finnes på en behandlet rad med ferdig flylogg. Kun `status = 'pending'`, aldri behandlede logger eller flylogger. Kjøres for alle selskaper med samme mønster, ikke bare Elverum.
2. **Fyll inn manglende filsignatur på flylogger**: der en behandlet ventende rad peker på en flylogg uten `dronelog_sha256`, skriv signaturen inn på flyloggen. Da får nattsynken igjen en treffsikker nøkkel.
3. **Slutt å nulle ut signaturen ved import**: i stedet for å fjerne `dronelog_sha256` når det finnes en duplikatlogg, beholdes den på den nye raden. Hvis unik-indeksen hindrer det, byttes den mot en "duplikat"-markering slik at signaturen fortsatt lagres og kan brukes til dedupe.
4. **Ekstra sjekk i synken**: nattsynken sammenligner også starttid (±3 min) og varighet (±2 min) mot behandlede flylogger, ikke bare mot ventende rader — slik at manglende signatur ikke alene gir duplikat.

## Teknisk

- Opprydding og signatur-utfylling kjøres som engangs datajobb (SQL), ikke migrasjon. Ingen endring i tabellstruktur, tilgangsregler eller grants.
- `src/components/UploadDroneLogDialog.tsx`: `handleCreateNew` (linje ~2233) og `handleLinkToMission` (linje ~2319) slutter å strippe `dronelog_sha256`; unik-konflikt håndteres eksplisitt.
- `supabase/functions/dji-sync-worker/index.ts` og `dji-sync-enqueue/index.ts`: signaturmatch også mot `flight_logs`.

## Verifisering

- Etter opprydding: tell ventende logger for Elverum og bekreft at ingen av dem har en signatur som finnes på en behandlet logg (forventet fall fra 97 til ca. 6).
- Bekreft at alle behandlede flylogger med kjent signatur har `dronelog_sha256` utfylt.
- Kjør synken manuelt og bekreft at ingen duplikater gjenoppstår.
