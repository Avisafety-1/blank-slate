

## TipTap WYSIWYG Kurseditor + Mappeadministrasjon

### Oversikt
Bygge en slide-basert kurseditor med TipTap som gir ekte WYSIWYG-opplevelse, samt forbedre mappeadministrasjonen slik at man kan legge eksisterende kurs inn i mapper.

### 1. Mappeadministrasjon — «Legg til eksisterende kurs»

**Fil: `src/components/admin/TrainingSection.tsx`**
- Når man er inne i en mappe, vis en «Legg til kurs»-knapp
- Åpner en dialog som viser alle kurs som ikke tilhører en mappe (`folder_id IS NULL`)
- Velg ett eller flere kurs → setter `folder_id` på valgte kurs
- Kursene forsvinner da fra hovedoversikten

### 2. Database — Utvide slides-modellen

Ny migrasjon på `training_questions`:
```sql
ALTER TABLE training_questions
  ADD COLUMN slide_type text NOT NULL DEFAULT 'question',
  ADD COLUMN content_json jsonb;
```
- `slide_type`: `'content'` (ren informasjonsside) eller `'question'` (quiz-side)
- `content_json`: TipTap JSON-dokument med rik tekst, bilder, lister etc.
- Eksisterende spørsmål beholdes som `slide_type = 'question'`

### 3. TipTap-editor komponent

**Ny fil: `src/components/training/SlideEditor.tsx`**

Pakker som installeres: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-underline`, `@tiptap/extension-text-align`, `@tiptap/extension-placeholder`

Verktøylinje med:
- **Tekst**: Overskrift (H1, H2, H3), brødtekst, fet, kursiv, understreking
- **Lister**: Kulepunkter, nummererte lister
- **Bilde**: Last opp bilde, bildestørrelse (liten/medium/stor/full bredde)
- **Blokker**: Inforamme (farget boks rundt innhold), skillelinje
- **Pil-ikoner**: Sett inn pil-emoji/SVG som inline-element

Editoren rendrer innholdet i 16:9-proporsjon i fullskjerm for WYSIWYG-effekt.

### 4. Kurseditor omskriving (fullskjerm)

**Fil: `src/components/admin/TrainingCourseEditor.tsx`**

I fullskjerm-redigeringsmodus:
- Venstre sidebar: Miniatyrbilder av alle slides (drag for å sortere)
- Hovedområde: TipTap-editor for valgt slide
- Knapper: «Legg til innholdsside» og «Legg til spørsmålsside»
- For spørsmålssider: TipTap-editor for spørsmålsteksten + svaralternativer under
- For innholdssider: Bare TipTap-editoren (ingen svaralternativer)

Normal modus (uten fullskjerm) beholder dagens liste-layout men bruker TipTap i stedet for plain textarea for spørsmålstekst.

### 5. Kursvisning (TakeCourseDialog)

**Fil: `src/components/training/TakeCourseDialog.tsx`**

- Rendrer TipTap JSON som read-only HTML for innholdssider
- Innholdssider har bare en «Neste»-knapp, ingen svaralternativer
- Spørsmålssider viser rik tekst + svaralternativer som før
- Ved scoring telles bare slides med `slide_type = 'question'`

### 6. Animasjoner og dekorative elementer

Via TipTap custom extensions:
- **Inforamme**: En farget boks man kan sette rundt innhold (blå, gul, rød, grønn)
- **Pil-blokk**: Sett inn pil-ikoner (→ ↓ ↑ ←) som kan brukes i forklaringer
- Hover-animasjoner på slides i sidebar (scale-in)

### Filer som endres/opprettes

| Fil | Handling |
|-----|----------|
| `supabase/migrations/xxx.sql` | Legg til `slide_type`, `content_json` på `training_questions` |
| `src/components/training/SlideEditor.tsx` | **Ny** — TipTap wrapper med toolbar |
| `src/components/training/SlideReadonlyView.tsx` | **Ny** — Read-only TipTap renderer |
| `src/components/admin/TrainingCourseEditor.tsx` | Omskrives til slide-basert med TipTap |
| `src/components/training/TakeCourseDialog.tsx` | Støtte for innholdssider og rik tekst |
| `src/components/admin/TrainingSection.tsx` | «Legg til kurs i mappe»-dialog |
| `package.json` | TipTap-avhengigheter |

### Tekniske detaljer
- TipTap lagrer innhold som JSON (`content_json`), som er kompakt og kan rendres uten editoren
- `question_text` beholdes som fallback for bakoverkompatibilitet
- Bildeopplasting gjenbruker eksisterende `logbook-images` bucket
- Slide-sortering bruker eksisterende `sort_order`-feltet

