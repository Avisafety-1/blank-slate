

## Plan: Fiks dagens dato i /kalender — synlighet og klikkbarhet

### Problem
Samme problem som CalendarWidget hadde: `mode="single"` med `selected={date}` (initialisert til `new Date()`) gjør at dagens dato får `day_selected`-styling (mørk blå `bg-accent`) som overskriver `day_today`. Re-klikk på valgt dag sender `undefined` fra DayPicker.

### Løsning — `src/pages/Kalender.tsx`

**1. State** (linje 67): Endre `date` til `month`-state for å styre visning uten seleksjon:
```tsx
const [month, setMonth] = useState<Date>(new Date());
```

**2. Calendar-props** (linje 766-769): Fjern `mode="single"` og `selected`, bruk `onDayClick`:
```tsx
<Calendar
  month={month}
  onMonthChange={setMonth}
  onDayClick={handleDateClick}
  locale={nb}
```

**3. handleDateClick** (linje 396): Endre parameter fra `Date | undefined` til `Date`:
```tsx
const handleDateClick = (clickedDate: Date) => {
```

**4. day_selected styling** (linje 794): Kan fjernes eller beholdes — den vil ikke lenger trigges uten `mode="single"`.

### Filer
- `src/pages/Kalender.tsx` (3-4 linjer)

