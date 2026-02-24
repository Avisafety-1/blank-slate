

# Fix: Bruk CUSTOM.date og CUSTOM.updateTime for korrekt dato/tid

## Analyse

Nåværende edge-funksjon bruker `DETAILS.startTime` som primærkilde for dato, med `CUSTOM.dateTime` som fallback. Problemet er at `DETAILS.startTime` ofte er tom i mange DJI-logger, og `CUSTOM.dateTime` kan også mangle eller ha uventet format.

De nye feltene du fant gir bedre alternativer:
- `CUSTOM.date [UTC]` — ren dato i UTC
- `CUSTOM.updateTime [UTC]` — tidspunkt i UTC
- `DETAILS.aircraftSerial` — kan være et alternativt felt for serienummer

## Plan

### Fil: `supabase/functions/process-dronelog/index.ts`

**1. Utvid FIELDS-listen (linje 12-20)**

Legg til disse nye feltene:
```
CUSTOM.date [UTC]
CUSTOM.updateTime [UTC]
```

**2. Parse de nye feltene (linje 82-83 området)**

Legg til indekser for:
- `CUSTOM.date [UTC]`
- `CUSTOM.updateTime [UTC]`

**3. Forbedre startTime-beregningen (linje 109-113)**

Endre fallback-rekkefølgen:
```
1. DETAILS.startTime (eksisterende)
2. CUSTOM.date [UTC] + CUSTOM.updateTime [UTC] (kombinert til ISO-streng)
3. CUSTOM.dateTime (eksisterende fallback)
4. Første rad sin CUSTOM.date [UTC] alene (bare dato, uten klokkeslett)
```

Ny logikk:
```typescript
let flightStartTime = startTime || "";

// Fallback 1: Kombiner CUSTOM.date [UTC] og CUSTOM.updateTime [UTC]
if (!flightStartTime && customDateUtc) {
  if (customTimeUtc) {
    flightStartTime = `${customDateUtc}T${customTimeUtc}Z`;
  } else {
    flightStartTime = `${customDateUtc}T00:00:00Z`;
  }
}

// Fallback 2: CUSTOM.dateTime
if (!flightStartTime && dateTimeIdx >= 0 && firstRow[dateTimeIdx]) {
  flightStartTime = firstRow[dateTimeIdx];
}
```

**4. Legg til auto-matching av drone basert på serienummer (bonus)**

Returner `aircraftSN` som allerede gjøres. Klienten (`UploadDroneLogDialog.tsx`) kan i fremtiden bruke dette til automatisk valg av drone basert på serienummer.

### Fil: `supabase/functions/process-dronelog/index.ts` — Oppsummering

- Linje 12-20: Legg til `CUSTOM.date [UTC]` og `CUSTOM.updateTime [UTC]` i FIELDS
- Linje 82-83: Nye findHeaderIndex-kall
- Linje 98-113: Ekstraher verdiene og forbedre fallback-kjeden for flightStartTime

### Edge function må redeployes

Endringen er i en Supabase Edge Function, så den må deployes på nytt etter endringen.

