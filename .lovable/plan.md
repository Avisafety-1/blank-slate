

## Rotårsak

Problemet er **ikke** lagring/Storage RLS — den er allerede satt opp riktig for delte dokumenter (`get_user_visible_company_ids`). Den faktiske årsaken er at sjekklister fra mor-selskapet aldri når frem til `ChecklistExecutionDialog` med korrekt `fil_url`/innhold:

1. **AddMissionDialog kopierer `operations_checklist_ids` fra dronen**, men kun fra droner i samme selskap (den finner ikke ID-er for sjekklister som kun er synlige via `visible_to_children`-arv). Når oppdraget opprettes, lagres derfor en tom eller ufullstendig `missions.checklist_ids`.

2. I **StartFlightDialog** brukes `useChecklists()` for **company-level** liste (mor-arv fungerer der), men `mission.checklist_ids` lastes direkte fra `missions`-raden uten arv-fallback.

3. I **MissionStatusDropdown** spørres `drones`-tabellen direkte for `post_flight_checklist_id`. SELECT-policyen på `drones` tillater å se delte droner, men hvis dronen tilhører mor-selskapet og sjekkliste-IDen er der, fungerer dette i seg selv.

4. **ChecklistExecutionDialog** har en silent-fail `try/catch` rundt `documents`-spørringen som setter både `items=[]` og `imageUrl=null` ved enhver feil → "Ingen punkter i sjekklisten". Det finnes ingen logging eller feilmelding til bruker.

5. **`get_parent_company_id`** brukt i RLS for `documents` returnerer kun **direkte mor**, ikke hele hierarkiet. Dersom dokumentet er delt fra et oldeforeldre-selskap eller indirekte mor, blir SELECT blokkert stille.

## Plan (i default-mode etter godkjenning)

### 1. Fiks ChecklistExecutionDialog — eksplisitt feilhåndtering
- Logg `console.error` ved Supabase-feil i fetch
- Vis konkret feilmelding ("Sjekklisten kunne ikke lastes — sjekk delingstilstanden") i stedet for "Ingen punkter"
- Hvis `data.fil_url` finnes men ikke parses som JSON → behandle som fil-modus uansett MIME (PDF/DOCX/XLSX), og vis "Åpne sjekkliste"-knapp + "Marker som utført"-knapp i stedet for `<img>`

### 2. Fiks RLS for arvet dokumentsynlighet
- Erstatt `get_parent_company_id(profiles.company_id)` i `documents` SELECT-policy med en sjekk mot hele hierarkiet (bruk eksisterende `get_ancestor_company_ids` eller lag tilsvarende SECURITY DEFINER-funksjon)
- Speil samme endring for `storage.objects` documents-policyen om nødvendig

### 3. Fiks sjekkliste-snapshot ved oppdragsopprettelse
- I `AddMissionDialog` (linje ~582-715): når `operations_checklist_ids` hentes fra droner, tillat lesning fra droner uavhengig av eierselskap (RLS tillater allerede SELECT av delte droner)
- Legg til verifisering at IDene faktisk peker på dokumenter brukeren kan lese

### 4. Verifisering
- Test ende-til-ende: opprett sjekkliste i mor-selskap (`visible_to_children=true`), knytt til delt drone, opprett oppdrag i underavdeling, start flytur → sjekkliste-dialog skal vise PDF-knapp og "Marker som utført"

### Filer som endres
- `src/components/resources/ChecklistExecutionDialog.tsx`
- `src/components/dashboard/AddMissionDialog.tsx`
- Ny migrasjon for oppdatert `documents` SELECT RLS-policy

