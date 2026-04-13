

## Plan: Post Flight Checklist på drone-kort

### Oversikt
Legg til et nytt felt `post_flight_checklist_id` på droner. Når et oppdrag settes til "Fullført" og tilknyttede droner har en post-flight-sjekkliste, vises en bekreftelsesdialog: "Utfør post flight checklist" eller "Utfør senere". Velger man "senere", legges sjekklisten til oppdragets `checklist_ids` som ufullført (grå badge). Utfører man den, blir den grønn.

### Endringer

#### 1. Database-migrasjon
- Legg til `post_flight_checklist_id UUID REFERENCES documents(id)` på `drones`-tabellen

#### 2. `DroneDetailDialog.tsx` — nytt felt i UI
- Legg til et tredje sjekkliste-felt "Post flight sjekkliste" under operasjonssjekklisten
- Samme select-mønster som `operations_checklist_id`
- Lagre/laste `post_flight_checklist_id` i formData og save-logikken

#### 3. `AddDroneDialog.tsx` — nytt felt ved opprettelse
- Legg til select for post flight checklist, tilsvarende operations-feltet

#### 4. `MissionStatusDropdown.tsx` — bekreftelsesdialog ved fullføring
- Når status endres til "Fullført": hent tilknyttede droner via `mission_drones`, sjekk om noen har `post_flight_checklist_id`
- Hvis ja: vis en `AlertDialog` med to valg:
  - **"Utfør nå"** → åpne `ChecklistExecutionDialog`, deretter fullfør
  - **"Utfør senere"** → legg sjekkliste-IDene til oppdragets `checklist_ids` (men ikke `checklist_completed_ids`), fullfør oppdraget
- Hvis ingen post-flight-sjekklister finnes, fullfør som normalt

#### 5. Oppdragskortet (`MissionCard.tsx`) — eksisterende badge-logikk håndterer resten
- Allerede implementert: sjekklister i `checklist_ids` som ikke er i `checklist_completed_ids` vises som grå badge. Når utført → grønn. Ingen endring nødvendig her.

### Teknisk detalj
- `MissionStatusDropdown` utvides med intern state for å vise AlertDialog og eventuelt ChecklistExecutionDialog
- Post-flight-sjekkliste-IDer hentes via: `SELECT d.post_flight_checklist_id FROM mission_drones md JOIN drones d ON d.id = md.drone_id WHERE md.mission_id = ? AND d.post_flight_checklist_id IS NOT NULL`
- Ved "utfør senere": oppdater `missions.checklist_ids` med UNION av eksisterende + post-flight-IDer

### Omfang
Middels endring — 1 migrasjon, 4 filer.

