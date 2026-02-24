

# Utvid DJI-import med bedre dato/tid, serienummer og batteridata

## Oversikt

To filer må endres: edge-funksjonen (for å hente flere felter fra DroneLog API) og dialogen (for å vise de nye dataene). I tillegg implementeres den godkjente planen for `CUSTOM.date [UTC]` + `CUSTOM.updateTime [UTC]` for korrekt dato/tid.

---

## Fil 1: `supabase/functions/process-dronelog/index.ts`

### 1. Utvid FIELDS-listen (linje 12-20)

Legg til nye felter:
- `CUSTOM.date [UTC]` — ren dato i UTC
- `CUSTOM.updateTime [UTC]` — tid i UTC
- `DETAILS.aircraftSerial` — alternativt serienummer-felt
- `DETAILS.batterySN` — batteriets serienummer
- `DETAILS.totalTime [s]` — total flytid fra metadata
- `DETAILS.maxDistance [m]` — maks avstand fra hjemmeposisjon
- `DETAILS.maxVSpeed [m/s]` — maks vertikal hastighet
- `BATTERY.fullCapacity [mAh]` — batteriets fulle kapasitet
- `BATTERY.currentCapacity [mAh]` — gjeldende kapasitet
- `BATTERY.life [%]` — batterilevetid/helse
- `BATTERY.status` — batteristatus

### 2. Parse nye felter (linje 80-93 området)

Legg til `findHeaderIndex`-kall for alle nye felter.

### 3. Ekstraher nye metadata fra firstRow (linje 98-113)

- `CUSTOM.date [UTC]` og `CUSTOM.updateTime [UTC]` for dato/tid
- `DETAILS.aircraftSerial` som fallback for `aircraftSN`
- `DETAILS.batterySN`, `DETAILS.maxDistance`, `DETAILS.maxVSpeed`, `DETAILS.totalTime`
- `BATTERY.fullCapacity`, `BATTERY.currentCapacity`, `BATTERY.life`, `BATTERY.status`

### 4. Forbedre startTime-fallback (linje 109-113)

Ny prioritert rekkefølge:
1. `DETAILS.startTime`
2. `CUSTOM.date [UTC]` + `CUSTOM.updateTime [UTC]` → kombinert ISO-streng
3. `CUSTOM.dateTime` (eksisterende)
4. `CUSTOM.date [UTC]` alene med `T00:00:00Z`

### 5. Utvid return-objektet (linje 220-232)

Nye felter i responsen:
```typescript
aircraftSerial: aircraftSerial || aircraftSN || null,
batterySN: batterySN || null,
batteryHealth: batteryLife (prosent),
batteryFullCapacity: fullCapacity (mAh),
batteryCurrentCapacity: currentCapacity (mAh),
batteryStatus: status-streng,
maxDistance: maks avstand (m),
maxVSpeed: maks vertikal hastighet (m/s),
totalTimeSeconds: total tid fra DETAILS
```

### 6. Bruk `DETAILS.aircraftSerial` som fallback for `aircraftSN`

Hvis `DETAILS.aircraftSN` er tom, bruk `DETAILS.aircraftSerial`.

---

## Fil 2: `src/components/UploadDroneLogDialog.tsx`

### 1. Utvid `DroneLogResult`-interface (linje 17-41)

Legg til nye felter:
```typescript
aircraftSerial: string | null;
batterySN: string | null;
batteryHealth: number | null;
batteryFullCapacity: number | null;
batteryCurrentCapacity: number | null;
batteryStatus: string | null;
maxDistance: number | null;
maxVSpeed: number | null;
totalTimeSeconds: number | null;
```

### 2. Forbedre resultat-visningen (linje 604-683)

**Dato/tid-header (linje 608-619)**: Formater `startTime` pent med `format()` i stedet for rå ISO-streng.

**Drone-info (linje 614-618)**: Vis `aircraftSerial` som fallback for `aircraftSN`, og vis `batterySN` under drone-info.

**Utvid battery-seksjonen**: Legg til nye KPI-kort:
- Batterihelse (`batteryHealth`) med prosentvisning og farge (rød under 70%)
- Batterikapasitet (`batteryCurrentCapacity` / `batteryFullCapacity` mAh)
- Batteristatus
- Batteri-serienummer
- Maks avstand fra hjemmeposisjon
- Maks vertikal hastighet

### 3. Auto-match drone på serienummer

I `handleUpload` og `handleSelectDjiLog`, etter å ha fått result:
- Hvis `selectedDroneId` er tom og `result.aircraftSN` eller `result.aircraftSerial` finnes
- Sjekk om noen drone i `drones`-listen har matchende `serienummer`
- Sett `selectedDroneId` automatisk og vis en toast

---

## Tekniske detaljer

### Edge function FIELDS-endring
```
Nåværende: 22 felter
Etter endring: ~33 felter
```

Nye felter legges til i FIELDS-strengen (linje 12-20). Alle er valgfrie — hvis DroneLog ikke returnerer dem, får vi bare tomme verdier.

### Auto-match drone logikk (ny)
```typescript
// Etter setResult(data):
if (!selectedDroneId && (data.aircraftSN || data.aircraftSerial)) {
  const sn = (data.aircraftSN || data.aircraftSerial || '').trim();
  const match = drones.find(d => d.serienummer && d.serienummer.trim() === sn);
  if (match) {
    setSelectedDroneId(match.id);
    toast.info(`Drone matchet automatisk: ${match.modell}`);
  }
}
```

### Edge function må redeployes
Endringen er i en Supabase Edge Function og deployes automatisk.

