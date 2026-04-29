Du har rett — knappen jeg la inn havnet i modulvelgeren for enkeltbrukere under «Godkjente brukere», ikke i kursinnstillingene som vises på skjermbildet. Det bør rettes.

Plan for å fikse det:

1. Legg knapp i kursinnstillingene
   - I `TrainingCourseEditor` legger jeg inn en tydelig knapp i seksjonen «Låser opp moduler ved bestått kurs»:
     - «Lås opp alle moduler» når ikke alle er valgt.
     - Eventuelt «Fjern alle»/vanlig avkryssing for å justere etterpå.
   - Knappen setter `unlocksModules` til alle modulnøkler fra `TRAINING_MODULE_KEYS`.

2. Gjør «alle moduler» til faktisk full tilgang etter bestått kurs
   - Hvis et kurs låser opp alle moduler, skal bestått kurs ikke bare krysse av alle modulene — det skal også slå av `under_training` for brukeren.
   - Da får brukeren full tilgang, inkludert `StartFlightDialog`, fordi eksisterende tilgangslogikk krever `under_training = false` for å starte flyging.

3. Oppdater database-triggeren fra forrige endring
   - Triggeren `sync_training_assignment_unlocked_modules` skal endres slik at:
     - Hvis kurset låser opp alle moduler: `profiles.under_training = false` og `training_module_access = '{}'`.
     - Hvis kurset bare låser opp noen moduler: den legger modulene til i `training_module_access`, som nå.
   - Dette gjør at fullføring fra mobil/iPad/annen enhet også gir riktig tilgang uten manuell admin-handling.

4. Behold adminlisten konsistent
   - Adminlisten vil fortsatt vise kurs-opplåste moduler for brukere som er under opplæring.
   - Når et kurs låser opp alle moduler, vil brukeren ikke lenger stå som «Under opplæring», og modulvelgeren skjules — riktig, siden vedkommende da har full tilgang.

5. QA-sjekk
   - I kurseditor: trykk «Lås opp alle moduler» → alle moduler markeres.
   - Lagre kurs → `unlocks_modules` inneholder alle moduler.
   - Bruker består kurs → `under_training` slås av.
   - Bruker får full tilgang og kan starte flyging.