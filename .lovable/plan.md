
Mål: fikse at mapper med «Synlig for alle avdelinger» faktisk blir synlige for avdelingsbrukere.

Hva jeg har funnet
- `document_folders`, `document_folder_items` og `document_folder_tabs` har nå egne delingsregler, men logikken er duplisert flere steder.
- `FolderGrid` skjuler feil ved lesing: hvis `document_folders`-spørringen feiler eller returnerer uventet tomt, behandles det som `[]`, så UI ser bare tomt ut.
- Arkitekturen deres har allerede et tydelig skille mellom:
  - `get_user_visible_company_ids()` for operativt eierskap
  - `get_user_readable_company_ids()` for lesing oppover/nedover i hierarkiet
- For mapper er dette en lese-/delingsfunksjon, så dagens policy-oppsett er sannsynligvis for skjørt og bør forenkles.

Plan
1. Samle mappe-leselogikken i én sikker tilgangsregel
- Lage én felles, sikker regel for “kan denne brukeren lese denne mappen?” i databasen.
- Bruke eksisterende hierarki-funksjoner i stedet for å gjenta parent-subqueries i hver policy.
- Dette gjør at selve mappen blir vurdert likt overalt.

2. Bytte SELECT-policyene for mappe-tabellene til samme regel
- Oppdatere SELECT på:
  - `document_folders`
  - `document_folder_items`
  - `document_folder_tabs`
- Målet er at mappe, faner og innhold følger samme delingsregel og ikke kan komme ut av sync.

3. Beholde skrivetilgang streng
- INSERT/UPDATE/DELETE skal fortsatt kun være for selskapet som eier mappen.
- Deling til avdelinger skal bare gi lesetilgang, ikke redigering.

4. Gjøre frontend robust ved feil
- Oppdatere `FolderGrid.tsx` så feil fra Supabase ikke blir tolket som “ingen mapper”.
- Hvis lesing feiler, skal vi få tydelig feil i konsoll/UI i stedet for en stille tom visning.
- Dette gjør videre feilsøking mye enklere dersom noe fortsatt blokkeres av RLS.

5. Verifisere hele flyten med deling
- Testscenario:
  1. Logg inn som moderavdeling
  2. Opprett/åpne mappe
  3. Slå på “Synlig for alle avdelinger”
  4. Bytt til avdeling / test avdelingsbruker
  5. Bekreft at mappen vises i grid
  6. Bekreft at faner og dokumenter i mappen vises
  7. Bekreft at avdelingen ikke kan redigere/slette morselskapets mappe

Hvis nødvendig i samme runde
- Hvis mappen blir synlig, men dokumentene inni fortsatt ikke kan åpnes fra avdeling, justerer jeg også dokument-lesing slik at delt mappeinnhold ikke stopper på underliggende dokument-RLS.

Tekniske detaljer
```text
Før:
UI -> document_folders policy A
   -> document_folder_items policy B
   -> document_folder_tabs policy C
   -> feil i én av dem ser bare ut som “tomt”

Etter:
UI -> felles mappe-leseregel
   -> folders/items/tabs bruker samme regel
   -> frontend viser faktisk feil hvis lesing feiler
```

Filer / områder som endres
- Database-migrasjon for RLS på:
  - `document_folders`
  - `document_folder_items`
  - `document_folder_tabs`
- `src/components/documents/FolderGrid.tsx`
- Eventuelt `src/components/documents/FolderDetailDialog.tsx` hvis jeg må justere lesing av delt innhold i samme flyt
