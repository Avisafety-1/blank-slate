Plan for endringen:

1. Vis effektiv modultilgang under «Godkjente brukere»
   - Admin-listen skal ikke bare vise `profiles.training_module_access`, men også moduler som brukeren har låst opp via beståtte kurs.
   - Jeg legger inn en egen innlasting i `Admin.tsx` som henter beståtte `training_assignments` med `training_courses(unlocks_modules)` for de godkjente brukerne som vises.
   - For hver bruker slås manuell tilgang + kurs-opplåst tilgang sammen og normaliseres, slik at telleren og listen viser det brukeren faktisk har tilgang til mens «Under opplæring» er på.
   - Visuelt kan kurs-opplåste moduler gjerne markeres som «via kurs»/låst i listen, slik at admin forstår hvorfor de vises selv om de ikke ble manuelt krysset av.

2. Gjør kurs-opplåst tilgang robust ved fullføring av kurs
   - I dag oppdateres AuthContext for innlogget bruker etter bestått kurs, men selve `profiles.training_module_access` oppdateres ikke nødvendigvis.
   - Jeg anbefaler å legge inn en database-trigger/funksjon som ved bestått kurs synkroniserer kursets `unlocks_modules` inn på brukerens profil når `training_assignments.passed = true`.
   - Da blir adminlisten, klient-cache og alle fremtidige innlastinger konsistente, også dersom kurs fullføres fra en annen enhet eller admin ser siden samtidig.
   - Triggeren skal kun legge til moduler; den skal ikke fjerne eksisterende manuell tilgang.

3. Legg til «Åpne alle moduler» i kurs-modul-velgeren
   - Utvider `TrainingModulePicker` med en valgfri knapp/handling: «Åpne alle moduler».
   - Når den brukes på en bruker under «Godkjente brukere», settes `under_training = false` og `training_module_access = []` for profilen.
   - Dette gir full tilgang til alle hovedmoduler og gjenåpner også `StartFlightDialog`, fordi eksisterende logikk bruker `underTraining=false` som full tilgang.
   - Handlingen skal være deaktivert hvis admin ikke har tilgang til rolle-/tilgangsstyring.

4. Oppdater UI-state og egen session umiddelbart
   - Etter «Åpne alle moduler» oppdateres lokal `profiles`-state i adminlisten med en gang.
   - Hvis admin gjør dette på sin egen bruker, kjøres `refetchUserInfo()` slik at header, dashboard, rutevakter og start flyging oppdateres uten logout/reload.
   - Eksisterende `toggleUnderTraining`-logikk gjenbrukes/utvides der det passer, slik at vi ikke får to ulike måter å slå av opplæringsmodus på.

5. QA-sjekker etter implementering
   - Bruker under opplæring med manuelle moduler: listen viser riktig antall og valgte moduler.
   - Bruker under opplæring som består kurs: adminlisten viser de nye kurs-opplåste modulene.
   - «Åpne alle moduler» slår «Under opplæring» av og skjuler modulvelgeren.
   - Brukeren får full tilgang, inkludert mulighet til å starte flyging.

Tekniske detaljer:

- Aktuelle filer:
  - `src/pages/Admin.tsx`
  - `src/components/training/TrainingModulePicker.tsx`
  - eventuelt `src/contexts/AuthContext.tsx` hvis vi vil gjenbruke samme effektive tilgangsberegning
  - ny Supabase-migrasjon for trigger/funksjon

- Foreslått databasefunksjon:
  - En `SECURITY DEFINER`-funksjon med eksplisitt `search_path = public`.
  - Trigger på `public.training_assignments` ved INSERT/UPDATE når `NEW.passed = true`.
  - Henter `training_courses.unlocks_modules` og unionerer dem inn i `profiles.training_module_access` for `NEW.profile_id`.

- Viktig produksjonshensyn:
  - Triggeren påvirker kun brukere som består kurs med `unlocks_modules` satt.
  - Brukere som ikke er «Under opplæring» har fortsatt full tilgang uansett, så dette skal ikke begrense eksisterende betalende brukere.
  - «Åpne alle moduler» gjør eksplisitt det samme som å slå av «Under opplæring»: full tilgang og tømming av restdata for manuell modultilgang.