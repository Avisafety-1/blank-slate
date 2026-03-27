

## Fullskjerm-redigering + større bilder i fullskjerm

### Hva som bygges

1. **Større bilder i fullskjerm-modus (TakeCourseDialog)**
   - Endre `max-h-48` på bilder til `max-h-[60vh]` når dialogen er i fullskjerm
   - Bruke `isFullscreen`-state som allerede finnes til å betinget sette bildestørrelse

2. **Fullskjerm-redigeringsmodus (TrainingCourseEditor)**
   - Legge til en «Fullskjerm-redigering»-knapp i editoren (ved siden av «Legg til spørsmål»)
   - Bruker Browser Fullscreen API på editorens wrapper-div
   - I fullskjerm: editoren fyller hele skjermen med scroll, spørsmålskort vises med samme layout som TakeCourseDialog (WYSIWYG)
   - Bilder vises store (`max-h-[50vh]`) i fullskjerm-redigeringsmodus
   - Beholder alle redigeringsfunksjoner (input-felter, slett, legg til) men i fullskjerm-layout
   - Knapp for å gå ut av fullskjerm i topphjørnet

### Filer som endres

| Fil | Endring |
|-----|---------|
| `src/components/training/TakeCourseDialog.tsx` | Bildet bruker `isFullscreen ? "max-h-[60vh]" : "max-h-48"` |
| `src/components/admin/TrainingCourseEditor.tsx` | Legg til `useRef`, `useState(isFullscreen)`, fullscreenchange-lytter, toggle-knapp, og betinget `max-h-[50vh]` på bilder + `bg-background overflow-y-auto` på wrapper i fullskjerm |

