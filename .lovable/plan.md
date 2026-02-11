

## Oppdragsgodkjenning med varsling og profiloppfolging

### Oversikt
Legge til et godkjenningssystem for oppdrag med tre statuser (ikke godkjent, venter pa godkjenning, godkjent), e-postvarsling til godkjennere, og en ny "Oppfolging"-fane i profildialogen som samler bade hendelser og oppdrag til godkjenning.

---

### 1. Database-endringer

**Ny kolonne pa `missions`-tabellen:**
- `approval_status` (text, default 'not_approved') - verdier: `not_approved`, `pending_approval`, `approved`
- `approval_comment` (text, nullable) - kommentar fra godkjenner
- `approved_by` (uuid, nullable) - hvem som godkjente
- `approved_at` (timestamptz, nullable) - nar oppdraget ble godkjent
- `submitted_for_approval_at` (timestamptz, nullable) - nar det ble sendt til godkjenning

**Ny kolonne pa `notification_preferences`-tabellen:**
- `email_mission_approval` (boolean, default false) - om brukeren skal motta varsler om oppdrag til godkjenning

**Ny innstilling pa `profiles`-tabellen:**
- `can_approve_missions` (boolean, default false) - om brukeren kan godkjenne oppdrag

**RLS-oppdateringer:**
- Alle som kan se oppdrag kan lese godkjenningsstatus
- Godkjennere (can_approve_missions = true) kan oppdatere approval_status, approval_comment, approved_by og approved_at
- Oppdragseiere og saksbehandlere+ kan sende til godkjenning (oppdatere approval_status til pending_approval)

---

### 2. Frontend - Oppdragskort (/oppdrag)

**Ny godkjenningsbadge pa hvert oppdragskort:**
- Ikke godkjent: gra badge "Ikke godkjent"
- Venter pa godkjenning: gul badge "Venter pa godkjenning"
- Godkjent: gronn badge med hake "Godkjent av [navn]"

**Ny knapp "Send til godkjenning":**
- Vises pa kort med status `not_approved`
- Legges til i "Flere valg"-dropdown-menyen
- Klikk oppdaterer `approval_status` til `pending_approval` og sender e-postvarsling

---

### 3. Profildialogen - Ny "Oppfolging"-fane

**Erstatte "Hendelser"-fanen med "Oppfolging":**
- Tabben far ikon `ClipboardCheck` og navn "Oppfolging"
- Inni tabben: to seksjoner med overskrifter
  - **Hendelser til oppfolging** (eksisterende logikk, flyttes hit)
  - **Oppdrag til godkjenning** (nytt)
    - Viser oppdrag med `approval_status = 'pending_approval'` der brukeren har `can_approve_missions = true`
    - Hvert oppdrag viser: tittel, lokasjon, dato, status
    - Knapp "Godkjenn" som apner et lite kommentarfelt
    - Godkjenning oppdaterer `approval_status` til `approved`, lagrer kommentar, godkjenner-ID og tidspunkt

**Badge-teller pa fanen:**
- Kombinerer antall hendelser + oppdrag til godkjenning

---

### 4. Admin-innstillinger

**I bruker-listen pa Admin-siden:**
- Ny toggle/switch per bruker: "Kan godkjenne oppdrag"
- Oppdaterer `profiles.can_approve_missions`
- Kun admin/superadmin kan endre denne innstillingen

---

### 5. E-postvarsling

**Ny e-postmal `mission_approval_request`:**
- Sendes nar noen klikker "Send til godkjenning"
- Mottagere: alle brukere med `can_approve_missions = true` OG `email_mission_approval = true` i notification_preferences
- Innhold: oppdragstittel, lokasjon, dato, beskrivelse, lenke til app

**Ny varslingsinnstilling i profilen:**
- Toggle "Oppdrag til godkjenning" under varslinger-fanen (vises kun for brukere med can_approve_missions)

---

### Tekniske detaljer

```text
Database-migrasjon:

ALTER TABLE missions ADD COLUMN approval_status text NOT NULL DEFAULT 'not_approved';
ALTER TABLE missions ADD COLUMN approval_comment text;
ALTER TABLE missions ADD COLUMN approved_by uuid REFERENCES auth.users(id);
ALTER TABLE missions ADD COLUMN approved_at timestamptz;
ALTER TABLE missions ADD COLUMN submitted_for_approval_at timestamptz;

ALTER TABLE profiles ADD COLUMN can_approve_missions boolean NOT NULL DEFAULT false;

ALTER TABLE notification_preferences ADD COLUMN email_mission_approval boolean NOT NULL DEFAULT false;
```

```text
Filer som endres:

Nye filer:
- supabase/migrations/[timestamp]_mission_approval.sql

Endrede filer:
- src/pages/Oppdrag.tsx (godkjenningsbadge, send til godkjenning-knapp)
- src/components/ProfileDialog.tsx (ny "Oppfolging"-fane med hendelser + oppdrag)
- src/pages/Admin.tsx (toggle for kan godkjenne oppdrag)
- src/components/dashboard/MissionsSection.tsx (godkjenningsbadge pa dashboard)
- src/components/dashboard/MissionDetailDialog.tsx (godkjenningsstatus)
- supabase/functions/send-notification-email/index.ts (ny type mission_approval_request)
- src/lib/notifications.ts (ny notifikasjonstype)
- src/i18n/locales/no.json (nye oversettelser)
- src/i18n/locales/en.json (nye oversettelser)
- src/integrations/supabase/types.ts (oppdaterte typer)
```

```text
Flyt - Send til godkjenning:

1. Bruker klikker "Send til godkjenning" pa oppdragskort
2. Frontend oppdaterer missions.approval_status = 'pending_approval'
3. Frontend kaller send-notification-email med type 'notify_mission_approval'
4. Edge function finner brukere med can_approve_missions = true og email_mission_approval = true
5. Sender e-post til alle godkjennere

Flyt - Godkjenn oppdrag:

1. Godkjenner ser oppdrag i profil > Oppfolging
2. Klikker "Godkjenn", skriver kommentar
3. Frontend oppdaterer missions: approval_status='approved', approved_by, approved_at, approval_comment
4. Oppdraget forsvinner fra godkjennerens liste
```

