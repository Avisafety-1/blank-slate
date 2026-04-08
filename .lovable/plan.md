

## Ressurskoblinger på hendelsesrapportering

### Oversikt
Legg til valgfrie felt for pilot, drone og utstyr i hendelsesdialogen, skjult bak en sammenleggbar seksjon. Når bruker velger et oppdrag, autofylles disse fra oppdragets ressurser (mission_drones, mission_equipment, mission_personnel). Ved lagring opprettes automatisk loggbokoppføringer i `drone_log_entries` og `equipment_log_entries`.

### Database-endringer

Legg til tre nye kolonner på `incidents`-tabellen:
- `pilot_id UUID REFERENCES profiles(id)` — nullable
- `drone_id UUID REFERENCES drones(id)` — nullable  
- `equipment_ids UUID[]` — nullable array (kan knyttes til flere utstyr)

### UI-endringer i AddIncidentDialog

Legg til en `Collapsible`-seksjon med tittel "Ressurser (valgfritt)" under lokasjon-feltet:
- **Pilot** — SearchablePersonSelect (gjenbruk eksisterende komponent), fylles fra company profiles
- **Drone** — Searchable select, henter fra `drones`-tabellen for company
- **Utstyr** — Multi-select med checkboxes, henter fra `equipment`-tabellen for company

### Auto-utfylling fra oppdrag

Når bruker velger oppdrag i `handleMissionSelect`:
1. Hent `mission_personnel` → sett `pilot_id` til første person (eller la bruker velge)
2. Hent `mission_drones` → sett `drone_id`
3. Hent `mission_equipment` → sett `equipment_ids`

### Loggbokoppføringer ved lagring

Etter vellykket INSERT/UPDATE av hendelse:
- Hvis `drone_id` er satt → INSERT i `drone_log_entries` med entry_type `'hendelse'`, tittel fra hendelsen
- For hver `equipment_id` i arrayet → INSERT i `equipment_log_entries` med entry_type `'hendelse'`

### Filer som endres

1. **Database-migrasjon** — Legg til `pilot_id`, `drone_id`, `equipment_ids` på incidents
2. **`src/components/dashboard/AddIncidentDialog.tsx`** — Collapsible ressurs-seksjon, auto-fill fra oppdrag, loggbok-insert ved lagring

