

## Fix: Crash ved "Fullførte oppdrag"

### Rotårsak
`getResourceConflictsForMission` (linje 217 i `useResourceConflicts.ts`) kaller `new Date(mission.tidspunkt)` for **alle** oppdrag i listen. Hvis et oppdrag har `tidspunkt = null`, gir dette "Invalid Date", og `isSameDay()` kaster en feil som krasjer hele siden. Sjekken på linje 208 beskytter bare det *aktive* oppdraget, ikke de andre i loopen.

### Plan

**Fil: `src/hooks/useResourceConflicts.ts`**
- Linje 216-217: Legg til null-sjekk i loopen — hopp over oppdrag uten `tidspunkt`:
```typescript
for (const mission of otherMissions) {
  if (!mission.tidspunkt) continue;  // <-- ny linje
  const mStart = new Date(mission.tidspunkt);
  ...
}
```

**Fil: `src/components/oppdrag/MissionCard.tsx`**
- Linje 301: Legg til try/catch eller sjekk for `slutt_tidspunkt` som kan ha ugyldig datoformat (allerede guarded med `&&`, men legger til en ekstra safety):
```typescript
{mission.slutt_tidspunkt && (() => {
  try {
    return <p className="text-xs text-muted-foreground">
      til {format(new Date(mission.slutt_tidspunkt), "dd. MMMM HH:mm", { locale: nb })}
    </p>;
  } catch { return null; }
})()}
```

- Linje 751: Samme for `c.created_at` i approver_comments

Disse to endringene er små og eliminerer alle gjenværende crash-punkter for null/ugyldig dato-data.

