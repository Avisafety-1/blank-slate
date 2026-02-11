

## Kommentarer fra godkjenner og e-postvarsling ved godkjenning

### Oversikt
Legge til en "Kommentar"-knapp pa oppdragskortene i godkjenningslisten, og sende e-post til piloten nar oppdraget godkjennes.

---

### 1. Database-endring

**Ny kolonne pa `missions`-tabellen:**
- `approver_comments` (jsonb, default '[]') - liste med kommentarer fra godkjennere

Hver kommentar lagres som:
```text
{
  "author_id": "uuid",
  "author_name": "Navn",
  "comment": "Teksten",
  "created_at": "2026-02-11T12:00:00Z"
}
```

Den eksisterende `approval_comment` beholdes (brukes ved selve godkjenningen).

---

### 2. Frontend - Oppdragskort i "Oppfolging"

**Nye knapper pa hvert oppdragskort (ved siden av "Godkjenn"):**
- **Kommentar** (MessageSquare-ikon): Klikker man pa denne, vises et fritekstfelt med "Tilbake" og "Lagre"-knapper
- Lagring henter eksisterende `approver_comments` fra oppdraget, legger til ny kommentar med godkjennerens navn og tidspunkt, og oppdaterer kolonnen

**Visning av kommentarer:**
- Nederst pa oppdragskortet vises alle kommentarer i en liste
- Format: "Kommentar fra godkjenner **Navn**: kommentarteksten" med dato
- Nar oppdraget godkjennes med kommentar, legges ogsa den kommentaren til i `approver_comments`

**State-handtering:**
- Ny state `commentingMissionId` for a tracke hvilket oppdrag man kommenterer
- Ny state `missionComment` for selve kommentarteksten

---

### 3. MissionDetailDialog - Vise kommentarer

**I bunn av MissionDetailDialog:**
- Vis alle `approver_comments` under en "Kommentarer fra godkjenner"-seksjon
- Samme format som pa kortet

---

### 4. E-postvarsling til pilot ved godkjenning

**Ny e-posttype `notify_mission_approved`:**
- Sendes nar godkjenner klikker "Godkjenn"
- Mottagere: alle piloter knyttet til oppdraget via `mission_personnel`
- Innhold: oppdragstittel, kommentarer fra godkjenner(e), og teksten "Logg inn i appen for a se oppdraget"

**Endringer i edge function:**
- Ny handler for type `notify_mission_approved` i `send-notification-email`
- Mottar `missionId`, henter personnel fra `mission_personnel`, sender e-post til hver pilot
- E-postmal med kommentarer og oppdrags-info

**Ny default e-postmal `mission_approved` i template-utils.ts**

---

### Tekniske detaljer

```text
Database-migrasjon:

ALTER TABLE missions ADD COLUMN approver_comments jsonb NOT NULL DEFAULT '[]'::jsonb;
```

```text
Filer som endres:

- supabase/migrations/[timestamp]_approver_comments.sql (ny migrasjon)
- src/components/ProfileDialog.tsx (kommentar-knapp, kommentar-visning, e-post ved godkjenning)
- src/components/dashboard/MissionDetailDialog.tsx (vise approver_comments)
- supabase/functions/send-notification-email/index.ts (ny type notify_mission_approved)
- supabase/functions/_shared/template-utils.ts (ny default mal mission_approved)
```

```text
Flyt - Legg til kommentar:

1. Godkjenner klikker "Kommentar" pa oppdragskort
2. Fritekstfelt vises med "Tilbake" og "Lagre"-knapper
3. Ved "Lagre": hent oppdragets approver_comments, legg til ny kommentar med navn/tidspunkt
4. Oppdater missions.approver_comments
5. Toast-melding "Kommentar lagret"

Flyt - Godkjenn med e-post:

1. Godkjenner klikker "Godkjenn", skriver valgfri kommentar
2. Kommentaren legges til i approver_comments (i tillegg til approval_comment)
3. missions oppdateres med approval_status='approved'
4. Frontend kaller send-notification-email med type 'notify_mission_approved'
5. Edge function henter piloter fra mission_personnel
6. Sender e-post med kommentarer og "Logg inn i appen for a se oppdraget"
```
