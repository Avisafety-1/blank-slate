

# Fix: Falsk "batterinivå gikk ned til -1%" advarsel

## Årsak

I edge-funksjonen `process-dronelog/index.ts`, linje 207:
```typescript
let minBattery = batteryIdx >= 0 ? 100 : -1;
```

Når `BATTERY.chargeLevel [%]`-kolonnen ikke finnes i CSV-en (eldre loggfiler eller annet format), settes `minBattery = -1`. Deretter på linje 341:
```typescript
if (minBattery < 20) {
  warnings.push({ type: "low_battery", message: `Batterinivå gikk ned til ${minBattery}%`, value: minBattery });
}
```

Siden `-1 < 20` er `true`, genereres alltid en falsk advarsel. I tillegg brukes `-1` direkte i notes-teksten (linje 506 i klienten).

## Fix

**Fil: `supabase/functions/process-dronelog/index.ts`** — Linje 341: Legg til sjekk for at `minBattery >= 0` (dvs. at vi faktisk har batteridata):

```typescript
if (minBattery >= 0 && minBattery < 20) {
```

Det er alt. En betingelse, en linje, en fil. Edge-funksjonen må redeployes.

