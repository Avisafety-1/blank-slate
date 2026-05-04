Tre justeringer i opplæringsmodulen.

## 1. «Pil ned»-knapp får tekst

Fil: `src/components/admin/TrainingSection.tsx` (linje ~440-449).

I dag vises kun et `ArrowDown`-ikon på kurskortet. Endres til ikon + tekst «Del med underavdelinger» (eller «Delt nedover» når aktiv), tilsvarende stilen som brukes på folder-kortene (linje 363). Gir mer tydelig tekst-kontekst.

```tsx
<Button ...>
  <ArrowDown className="h-3.5 w-3.5 mr-1" />
  {course.visible_to_children ? "Delt nedover" : "Del nedover"}
</Button>
```

## 2. PDF-opplasting legger til slides i stedet for å overskrive

Fil: `src/components/admin/TrainingCourseEditor.tsx` (`handlePdfUpload`, linje ~136-181).

I dag erstatter `setSlides(newSlides)` alle eksisterende slides. Endres til å:
- Lese eksisterende slides
- Legge nye PDF-sider til som ekstra slides på slutten
- Sette `sort_order` videre fra siste eksisterende slide

```tsx
const startOrder = slides.length;
newSlides.push({ ..., sort_order: startOrder + (i - 1) });
setSlides((prev) => [...prev, ...newSlides]);
toast.success(`${pageCount} sider lagt til fra PDF`);
```

Knappetekst på opplastingsknappen oppdateres tilsvarende: «Legg til sider fra PDF».

## 3. Tillat ny tildeling etter stryk

Database: `training_assignments` har unique-constraint `(course_id, profile_id)`. Det gjør at samme person ikke kan få samme kurs på nytt — selv etter stryk.

Løsning uten å miste historikk:
- Behold tabellen som den er (én aktiv tildeling om gangen per person/kurs)
- I `TrainingAssignmentDialog.tsx`: når en eksisterende tildeling finnes med `passed = false` og `completed_at IS NOT NULL` (altså strøket), regn personen som «ikke tildelt» og tillat re-tildeling
- Ved insert: hvis en strøket tildeling finnes, slett den først, deretter insert ny ren tildeling (nullstiller `score`, `saved_answers`, `completed_at`, `passed`)

Filer:
- `src/components/admin/TrainingAssignmentDialog.tsx` — endre `fetchData` til å hente status og kun legge `course_id+profile_id` i `assignedIds` hvis ikke strøket. I `handleAssign`, kjør `delete` på strøkne rader før insert.

Visuelt: strøkne personer blir søkbare igjen i listen; eventuelt en liten badge «Strøket — kan tildeles på nytt» for tydelighet.

Ingen migrasjoner nødvendig.
