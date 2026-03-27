

## Opplæringsmodul — ny tab på admin-siden

### Oversikt
Bygge en komplett opplæringsmodul der selskapet kan opprette kurs/tester med spørsmål (inkl. bildeopplasting), tildele kurs til ansatte, spore gjennomføringsstatus, og automatisk registrere bestått kurs som kompetanse med valgfri varighet.

### Databasetabeller (4 nye tabeller)

**`training_courses`** — kurs/tester
- `id`, `company_id`, `title`, `description`, `status` (draft/published), `passing_score` (prosent, default 80), `validity_months` (hvor lenge godkjenningen varer, null = evig), `created_by`, `created_at`, `updated_at`

**`training_questions`** — spørsmål i et kurs
- `id`, `course_id` (FK), `question_text`, `image_url` (valgfritt bilde), `sort_order`, `created_at`

**`training_question_options`** — svaralternativer
- `id`, `question_id` (FK), `option_text`, `is_correct` (boolean), `sort_order`

**`training_assignments`** — tildeling + gjennomføringsstatus
- `id`, `course_id` (FK), `profile_id` (FK), `company_id`, `assigned_at`, `completed_at`, `score` (prosent), `passed` (boolean), `competency_id` (FK til personnel_competencies, settes ved bestått)

RLS: Basert på `company_id` og `get_user_visible_company_ids()` for hierarkisk tilgang.

### Nye filer

**`src/components/admin/TrainingSection.tsx`** (~hovedkomponent for tabben)
- Liste over kurs med status-badges (kladd/publisert)
- Knapper: «Nytt kurs», «Rediger», «Publiser/Avpubliser»
- Gjennomføringsstatus-oversikt per kurs (antall tildelt, fullført, bestått)
- Filtrer ansatte på tvers av avdelinger

**`src/components/admin/TrainingCourseEditor.tsx`** — kursredigering
- Tittel, beskrivelse, beståttprosent, gyldighetsperiode
- Legg til/fjern/rekkefølge spørsmål
- Per spørsmål: tekst, valgfritt bilde (upload til `logbook-images`), svaralternativer med markering av riktig svar
- Lagre som kladd eller publiser

**`src/components/admin/TrainingAssignmentDialog.tsx`** — tildel kurs til ansatte
- Velg ansatte (søkbar, på tvers av avdelinger)
- Vis hvem som allerede er tildelt

**`src/components/admin/TrainingStatusView.tsx`** — gjennomføringsoversikt
- Tabell med alle tildelte ansatte, status, score, dato
- Filtrer per avdeling

**`src/components/training/TakeCourseDialog.tsx`** — kurset slik ansatte tar det
- Viser spørsmål ett om gangen eller alle samlet
- Velg svar, send inn, beregn score
- Ved bestått: oppretter automatisk en `personnel_competencies`-rad med type «Kurs», navn = kurstittelen, `utstedt_dato` = nå, `utloper_dato` = nå + validity_months

### Endring i eksisterende fil

**`src/pages/Admin.tsx`** — minimal endring:
- Importer `TrainingSection`
- Legg til ny `TabsTrigger` (value="training") ved siden av «Avdelinger»-tabben med et `GraduationCap`-ikon
- Legg til `TabsContent` som rendrer `<TrainingSection />`

### Flyten
1. Admin oppretter kurs → legger til spørsmål med svaralternativer → lagrer som kladd eller publiserer
2. Admin tildeler kurset til ansatte (på tvers av avdelinger)
3. Ansatt ser tildelte kurs (via ressurssiden eller en egen visning) → tar testen
4. Score beregnes automatisk → ved bestått opprettes kompetanse-rad med varighet
5. Admin ser gjennomføringsstatus for alle ansatte

### Tekniske detaljer
- Bilder lastes opp til `logbook-images`-bøtten med sti `{company_id}/training-{question_id}-{timestamp}.ext`
- Kursdata hentes med Supabase client, ikke edge functions
- Alle nye komponenter i separate filer for å unngå å blåse opp eksisterende kode
- Tabben synlig for alle admins (ikke bare superadmin), men ikke for child company admins med mindre vi ønsker det

