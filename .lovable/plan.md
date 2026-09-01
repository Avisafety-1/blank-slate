# Hvorfor ingen logger merkes som «allerede importert» for hauggard@gmail.com

## Hva loggene faktisk viser

Edge function-loggene for `process-dronelog` i dag:

```text
16:31  annotate: 110 logger, 57 kjente   (support@avisafe.no)
16:38  annotate: 110 logger,  0 kjente   (hauggard@gmail.com)
16:39  annotate: 110 logger,  0 kjente
16:40  annotate: 110 logger,  0 kjente
```

Annoteringen kjører altså helt riktig — den finner bare ingen treff.

Årsaken er en ren selskaps-mismatch:

- `hauggard@gmail.com` har profil-selskap **Elverum Videregående Skole**.
- DJI-kontoen som er lagret på brukeren er **rikardvb@gmail.com**, og den credential-raden peker på selskapet **Avisafe**.
- De 110 loggene i listen er rikardvb sine flyturer, og de er importert til **Avisafe / Moderavdeling** — ikke til Elverum.
- Elverum har 218 egne flylogger (101 med `dji_log_id`), men de kommer fra andre DJI-kontoer (sverrerass@hotmail.com / martinsm93@gmail.com) og finnes ikke i denne listen.

Så: null treff er teknisk korrekt gitt dagens regel «filtrer kun innenfor eget selskap + mor + avdelinger». Det er igjen superadmin-unntaket der én DJI-konto brukes på tvers av flere selskaper.

## Forslag: ta med selskapet som DJI-kontoen er knyttet til

Minimal og trygg utvidelse som ikke endrer noe for vanlige brukere:

Når vi bygger selskapsomfanget i annoteringen, legg til `company_id` fra brukerens rad i `dji_credentials` (pluss dens mor/avdelinger), i tillegg til profil-selskapet.

- For vanlige brukere er `dji_credentials.company_id` identisk med profil-selskapet → ingen endring i oppførsel i det hele tatt.
- For superadmin som bruker samme DJI-konto på flere selskaper vil loggene som allerede er importert i det selskapet DJI-kontoen ble knyttet til, bli gjenkjent og filtrert bort.

Alternativt (hvis du heller vil beholde dagens strenge regel): la det stå som det er, og godta at listen ikke filtreres når du tester fra et selskap som ikke eier importene.

## Teknisk

Fil: `supabase/functions/process-dronelog/index.ts`, funksjonen `annotateDjiImportStates`.

- Signaturen tar i dag kun `companyId`. Utvid til å slå opp `dji_credentials.company_id` for den innloggede brukeren (service client) og legg denne inn i `companyIds`-settet før mor/barn-oppslaget, slik at mor/avdelinger også utledes for den.
- Ingen endringer i RLS, tabeller, kolonner eller matchings-toleranser (`±3 min` start, `±2 min` varighet). Selvlæringen av `dji_log_id`/`dji_file_name` fungerer som før, men vil nå også kunne treffe rader i credential-selskapet.
- Ingen frontend-endringer nødvendig; `importState` og «Se alle»-bryteren fungerer uendret.
