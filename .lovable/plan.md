

## Fix: Crash ved åpning av oppdragsdetaljer (wind_speed)

### Rotårsak
`DroneWeatherPanel` aksesserer `savedWeatherData.current.wind_speed` (linje 302) uten å sjekke om `current` finnes. Noen lagrede vær-snapshots mangler `current`-objektet (f.eks. hvis API-kallet feilet delvis, eller datastrukturen ble endret).

### Plan

**Fil: `src/components/DroneWeatherPanel.tsx`**
- Linje 244: Legg til en guard som sjekker at `savedWeatherData.current` finnes før rendering av historisk værdata. Hvis `current` mangler, vis en enkel melding som "Værdata ufullstendig" i stedet for å krasje.

```typescript
// Linje 244 — endre fra:
if (isHistorical && savedWeatherData) {

// til:
if (isHistorical && savedWeatherData) {
  if (!savedWeatherData.current) {
    return (
      <Card className="mt-3 p-3 bg-card/50 border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5" />
          <span>Værdata ufullstendig for dette oppdraget</span>
        </div>
      </Card>
    );
  }
```

Én liten endring — eliminerer crashen uten å påvirke oppdrag med korrekt lagret værdata.

