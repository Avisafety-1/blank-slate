# Rydde opp i koblinger til slettede dokumenter

## Hva jeg fant

Jeg skilte mellom to ting du spurte om.

**1. Koblinger som peker på dokumenter som ikke finnes**

| Sted | Tensio | Hele systemet |
|---|---|---|
| Sjekklister på oppdrag | 21 | 22 |
| Sjekklister på droner (drift, etterflyging, inspeksjon) | 0 | 0 |
| Sjekkliste på utstyr/batteri | 0 | 0 |
| Sjekkliste på vedlikeholdsplan | 0 | 0 |
| Standarddokumenter på oppdragstyper | 0 | 0 |
| Sjekkliste før avgang på selskap | 0 | 0 |

De 22 oppdragskoblingene peker på fire slettede dokumenter (ett av dem brukt på 16 oppdrag). Dronene er rene fordi vi ryddet dem manuelt tidligere — ikke fordi systemet fjerner koblingene selv.

Koblingstabellene (dokumenter på droner, oppdrag, mapper, e-postmaler) er derimot helt rene, fordi de rydder seg selv når et dokument slettes.

**2. Tomme dokumentrader (dokument uten fil)**

Tensio har 2: «Sjekkliste - Before takeoff» og «Rapportering - Feilsøking med drone». I hele systemet finnes 57.

Dette skjer fordi et dokument kan opprettes som en ren rad uten at en fil lastes opp — blant annet når man lager en sjekkliste der punktene skrives direkte i systemet, når opplastingen feiler underveis, eller når filen erstattes og lagringen avvises. Raden blir stående og ser ut som et vanlig dokument i listen, men kan ikke åpnes.

## Hva jeg foreslår

**A. Automatisk opprydding når et dokument slettes**

En databaseregel som kjører ved sletting og fjerner dokumentets ID fra alle steder som ikke rydder seg selv i dag:

- sjekklister på droner: drift, etterflyging og inspeksjon
- sjekkliste på utstyr/batteri
- sjekkliste på vedlikeholdsplan
- sjekklister på oppdrag
- standarddokumenter på oppdragstyper
- sjekkliste før avgang på selskap

Da kan ingen drone, batteri eller oppdrag bli hengende igjen med et dokument som ikke finnes.

**B. Engangsopprydding av dagens 22 oppdragskoblinger**

Fjerner de fire slettede dokument-ID-ene fra oppdragene. Ingen dokumenter slettes, kun koblinger som peker i tomme luften.

**C. Tydeligere merking av tomme dokumentrader**

I dokumentlisten merkes rader uten fil med «Mangler fil», slik at de synes før noen prøver å åpne dem. Vi sletter dem ikke automatisk — flere av dem er sjekklister med punkter lagret i selve raden.

## Teknisk

- Ny `AFTER DELETE`-trigger-funksjon `public.cleanup_document_references()` på `public.documents` (SECURITY DEFINER, `search_path = public`, `REVOKE EXECUTE ... FROM anon, authenticated, PUBLIC`).
- Rydder: `drones.operations_checklist_ids` (text[]), `drones.post_flight_checklist_id`, `drones.sjekkliste_id`, `drones.operations_checklist_id`, `equipment.sjekkliste_id`, `maintenance_schedules.sjekkliste_id`, `missions.checklist_ids` (uuid[]), `missions.checklist_completed_ids`, `company_mission_types.default_document_ids`/`default_document_id`, `companies.before_takeoff_checklist_ids`/`before_takeoff_checklist_id`.
- Engangs-SQL fjerner `50094778-…`, `a29dc8b4-…`, `82f6e702-…`, `6f36d5b7-…` fra `missions.checklist_ids` og `checklist_completed_ids`.
- Frontend: «Mangler fil»-merke i dokumentlisten der `fil_url` er tom, med nye i18n-nøkler i `no.json` og `en.json`.
- Validering: `npx tsgo --noEmit -p tsconfig.app.json && git diff --check`.
