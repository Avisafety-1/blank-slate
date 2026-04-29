Plan for ny «Under opplæring»-funksjon

Målet er at admin kan sette en godkjent bruker i opplæringsmodus, velge hvilke hovedmoduler brukeren får se før kurs er bestått, og la kurs automatisk låse opp flere hovedmoduler etter bestått kurs.

Brukeropplevelse

1. Admin > Brukere > Godkjente brukere
- Legg til toggle «Under opplæring» på hver godkjente bruker.
- Når togglen er på, vis en liten modulvelger ved brukeren:
  - Oppdrag
  - Kart
  - Dokumenter
  - Kalender
  - Hendelser
  - Status
  - Ressurser
- Modulene valgt her er brukerens grunn-tilgang mens vedkommende er under opplæring.
- Brukere som ikke er «Under opplæring» påvirkes ikke og får dagens tilgang.
- Admin/superadmin bør ikke låses ute av adminfunksjoner; denne styringen gjelder appens hovedmeny/dashboard-moduler for operativ bruk.

2. Admin > Opplæring > Kurseditor
- Legg til seksjonen «Låser opp moduler ved bestått kurs» i kursdetaljer.
- Admin velger samme hovedmoduler per kurs.
- Når en bruker består kurset, får brukeren tilgang til disse modulene i tillegg til modulene som er valgt direkte på brukeren.

3. Hovedmeny og dashboard
- Header/hamburgermeny viser bare moduler brukeren har tilgang til når «Under opplæring» er på.
- Dashboard viser bare widgets som hører til tillatte moduler:
  - Dokumenter-widget styres av Dokumenter
  - Kalender-widget styres av Kalender
  - Status-widget styres av Status
  - Oppdrag-widget styres av Oppdrag
  - Hendelser-widget styres av Hendelser
  - KPI/ressursrelatert widget styres av Ressurser/Status etter eksisterende bruksmønster
  - Nyheter kan fortsatt vises som generell info, med mindre vi ønsker å skjule den senere
- «Start flyging» skal ikke vises mens «Under opplæring» er på, uansett hvilke moduler som er valgt.
- «Logg flytid / Last opp flylogg» skjules også i opplæringsmodus for å unngå at bruker registrerer operativ flyging før opplæring er avsluttet.

4. Direkte URL-beskyttelse
- Hvis en bruker under opplæring går direkte til en låst rute, vises en enkel «Modulen krever opplæring»/«Ikke tilgjengelig ennå»-side med lenke tilbake til dashboard.
- Dette gjelder hovedrutene: /oppdrag, /kart, /dokumenter, /kalender, /hendelser, /status og /ressurser.

Teknisk plan

1. Databaseendring
- Legg til felt på `profiles`:
  - `under_training boolean not null default false`
  - `training_module_access text[] not null default '{}'`
- Legg til felt på `training_courses`:
  - `unlocks_modules text[] not null default '{}'`
- Legg til en valideringsfunksjon/trigger eller CHECK for at modulverdier bare kan være kjente nøkler, f.eks. `missions`, `map`, `documents`, `calendar`, `incidents`, `status`, `resources`.
- RLS bruker eksisterende policies for profiles/training_courses. Ingen ny roller-tabell trengs fordi dette ikke er en rolle, men et tilgangsflagg/modulvalg knyttet til opplæring.

2. Felles moduldefinisjon
- Opprett en liten frontend-konfigurasjon for opplæringsmoduler, med nøkkel, norsk navn, rute og dashboard-komponent-kobling.
- Bruk denne samme listen i Admin, Kurseditor, Header, route guard og dashboardfiltrering slik at navn og regler holdes konsistente.

3. AuthContext
- Hent `under_training` og `training_module_access` sammen med profil.
- Hent beståtte `training_assignments` for innlogget bruker og tilhørende `training_courses.unlocks_modules`.
- Beregn effektiv tilgang:
  - Hvis `under_training = false`: full tilgang som i dag.
  - Hvis `under_training = true`: `training_module_access` + moduler fra beståtte kurs.
- Eksponer i `useAuth()`:
  - `underTraining`
  - `trainingModuleAccess`
  - `hasTrainingModuleAccess(moduleKey)`
- Cache dette sammen med eksisterende profilcache for å unngå blinking ved refresh.

4. Admin.tsx
- Utvid `Profile`-typen og profilsøk.
- Legg til funksjoner for å toggle `under_training` og oppdatere `training_module_access`.
- Desktop: legg «Under opplæring» som egen kompakt toggle i samme rad som de andre brukerrettighetene, med popover for modulvalg når aktiv.
- Mobil: legg toggle og modulvalg i eksisterende bruker-popover.
- Oppdater lokal state etter lagring og vis toast ved feil/suksess.

5. TrainingCourseEditor.tsx
- Last inn og lagre `unlocks_modules` på kurset.
- Legg modulvalg i kursdetaljer-kortet, med kort hjelpetekst: «Disse modulene blir tilgjengelige for brukere under opplæring når kurset er bestått.»

6. Header og ruter
- Filtrer menyknapper i `Header.tsx` basert på `hasTrainingModuleAccess`.
- Legg en `TrainingModuleRestricted` wrapper rundt hovedrutene i `App.tsx`.
- Admin-ruten beholdes tilgjengelig for adminbrukere, slik at en admin under opplæring ikke mister mulighet til administrasjon.

7. Dashboard
- I `Index.tsx` filtreres dashboard-layouten basert på effektive modultilganger.
- Skjul mobile og desktop «Start flyging» når `underTraining` er true.
- Skjul flylogg-knapper når `underTraining` er true.
- Sørg for at lagret dashboard-layout i localStorage ikke krasjer dersom en widget er skjult; filtreringen skjer ved rendering, ikke ved å overskrive brukerens lagrede layout.

Viktige avgrensninger i første versjon
- Dette styrer synlighet/tilgang i frontend for hovedmoduler og dashboard. Eksisterende database-RLS for underliggende data endres ikke til per-modulnivå i denne runden.
- «Under opplæring» er ikke en rolle og lagres ikke i `user_roles`.
- Når admin slår av «Under opplæring», får brukeren full normal tilgang igjen, men modulvalgene beholdes slik at de kan brukes på nytt senere hvis togglen slås på igjen.