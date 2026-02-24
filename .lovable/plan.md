

# Fix: Feil dato og matching-logikk ved DJI-import

## Analyse

To separate problemer identifisert:

### Problem 1: Feil dato (viser dagens dato)

I `findMatchingFlightLog` (linje 257):
```typescript
if (!companyId || !data.startTime) return;
```

Hvis `DETAILS.startTime` fra DroneLog API er tom/null, avbrytes matching umiddelbart. I `handleCreateNew` (linje 322):
```typescript
const flightDate = result.startTime ? new Date(result.startTime) : new Date();
```

Fallback til `new Date()` gir dagens dato. DJI-loggen inneholder sannsynligvis dato i `CUSTOM.dateTime`-feltet per rad, men edge-funksjonen bruker bare dette som fallback for `startTime`-variabelen. Hvis begge er tomme, har vi ingen dato.

### Problem 2: Matching fungerer ikke ved re-import

`findMatchingFlightLog` sjekker bare `missions.tidspunkt` innenfor 60-minuttersvinduet. Den burde OGSÅ matche direkte mot eksisterende `flight_logs` basert på:
- Samme dato
- Samme drone
- Lignende varighet

Dessuten: Hvis startTime er null, avbrytes matchingen fullstendig (linje 257).

### Bonus: handleUpdateExisting mangler nedsampling

`handleUpdateExisting` (linje 296) bruker fortsatt alle posisjonspunkter uten nedsampling.

---

## Plan

### Fil: `src/components/UploadDroneLogDialog.tsx`

**1. Legg til client-side logging av startTime (for debugging)**

Etter `setResult(data)` i både `handleUpload` og `handleSelectDjiLog`, logg `data.startTime` til konsollen.

**2. Forbedre `findMatchingFlightLog` (linje 256-290)**

- Fjern early return på null startTime
- Beregn dato fra startTime ELLER bruk posisjonenes timestamps
- Match direkte mot `flight_logs` basert på dato + drone, uten å kreve missions.tidspunkt
- Behold 60-min tidsvindu som bonus-matching, men fall tilbake til dato-matching

Ny logikk:
```typescript
const findMatchingFlightLog = async (data: DroneLogResult) => {
  if (!companyId) return;
  
  // Bestem dato: fra startTime, eller fra positions-timestamps, eller i dag
  let flightDate: Date | null = null;
  if (data.startTime) {
    const d = new Date(data.startTime);
    if (!isNaN(d.getTime())) flightDate = d;
  }
  
  const dateStr = flightDate 
    ? flightDate.toISOString().split('T')[0] 
    : new Date().toISOString().split('T')[0];

  let query = supabase
    .from('flight_logs')
    .select('id, flight_date, flight_duration_minutes, drone_id, departure_location, landing_location, mission_id, missions(tittel, tidspunkt)')
    .eq('company_id', companyId)
    .eq('flight_date', dateStr)
    .order('flight_date', { ascending: false });
  if (selectedDroneId) query = query.eq('drone_id', selectedDroneId);

  const { data: logs } = await query;
  if (!logs || logs.length === 0) return;

  // 1. Prøv tidsmatch (60 min vindu) hvis vi har startTime
  if (flightDate) {
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
  }

  // 2. Match på drone + lignende varighet
  if (selectedDroneId && data.durationMinutes > 0) {
    const durationMatch = logs.find(l => 
      l.drone_id === selectedDroneId && 
      Math.abs((l.flight_duration_minutes || 0) - data.durationMinutes) <= 2
    );
    if (durationMatch) {
      setMatchedLog(durationMatch as any);
      return;
    }
  }

  // 3. Fallback: kun én logg på datoen
  if (logs.length === 1) {
    setMatchedLog(logs[0] as any);
  }
};
```

**3. Legg til nedsampling i `handleUpdateExisting` (linje 296)**

Erstatt direkte mapping med samme nedsamplings-logikk som i `handleCreateNew`.

**4. Total: 3 endringer i samme fil**

- Linje 256-290: Ny matching-logikk
- Linje 296: Nedsampling i handleUpdateExisting
- Linje 188-190 og 243-244: Console.log for debugging av startTime

