

## PowerPoint-lignende fritt-plasserte elementer i slide-editoren

### Problem
Dagens TipTap-editor er dokumentflyt-basert — tekst og bilder flyter lineært nedover. Brukeren ønsker PowerPoint-stil: fritt plasserte tekstbokser og bilder som kan dras rundt og skaleres uavhengig på et canvas.

### Løsning
Bygg et **canvas-basert slide-system** der hver slide inneholder en liste med fritt plasserte elementer (tekstbokser, bilder). Hvert element har `x`, `y`, `width`, `height` og kan dras/resizes. TipTap brukes fortsatt inne i tekstboksene for rik tekst.

### Datamodell
Utvid `content_json` til å lagre en liste med elementer:
```json
{
  "elements": [
    { "id": "abc", "type": "text", "x": 100, "y": 50, "width": 400, "height": 200, "content": { /* TipTap JSON */ } },
    { "id": "def", "type": "image", "x": 500, "y": 100, "width": 300, "height": 200, "src": "https://..." }
  ]
}
```
Ingen databasemigrasjon nødvendig — `content_json` er allerede `jsonb`.

### Ny komponent: `SlideCanvasEditor.tsx`
- Canvas med fast 16:9 proporsjon (1920x1080 intern oppløsning, skalert med `transform: scale()`)
- Elementer rendres med absolutt posisjonering
- Drag: `mousedown/mousemove/mouseup` på elementet for å flytte
- Resize: håndtak i hjørnene for å endre størrelse
- Valgt element får blå ramme med resize-håndtak
- Toolbar-knapper: «Legg til tekstboks», «Legg til bilde», «Slett valgt»
- Tekstbokser: Klikk for å redigere (inline TipTap med miniverktøylinje for formattering)
- Bilder: Last opp → plasseres på canvas med standard størrelse, kan flyttes/resizes

### Ny komponent: `SlideCanvasReadonly.tsx`
- Samme skalerte canvas, men uten drag/resize/redigering
- Rendrer elementer på faste posisjoner
- Brukes i `TakeCourseDialog` for visning

### Filer som endres/opprettes

| Fil | Endring |
|-----|---------|
| `src/components/training/SlideCanvasEditor.tsx` | **Ny** — Canvas med draggable/resizable elementer + inline TipTap |
| `src/components/training/SlideCanvasReadonly.tsx` | **Ny** — Read-only canvas renderer |
| `src/components/admin/TrainingCourseEditor.tsx` | Bruk `SlideCanvasEditor` i stedet for `SlideEditor` i hovedredigeringsområdet |
| `src/components/training/TakeCourseDialog.tsx` | Bruk `SlideCanvasReadonly` for å vise innholdssider |

### Tekniske detaljer
- Ren React + CSS for drag/resize (ingen ekstra biblioteker nødvendig)
- Skalering: `containerWidth / 1920` brukes som scale-faktor, mus-koordinater konverteres tilbake til 1920x1080
- `SlideEditor.tsx` og `SlideReadonlyView.tsx` beholdes som fallback for eksisterende slides med gammelt format
- Migrering av eksisterende innhold: Hvis `content_json` har gammelt TipTap-format (ingen `elements`-array), rendres det i en enkelt fullbredde-tekstboks automatisk

