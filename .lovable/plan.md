

## Kurs tilgjengelig for alle + visning på personellkort

### Nåværende oppførsel
«Publiser» setter bare `status = 'published'` i `training_courses`. Kurs kan deretter tildeles manuelt til enkeltpersoner via «Tildel»-dialogen. Det er ingen måte å gjøre et kurs tilgjengelig for alle ansatte automatisk, og personellkortet på `/ressurser` viser ikke tilgjengelige kurs.

### Hva som skal bygges

#### 1. Database: Ny kolonne `available_to_all` på `training_courses`
- `available_to_all boolean NOT NULL DEFAULT false`
- Når `true`: kurset er tilgjengelig for alle ansatte i selskapet (og avdelinger)
- Når `false`: kun tildelte personer ser kurset

#### 2. Admin: Utvidet publiseringsflyt i `TrainingSection.tsx`
- Når admin trykker «Publiser», vis en liten dialog/popover med to valg:
  - **«Tilgjengelig for alle»** — setter `available_to_all = true` og `status = 'published'`
  - **«Tildel spesifikke personer»** — setter `status = 'published'` og åpner `TrainingAssignmentDialog`
- Eksisterende «Tildel»-knapp beholdes for å legge til flere personer senere

#### 3. Personellkort: Vis tilgjengelige kurs i `PersonCompetencyDialog.tsx`
- Ny seksjon «Tilgjengelige kurs» under eksisterende kompetanser
- Henter kurs der enten:
  - `available_to_all = true` og `status = 'published'` (for selskapets hierarki), eller
  - det finnes en `training_assignment` for denne personen som ikke er fullført
- Filtrerer bort kurs personen allerede har bestått (og som ikke er utløpt)
- Hver rad viser kurstittel + knapp «Ta kurs» som åpner `TakeCourseDialog`

#### 4. Automatisk kompetanse ved fullføring (allerede implementert)
- `TakeCourseDialog` oppretter allerede `personnel_competencies` med `validity_months` → dette fungerer
- Må sikre at `påvirker_status = true` settes automatisk på kompetansen

#### 5. Personellkort på `/ressurser`-listen
- Vis en liten badge/indikator på personellkortet dersom personen har ventende kurs (ikke fullført)
- F.eks. et lite `GraduationCap`-ikon med antall

### Filer som endres
1. **Database-migrasjon** — `ALTER TABLE training_courses ADD COLUMN available_to_all boolean NOT NULL DEFAULT false`
2. **`src/components/admin/TrainingSection.tsx`** — publiseringsflyt med valg mellom «alle» og «spesifikke»
3. **`src/components/resources/PersonCompetencyDialog.tsx`** — ny seksjon for tilgjengelige kurs + TakeCourseDialog-integrasjon
4. **`src/components/training/TakeCourseDialog.tsx`** — sett `påvirker_status: true` på kompetansen
5. **`src/pages/Resources.tsx`** — badge på personellkort for ventende kurs

