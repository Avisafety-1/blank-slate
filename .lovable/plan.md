# Rikere e-postvarsel ved nytt oppdrag

## Mål
E-posten som går ut når et nytt oppdrag opprettes skal vise hvem som er tilknyttet (med rolle), hvilke ressurser som er tildelt, og luftromsvarsler for området – i tillegg til dagens tittel, status, lokasjon, tidspunkt og beskrivelse.

## Nåværende tilstand (verifisert)
- Varselet sendes fra `AddMissionDialog.tsx` (`notify_new_mission`) og rendres i edge-funksjonen `send-notification-email` med malen `mission_notification`.
- Dialogen sender allerede med personellnavn, droner, utstyr, kunde, risikonivå og rutelengde i payloaden – men malen bruker dem ikke, og personell sendes uten rolle.
- Luftromsvarsler beregnes allerede i dialogen av `AirspaceWarnings`, men fanges ikke opp (`onAirspaceResult` brukes ikke).
- Selskaper kan ha egne overskrevne maler i `email_templates` – nye variabler må derfor være valgfrie og vises tomme hvis de mangler.

## Endringer

### 1. Opprett-dialogen (`src/components/dashboard/AddMissionDialog.tsx`)
- Personell sendes med rolle: slå opp `role_id` i `company_mission_roles` (med arv fra morselskap, samme oppslag som dialogen allerede gjør) og send `personell: [{ navn, rolle }]`.
- Fang luftromsvarsler via `onAirspaceResult` på `AirspaceWarnings` (ny state) og send dem med i payloaden (type, sonenavn, nivå, melding).
- Send også med `oppdragstype` (evt. «Annet»-teksten) og `slutt_tidspunkt`.

### 2. Edge-funksjonen (`supabase/functions/send-notification-email/index.ts`)
- Utvid `mission`-typen med de nye feltene.
- Bygg nye malvariabler før rendering:
  - `{{mission_personnel}}` – én linje per person: «Navn – Rolle»
  - `{{mission_drones}}`, `{{mission_equipment}}` – punktlister
  - `{{mission_airspace_warnings}}` – advarsler med nivå (f.eks. gult/rødt markert), eller «Ingen kjente luftromskonflikter»
  - `{{mission_type}}`, `{{mission_end}}`, `{{mission_customer}}`, `{{mission_risk}}`
- HTML-escaping av alle brukerstyrte verdier.

### 3. Standardmaler (`supabase/functions/_shared/template-utils.ts` og `default-templates-en.ts`)
- Utvid `mission_notification` (norsk og engelsk) med nye rader i oppdragsboksen: personell m/rolle, droner, utstyr, kunde, oppdragstype, sluttidspunkt og en egen luftromsvarsel-blokk.
- Selskaper med egne maler beholder sin mal uendret; de kan legge inn de nye variablene selv via mal-editoren.

### 4. Mal-editoren (`src/components/admin/EmailTemplateEditor.tsx`)
- List opp de nye variablene for `mission_notification` slik at administratorer ser hva som er tilgjengelig.

## Forslag på mer info (inkludert hvis enkelt, ellers droppet)
- Direktelenke til oppdraget i appen (`https://app.avisafe.no/oppdrag` – oppdraget har ingen egen URL i dag, så lenken går til oversikten).
- Vær tas ikke med: varselet går ved opprettelse, ofte langt før tidspunktet, så værmeldingen ville vært misvisende.

## Tekniske detaljer
- Ingen databaseendringer – kun frontend + edge-funksjon (deployes automatisk).
- Verifisering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`, deretter opprett et testoppdrag og sjekk e-posten.
