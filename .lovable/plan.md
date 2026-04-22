

## Plan: Dele kurs på tvers av avdelinger og tildele personell i underavdelinger

### Mål
1. En avdeling (parent eller child) skal kunne dele et kurs med andre enheter i organisasjonshierarkiet
2. Mor-avdeling kan dele nedover til alle underavdelinger
3. En underavdeling kan dele oppover til mor-avdelingen, som da kan re-distribuere til andre søsken
4. Admins skal kunne tildele kurset til personell i de avdelingene kurset er delt med

### Datamodell

**Ny kolonne på `training_courses`:**
```sql
ALTER TABLE public.training_courses
  ADD COLUMN visible_to_children boolean NOT NULL DEFAULT false,
  ADD COLUMN shared_with_parent boolean NOT NULL DEFAULT false;
```

- `visible_to_children` — kurset er synlig for alle underavdelinger (samme mønster som `training_course_folders` og `documents`)
- `shared_with_parent` — kurset (eid av en underavdeling) er synlig for mor-avdelingen, som så kan velge `visible_to_children = true` på sin kopi/markering for å spre videre

**Oppdater RLS SELECT-policy på `training_courses`:**
```sql
DROP POLICY "Users can view training courses for their company hierarchy" ON public.training_courses;
CREATE POLICY "Users can view training courses for their company hierarchy"
  ON public.training_courses FOR SELECT TO authenticated
  USING (
    company_id = ANY(get_user_visible_company_ids(auth.uid()))
    OR global_visibility = true
    OR (visible_to_children = true 
        AND company_id = ANY(get_user_readable_company_ids(auth.uid())))
    OR (shared_with_parent = true
        AND get_parent_company_id(company_id) = ANY(get_user_visible_company_ids(auth.uid())))
  );
```

**Oppdater RLS på `training_questions` og `training_question_options`** slik at de følger SELECT-tilgangen til kurset (subquery på `training_courses` slår automatisk inn fordi RLS evalueres rekursivt).

**Oppdater INSERT-policy på `training_assignments`** slik at admins kan tildele kurs til profiler i underavdelinger (eller mor-avdeling) når kurset er synlig for dem:
```sql
WITH CHECK (
  company_id = ANY(get_user_visible_company_ids(auth.uid()))
  AND course_id IN (SELECT id FROM training_courses)  -- RLS gate
)
```

### Endringer i UI

**1. `src/components/admin/TrainingSection.tsx` — kurs-kort**
- Legg til to nye knapper/togglestatuser ved siden av "Global"-badge:
  - **"Del med underavdelinger"** (kun synlig hvis selskapet har underavdelinger og brukeren er eier av kurset) — toggler `visible_to_children`
  - **"Del med mor-avdeling"** (kun synlig hvis selskapet har en parent og brukeren er eier av kurset) — toggler `shared_with_parent`
- Vis badges på kort: `Delt nedover` / `Delt med mor` / `Arvet fra X`
- Hvis kurset er arvet (company_id ≠ aktivt companyId), skjul Edit/Delete/Publiser-knapper — vis kun Preview og Tildel

**2. `src/components/admin/TrainingAssignmentDialog.tsx` — utvid personellsøk**
- Endre `fetchData` slik at profiler fra hele synlig hierarki vises (det skjer allerede pga. RLS, men UI-en må gruppere/vise avdeling tydelig)
- Legg til avdelingsfilter-dropdown (multi-select) øverst som lar admin filtrere på avdeling
- Bruk `get_user_visible_company_ids` (via RPC eller eksisterende henting) for å vise alle relevante avdelinger
- Når profiler tildeles: bruk profilens `company_id` (allerede implementert) — men sørg for at `course_id` fortsatt er gyldig tilgangsmessig

**3. `src/components/admin/TrainingStatusView.tsx`**
- Vis avdeling i statuslisten slik at admin ser hvilken avdeling deltakeren tilhører

### Filer som endres
- **Ny migrasjon** — kolonner + oppdaterte RLS-policyer
- `src/components/admin/TrainingSection.tsx` — toggle-knapper for deling, eierskap-sjekk på handlinger, badges
- `src/components/admin/TrainingAssignmentDialog.tsx` — avdelingsfilter, vis avdeling i listen
- `src/components/admin/TrainingStatusView.tsx` — vis avdeling i statuskolonnen

### UX-detaljer
- Knappene "Del med underavdelinger" / "Del med mor" vises kun for kurs eid av aktivt selskap
- Mor-avdelingen kan ta et kurs som ble delt opp (`shared_with_parent`) og toggle `visible_to_children = true` — men kun hvis morselskapet har skriverettighet (RLS allerede via `get_user_visible_company_ids`)
- Tildeling fungerer på tvers av avdelinger: dropdown viser ansatte fra alle synlige avdelinger med avdelingsbadge
- Ingen brytende endring: eksisterende kurs har `visible_to_children = false` og `shared_with_parent = false`

### Resultat
Kurs kan deles fritt opp/ned i organisasjonshierarkiet. Admin på mor-avdeling kan opprette ett kurs og distribuere til alle underavdelinger; en underavdeling kan dele tilbake til mor som så kan spre til søsken. Tildeling av personell fungerer for alle ansatte i de avdelingene kurset er gjort synlig for.

