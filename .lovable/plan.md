## Mål
La administratorer flytte en drone mellom avdelinger (søsken/parent under samme rot). Selve drona og historikken følger alltid med. Tilbehør, dokumenter, utstyr og DroneTag håndteres per ressurs med valg som tilpasses hvilken synlighetsmodell ressursen faktisk støtter.

## Regler

**Alltid flyttet (ingen valg):**
- `drones.company_id` → ny avdeling
- `drone_log_entries` (hele drone-loggboken — både `drone_id` og `company_id`)
- `drone_inspections`
- `drone_equipment_history`
- `drone_department_visibility`: alle eksisterende delings-rader for drona **slettes** (kolonner er NOT NULL, så det er rader som fjernes — ikke felter som settes til NULL). Ny eier-avdeling kan eventuelt sette opp ny deling etterpå via eksisterende synlighets-UI.
- Følger automatisk via `drone_id`: `drone_personnel`, `drone_telemetry`, `mission_drones`

**Alltid beholdt på opprinnelig avdeling (historikk):**
- `flight_logs`, `flighthub2_positions`, `incidents`
- `dji_sync_jobs`, `pending_dji_logs` (bundet til selskapets DJI-konto)

**Valgfritt per ressurs:**

| Ressurs | Tilgjengelige valg | Grunn |
|---|---|---|
| `drone_accessories` | Flytt med · La være | Ingen synlighetstabell |
| `dronetag_devices` | Flytt med · La være | Ingen synlighetstabell |
| `equipment` (via `drone_equipment`) | Flytt med · Del synlighet · La være | Har `equipment_department_visibility` |
| `documents` (via `drone_documents` + `drones.sjekkliste_id` / `operations_checklist_ids` / `post_flight_checklist_id`) | Flytt med · Del synlighet · La være | Har `documents.visible_to_children` |

Atferd:
- **Flytt med** = ressursens `company_id` settes til ny avdeling
- **Del synlighet** = `company_id` beholdes; rad i `equipment_department_visibility` for ny avdeling, eller `documents.visible_to_children = true`
- **La være** = ingen endring på ressursen. For equipment/documents fjernes også koblingen til drona (`drone_equipment` / `drone_documents`) så drona ikke peker på en ressurs den ikke kan se. For accessories/dronetag har "La være" ingen praktisk effekt på koblingen (de er drone-eide) — vises bare for å være eksplisitt.

**Cross-link-vern:** Hvis utstyr/dokument også er koblet til andre droner som blir igjen i gammel avdeling, deaktiveres "Flytt med" med forklaring.

## Dialog

```
Flytt drone til annen avdeling
─────────────────────────────────
Drone: DJI M30T (SN 1581...)
Fra:   Avdeling Bergen
Til:   [Avdeling Oslo ▾]
Notat: [_________________________]

ℹ Loggbok, inspeksjoner og utstyrshistorikk følger drona automatisk.
ℹ Flygelogger, hendelser og DJI-synkjobber beholdes på Bergen som historikk.
ℹ Eksisterende delings-rader for drona fjernes — sett opp deling på nytt etter behov.

── Tilbehør ──                              Velg alle: (●) Flytt  ( ) La være
  Propellsett A                                       (●) Flytt  ( ) La være
  Ekstra batteri B1                                   (●) Flytt  ( ) La være

── Dokumenter & sjekklister ──   Velg alle: ( ) Flytt (●) Del synlighet ( ) La være
  Pre-flight sjekkliste                     ( ) Flytt (●) Del synlighet ( ) La være
  Vedlikeholdsmanual.pdf                    (●) Flytt ( ) Del synlighet ( ) La være

── Tilkoblet utstyr ──           Velg alle: ( ) Flytt (●) Del synlighet ( ) La være
  Smart Controller Pro                      ( ) Flytt (●) Del synlighet ( ) La være
  RTK-base                                  ( ) Flytt ( ) Del synlighet (●) La være
        (koblet til 2 andre droner — "Flytt med" deaktivert)

── DroneTag ──                              Velg alle: (●) Flytt  ( ) La være
  DT-2841                                             (●) Flytt  ( ) La være

[Avbryt]                                                  [Bekreft flytting]
```

Radioknappkolonner rendres dynamisk ut fra ressurstypens tilgjengelige valg — accessory/dronetag har bare to kolonner.

## Tekniske endringer

### 1. Migrering — ny tabell `drone_transfers`
Kolonner: `id`, `drone_id`, `from_company_id`, `to_company_id`, `transferred_at`, `transferred_by`, `note`, `moved_resources jsonb`.
GRANT til `authenticated` + `service_role`. RLS: SELECT for brukere som ser from- eller to-company via `get_user_visible_company_ids`. INSERT kun via SECURITY DEFINER RPC.

### 2. RPC `transfer_drone(_drone_id, _to_company_id, _note, _actions jsonb)`
SECURITY DEFINER. Validerer:
- Caller er `admin`/`superadmin` i from-company (eller global superadmin)
- to_company er søsken/parent under samme rot (superadmin kan overstyre)
- Hver `_actions[]`-rad har `action` som er gyldig for `type` (server-side reject `share` for accessory/dronetag)
- **Tilhørighetssjekk per resource_id (kritisk):** før noen mutasjon utføres, valideres at hver `resource_id` faktisk tilhører `_drone_id`:
  - `accessory` → `drone_accessories.id = resource_id AND drone_id = _drone_id`
  - `dronetag` → `dronetag_devices.id = resource_id AND drone_id = _drone_id`
  - `equipment` → finnes rad i `drone_equipment` med (`drone_id = _drone_id` AND `equipment_id = resource_id`)
  - `document` → finnes rad i `drone_documents` (`drone_id = _drone_id` AND `document_id = resource_id`) **eller** dokumentet er referert fra `drones.sjekkliste_id` / `post_flight_checklist_id` / `operations_checklist_ids` for samme drone
  - Hvis noen rad ikke matcher → `RAISE EXCEPTION` med id-en som feilet; ingen endringer commit-es

I transaksjon (etter at all validering har passert):
1. `UPDATE drones SET company_id = _to_company_id`
2. Alltid: oppdater `company_id` på `drone_log_entries`, `drone_inspections`, `drone_equipment_history` for drona
3. `DELETE FROM drone_department_visibility WHERE drone_id = _drone_id`
4. For hver `_actions[]` (type ∈ {accessory, document, equipment, dronetag}, action ∈ {move, share, leave}):
   - `move` → oppdater `company_id`
   - `share` (kun equipment/document) → insert i `equipment_department_visibility`, eller `documents.visible_to_children=true`
   - `leave` for equipment/document → slett kobling i `drone_equipment` / `drone_documents`
5. Insert i `drone_transfers` med jsonb-oppsummering
6. Insert `drone_log_entries` av type "Flytting": "Flyttet fra <A> til <B> av <X>. N flyttet, M delt, K beholdt."

### 3. UI

**Ny:** `src/components/resources/MoveDroneDialog.tsx`
- Henter søsken-/parent-avdelinger (mønster fra `useDepartmentVisibility`)
- Henter tilbehør, drone-dokumenter (inkl. sjekklister fra `drones.sjekkliste_id` etc.), koblet utstyr, dronetag
- Per seksjon: viser kun radioknapp-kolonner som er tilgjengelige for ressurstypen
- Detekterer ressurser delt med andre droner → deaktiverer "Flytt med"
- Info-banner om automatisk flyttet vs. historisk beholdt + at delings-rader for drona slettes
- Ett RPC-kall ved bekreft; invaliderer queries, toast, lukker

**Endret:** `src/components/resources/EditDroneDialog.tsx` (eller drone-kort i `Resources.tsx`)
- "Flytt til annen avdeling"-knapp, kun synlig for admin/superadmin

**Uendret automatisk:** `DroneLogbookDialog.tsx` viser flytte-oppføringer via `drone_log_entries`.

### 4. Tilgang
- Knapp og RPC krever rolle `admin` eller `superadmin` i from-company
- Flytting utenfor hierarkiet feiler i RPC

## Verifisering
- Drone, loggbok, inspeksjoner og utstyrshistorikk havner i ny avdeling
- `flight_logs`, `incidents`, `dji_sync_jobs` blir værende som historikk i gammel avdeling
- `drone_department_visibility`-rader for drona er borte etter flytting
- Accessory/DroneTag-dialogen viser kun Flytt/La være
- Equipment/Documents-dialogen viser Flytt/Del synlighet/La være
- "La være" for utstyr/dokument fjerner koblingen fra drona
- Cross-linked utstyr: "Flytt med" deaktivert
- Manuelt forsøk på å sende en `resource_id` som ikke tilhører drona → RPC feiler uten å endre noe
- Loggbok-tab i ny avdeling viser flytte-oppføring
- Ikke-admin ser ikke knappen; flytting utenfor hierarki feiler
