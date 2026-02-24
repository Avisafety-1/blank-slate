

# Fix: Match flylogger på dato/klokkeslett + gi valg ved ingen treff

## Problem

`findMatchingFlightLog` matcher på flytid (varighet) med 20% toleranse og søker siste 7 dager. Brukeren vil at matching skal baseres på dato og klokkeslett, og at man alltid skal få valget om å opprette nytt oppdrag hvis ingen match finnes innenfor 1 time.

## Løsning

**Fil: `src/components/UploadDroneLogDialog.tsx`**

### 1. Endre `findMatchingFlightLog` (linje 256-278)

Erstatt hele funksjonen med ny logikk:
- Parse `result.startTime` til en dato
- Filtrer `flight_logs` på eksakt `flight_date` (samme dato) og `company_id`
- For hvert treff: sammenlign klokkeslett fra DJI-loggens `startTime` med oppdragets `tidspunkt` (via join `missions(tittel, tidspunkt)`)
- Match hvis tidsdifferansen er innenfor **60 minutter**
- Hvis ingen match: `setMatchedLog(null)` — UI viser allerede "Opprett nytt oppdrag"-knappen (linje 662-666, 675-679)

### 2. Ingen UI-endringer nødvendig

Eksisterende UI håndterer allerede begge scenarioer:
- **Match funnet** (linje 649-661): Viser grønn boks med "Eksisterende flylogg funnet!" og "Oppdater flylogg"-knapp
- **Ingen match** (linje 662-666): Viser blå boks med "Ingen eksisterende flylogg matcher. Du kan opprette et nytt oppdrag." og "Opprett nytt oppdrag"-knapp

### Ny `findMatchingFlightLog`-logikk

```typescript
const findMatchingFlightLog = async (data: DroneLogResult) => {
  if (!companyId || !data.startTime) return;
  const flightDate = new Date(data.startTime);
  if (isNaN(flightDate.getTime())) return;
  const dateStr = flightDate.toISOString().split('T')[0];

  let query = supabase
    .from('flight_logs')
    .select('id, flight_date, flight_duration_minutes, drone_id, departure_location, landing_location, mission_id, missions(tittel, tidspunkt)')
    .eq('company_id', companyId)
    .eq('flight_date', dateStr)
    .order('flight_date', { ascending: false });
  if (selectedDroneId) query = query.eq('drone_id', selectedDroneId);

  const { data: logs } = await query;
  if (!logs || logs.length === 0) return;

  // Match på klokkeslett (innenfor 60 min)
  for (const log of logs) {
    const missionTime = (log as any).missions?.tidspunkt;
    if (missionTime) {
      const missionDate = new Date(missionTime);
      const diffMs = Math.abs(flightDate.getTime() - missionDate.getTime());
      if (diffMs <= 60 * 60 * 1000) {
        setMatchedLog(log as any);
        return;
      }
    }
  }

  // Fallback: Hvis kun én logg på samme dato, foreslå den
  if (logs.length === 1) {
    setMatchedLog(logs[0] as any);
  }
};
```

Endringen påvirker kun matchingslogikken -- ingen andre filer eller UI-endringer.

