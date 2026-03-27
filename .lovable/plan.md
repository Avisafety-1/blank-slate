

## Kurs-varsel på profil-oppfølging + e-postvarsling ved tildeling

### Hva som skal bygges

#### 1. ProfileDialog: Ny «Kurs/Tester»-seksjon i Oppfølging-tabben
- Hent `training_assignments` for innlogget bruker der `completed_at IS NULL`
- Join med `training_courses` for å få tittel, beskrivelse
- Vis som en ny `Card` i Oppfølging-tabben (mellom oppdragsgodkjenning og hendelser)
- Tittel: «Kurs og tester til gjennomføring (N)»
- Hver rad viser kurstittel + knapp «Ta kurs» som åpner `TakeCourseDialog`
- Antall ventende kurs legges til i badge-tellingen på Oppfølging-tabben og profil-ikonet

#### 2. E-post ved kurstildeling
- I `TrainingAssignmentDialog.handleAssign()`: etter vellykket insert, hent kurstittel og send e-post til hver tildelt person via `send-notification-email`
- Legg til en ny type i `send-notification-email` edge function: `type === 'training_assigned'`
- E-posten inneholder: kurstittel, melding om å logge inn for å gjennomføre kurset
- Bruker eksisterende e-postinfrastruktur (Resend via `send-notification-email`)

### Filer som endres
1. **`src/components/ProfileDialog.tsx`**
   - Ny state `pendingTraining` (array med assignment + course-data)
   - Hent i `fetchBadgeCounts` og `fetchUserData`
   - Ny Card i Oppfølging-tabben med TakeCourseDialog-integrasjon
   - Oppdater badge-telling til å inkludere `pendingTraining.length`

2. **`src/components/admin/TrainingAssignmentDialog.tsx`**
   - Etter insert: hent kurstittel, loop gjennom tildelte og kall `send-notification-email` med `type: 'training_assigned'`

3. **`supabase/functions/send-notification-email/index.ts`**
   - Ny branch for `type === 'training_assigned'`
   - Aksepterer `trainingAssigned: { recipientId, courseName, companyId }`
   - Henter brukerens e-post, sjekker notification_preferences, sender e-post med kursinformasjon

### Tekniske detaljer
- Ingen nye DB-tabeller eller kolonner trengs
- E-posttypen bruker eksisterende notification_preferences — kan gjenbruke `email_followup_assigned` eller vi kan la den alltid sende (kurset er obligatorisk)
- Badge-telling: `followUpIncidents.length + pendingApprovalMissions.length + pendingTraining.length`

