

## Plan: Fiks dagens dato i kalenderen — synlighet og klikkbarhet

### Problem
1. **Fargen er for mørk**: `day_today` bruker `bg-accent text-accent-foreground`. I designsystemet er `--accent: 210 80% 28%` (mørk blå) og `--accent-foreground: 215 25% 26.6667%` (også mørk). Teksten er nesten usynlig mot bakgrunnen, og hendelsesprikken (også `bg-primary` = mørk blå) forsvinner helt.
2. **Klikkbarhet**: `handleDateClick` setter `setDate(undefined)` etter klikk for å fjerne blå markering. Neste klikk på samme dag sender `undefined` fra `onSelect` fordi DayPicker tolker det som en deselect. Dagens dato kan dermed ikke klikkes to ganger etter hverandre.

### Løsning

#### Fil: `src/components/dashboard/CalendarWidget.tsx`

**1. Lysere today-styling (linje 503)**
```
// Fra:
day_today: "bg-accent text-accent-foreground"

// Til:
day_today: "bg-primary/15 text-foreground font-semibold"
```
Lys blå bakgrunn (15% opacity av primary) med normal tekstfarge. Hendelsesprikken og datotallet blir godt synlig.

**2. Fiks klikkbarhet (linje 337-344)**
Ikke sett `date` til `undefined` — bruk den klikkede datoen. Håndter re-klikk ved å alltid åpne dialogen:
```typescript
const handleDateClick = (clickedDate: Date | undefined) => {
  if (clickedDate) {
    setDate(clickedDate);
    setSelectedDate(clickedDate);
    setDialogOpen(true);
    setShowAddForm(false);
    setNewEvent({ title: "", type: "Oppdrag", description: "", time: "09:00" });
  }
};
```

### Filer
- `src/components/dashboard/CalendarWidget.tsx` (2 endringer)

