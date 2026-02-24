

# Fix: Flight log matching bruker feil dato-parser

## Årsak

I `findMatchingFlightLog` (linje 325):
```typescript
const d = new Date(data.startTime);
```

`data.startTime` er i DJI-format (`"5/5/2023T11:36:03.86 AMZ"`), som `new Date()` ikke klarer å parse. Resultatet er `NaN`, så koden faller tilbake til dagens dato (linje 329-331). Dermed søkes det etter flight_logs på dagens dato i stedet for den faktiske flydatoen, og ingen match blir funnet.

Funksjonen `parseFlightDate` som håndterer dette formatet korrekt eksisterer allerede i filen, men brukes ikke her.

## Fix

**Fil:** `src/components/UploadDroneLogDialog.tsx`

**Linje 325** — Endre fra:
```typescript
const d = new Date(data.startTime);
```

Til:
```typescript
const d = parseFlightDate(data.startTime);
```

`parseFlightDate` returnerer allerede en `Date | null`, og sjekken på linje 326 (`!isNaN(d.getTime())`) håndterer null via optional chaining (trenger liten justering til `d && !isNaN(d.getTime())`).

Endret sjekk på linje 326:
```typescript
if (d && !isNaN(d.getTime())) flightDate = d;
```

To linjer, en fil.

