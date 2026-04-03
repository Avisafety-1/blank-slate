

## Utvid oppdragsmatching til hele dagen

### Problem
Nåværende logikk søker kun etter oppdrag innenfor ±1 time fra flyloggens starttid. Dette gjør at oppdrag som er planlagt tidligere/senere på samme dag ikke dukker opp som valgmuligheter.

### Løsning
Endre tidsvinduet i `findMatchingFlightLog` fra ±1 time til hele kalenderdagen (00:00–23:59) basert på flyloggens dato. Beholde sortering etter nærmest i tid, og forhåndsvelge det nærmeste oppdraget.

### Endring

**`src/components/UploadDroneLogDialog.tsx`** — i `findMatchingFlightLog` (linje ~1218-1221):

Erstatt:
```typescript
const flightEndMs = flightStart.getTime() + (data.durationMinutes || 0) * 60 * 1000;
const windowMs = 60 * 60 * 1000; // 1 hour
const rangeStart = new Date(flightStart.getTime() - windowMs).toISOString();
const rangeEnd = new Date(flightEndMs + windowMs).toISOString();
```

Med:
```typescript
// Match all missions from the same calendar day (local time)
const dayStart = new Date(flightStart);
dayStart.setHours(0, 0, 0, 0);
const dayEnd = new Date(flightStart);
dayEnd.setHours(23, 59, 59, 999);
const rangeStart = dayStart.toISOString();
const rangeEnd = dayEnd.toISOString();
```

Resten av logikken (sortering etter nærmest i tid, forhåndsvalg av nærmeste) forblir uendret.

### Fil som endres
- `src/components/UploadDroneLogDialog.tsx` — 4 linjer endres

