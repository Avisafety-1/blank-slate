# Gjennomgang: flytting av drone med dokumenter og sjekklister

## Slik fungerer det i dag

Når du flytter en drone velger du per dokument/sjekkliste: **flytt med**, **del** eller **la bli**. Selve flyttingen gjøres av én operasjon i databasen (`transfer_drone`), som i tillegg flytter dronens loggbok, inspeksjoner, utstyrshistorikk og dokumentkoblinger, fjerner dronens avdelingsdeling og skriver en loggpost om flyttingen.

Dokumentlogikken er delvis god allerede:

- **Flytt med**, når avdelingen faktisk eier dokumentet: eierskapet følger dronen.
- **Flytt med**, når en annen avdeling (typisk morselskapet) eier dokumentet: eierskapet røres ikke, mottakeravdelingen får kun lesetilgang. Dette er riktig.
- **Del**: mottakeravdelingen får lesetilgang, eierskapet står.

## Tre reelle problemer jeg fant

**1. «La bli» fjerner ikke sjekklisten fra dronen** (viktigst)

Sjekklister ligger to steder: som en vanlig dokumentkobling, og som en ID direkte i dronens felt for driftssjekklister / etterflyging / inspeksjon. Når du velger «la bli», slettes bare dokumentkoblingen — ID-en i dronens sjekklistefelt blir stående. Dronen ankommer da den nye avdelingen med en sjekkliste som ingen der har tilgang til: den vises ikke i droneskjemaet, kan ikke åpnes og kan ikke fjernes.

Dette er nøyaktig situasjonen vi ryddet opp i manuelt på LN.0510.CE og 14 andre Tensio-droner. Flytteflyten er altså en av kildene til problemet.

**2. «Flytt med» kan ta dokumentet fra droner som blir igjen**

Dialogen advarer om kryssbruk kun når dokumentet er koblet til andre droner via dokumentkoblingen. Den ser ikke at dokumentet også brukes som sjekkliste direkte på andre droner, eller er knyttet til oppdrag, i avgivende avdeling. Flytter du eierskapet i et slikt tilfelle, mister de gjenværende dronene og oppdragene tilgang uten varsel.

**3. «Flytt med» sier «flytt» selv når systemet bare deler**

Når morselskapet eier dokumentet gjør systemet det trygge valget (deling), men brukeren har valgt og fått bekreftet «flytt med». Resultatet stemmer ikke med det som står i grensesnittet.

## Hva jeg foreslår

**A. Rydd sjekklistefeltene ved flytting**
`transfer_drone` oppdaterer dronens sjekklistefelt i takt med valget:
- «la bli» → ID-en fjernes fra dronens driftssjekklister, etterflyging og inspeksjonssjekkliste.
- «flytt med» / «del» → ID-en beholdes, siden tilgangen følger med.
Etter flytting kan ingen drone sitte igjen med en sjekkliste den nye avdelingen ikke ser.

**B. Full kryssbruk-sjekk i dialogen**
Utvid varselet til også å dekke dokumenter som brukes som sjekkliste på andre droner eller er knyttet til oppdrag i avgivende avdeling. For disse er «flytt med» sperret, og «del» er forhåndsvalgt — samme prinsipp som i dag for utstyr.

**C. Sikkerhetsnett ved eierskifte**
Når et dokument faktisk bytter eier fordi det følger dronen, gis avgivende avdeling automatisk lesetilgang til det, slik at gjenværende bruk ikke brytes.

**D. Riktig ordlyd**
Der dokumentet eies av en annen avdeling, vises valget som «del med mottaker (eies av X)» i stedet for «flytt med», slik at valget stemmer med det som faktisk skjer.

## Teknisk

- `public.transfer_drone(uuid, uuid, text, jsonb)` oppdateres (SECURITY DEFINER, `search_path = public`, eksisterende rettigheter beholdes):
  - i `leave`-grenen for `document`: `array_remove(operations_checklist_ids, _resource_id::text)`, samt nullstilling av `post_flight_checklist_id` og `sjekkliste_id` når de peker på dokumentet.
  - i `move`-grenen ved reelt eierskifte: `INSERT INTO document_department_visibility (document_id, company_id) VALUES (_resource_id, _from_company_id) ON CONFLICT DO NOTHING`.
- `MoveDroneDialog.tsx`: utvid kryssbruk-deteksjon med oppslag mot `drones.operations_checklist_ids`/`post_flight_checklist_id`/`sjekkliste_id` (andre droner i avgivende avdeling) og `mission_documents`/`missions.checklist_ids`; sett `crossLinked` og deaktiver «flytt med». Hent `documents.company_id` for de aktuelle dokumentene og bytt etikett når eier ≠ avgivende avdeling.
- Nye i18n-nøkler under `resourceDialogs.moveDrone` i `no.json` og `en.json` (eid av annen avdeling, brukt på andre droner, brukt på oppdrag).
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
