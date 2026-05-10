## Mål

Alle guidede tourer skal kunne tildeles brukere via **Admin → Opplæring**, akkurat som vanlige kurs. De skal gi varsel, vises i «Min profil → Kompetanse», kunne tas derfra, sette utløpsdato, og automatisk loggføres som kompetanse med samme grønn/gul/rød-status.

## Brukerflyt

**Admin:**
1. Går til Admin → Opplæring → «Nytt kurs».
2. Velger **Kurstype: Guidet tour**.
3. Velger tour fra nedtrekksliste (Systemoversikt, Dashboard-widgets, Opprett oppdrag, Start flygning, Logg flytid, Last opp DJI-logg, Rapporter hendelser).
4. Setter tittel, beskrivelse, gyldighetstid (måneder).
5. Tildeler kurset til én eller flere brukere via eksisterende «Tildel kurs»-dialog → utløser samme varsel som vanlige kurs.

**Bruker:**
1. Får varsel om tildelt kurs.
2. Åpner Min profil → Kompetanse → Tildelte kurs.
3. Klikker kurset → ser et enkelt panel «Start veiledet gjennomgang».
4. Klikk starter touren via eksisterende `GuidedTourProvider`.
5. Når touren fullføres («Ferdig»-steget) markeres tildelingen som bestått, og en `personnel_competencies`-rad opprettes automatisk (`type='Kurs'`, navn = kurstittel, utstedt = i dag, utløp = i dag + `validity_months`).
6. Kurset vises nå i kompetanselisten med grønn/gul/rød-status drevet av eksisterende logikk.
7. Avbryter brukeren touren midtveis er kurset «ikke fullført» og kan tas på nytt.

## Tekniske endringer

### 1. Database (én migrering)
- `training_courses`: legg til `tour_id text NULL`.
- `display_mode`-feltet brukes med ny verdi `'guided_tour'` (kolonnen er `text`, ingen constraint-endring).
- Ingen RLS-endringer: eksisterende policies på `training_courses`, `training_assignments` og `personnel_competencies` dekker dette.

### 2. Tour-registeret
- `src/tours/tourDefinitions.ts`: eksporter `assignableTours` (id + tittel + kort beskrivelse) som kurseditoren kan vise i en `<Select>`.

### 3. Kurseditor (`src/components/admin/TrainingCourseEditor.tsx`)
- Ny radio-knapp øverst: **Kurstype** = `Vanlig` | `Guidet tour`.
- Ved «Guidet tour»:
  - Skjul slide-/spørsmål-/PDF-/PPTX-/YouTube-seksjonene.
  - Vis `<Select>` med tour-listen → lagres til `tour_id`, og `display_mode = 'guided_tour'`.
  - `passing_score` settes implisitt til 100 og feltet skjules.
  - Ingen rader i `training_questions` for tour-kurs.
- Tittel / beskrivelse / `validity_months` brukes som vanlig.

### 4. Tildeling og varsel
- `src/components/admin/TrainingAssignmentDialog.tsx`: ingen endring. Tour-kurs er bare en vanlig rad i `training_courses` og bruker eksisterende tildelings- og varselflyt.

### 5. Ta kurset (`src/components/training/TakeCourseDialog.tsx`)
- Last `tour_id` sammen med kurset.
- Hvis `display_mode === 'guided_tour'`:
  - Render et eget panel med tittel, beskrivelse og knapp **«Start veiledet gjennomgang»**.
  - Klikk lukker dialogen og kaller ny window-bro `window.__avisafeTour?.startTour?.(tour_id, { assignmentId })`.
- Hopp over hele spørsmål-/scoring-/lagringsløypen for tour-kurs.

### 6. Tour-fullføring → kursfullføring
- `src/components/guided-tour/GuidedTourProvider.tsx`: når en tour avsluttes via «Ferdig» og ble startet med `assignmentId`, kall ny hjelper `completeTourAssignment(assignmentId)`:
  1. Opprett `personnel_competencies`-rad (samme insert som dagens fullført-kode i `TakeCourseDialog`).
  2. Oppdater `training_assignments`: `completed_at = now()`, `passed = true`, `score = 100`, `competency_id = <ny rad>`.
  3. Toast: «Kurs fullført — kompetanse registrert».
- `src/pages/Index.tsx`: utvid `window.__avisafeTour`-broen med `startTour(tourId, opts)` som starter touren via eksisterende provider-API.

### 7. Min profil → Kompetanse
- Ingen endring nødvendig. Tildelte tour-kurs vises automatisk i samme liste, og fullførte tour-kurs gir en kompetanse-rad som dukker opp med riktig status.

## Filer som røres

- migrering: `training_courses.tour_id`
- `src/tours/tourDefinitions.ts` (+ ev. `src/tours/types.ts`)
- `src/components/admin/TrainingCourseEditor.tsx`
- `src/components/training/TakeCourseDialog.tsx`
- `src/components/guided-tour/GuidedTourProvider.tsx`
- `src/pages/Index.tsx` (window-bro `startTour`)

## Avgrensninger

- Ingen endring i selve tour-stegene eller hvordan de kjører visuelt.
- Ingen endring i `TrainingStatusView` — tour-kurs vises som vanlige kurs-rader i statistikk.
- Forhåndsvisning i editoren for tour-kurs starter touren midlertidig uten å markere som fullført.
