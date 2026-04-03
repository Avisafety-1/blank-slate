

## Fix: Feil nullpunkt på stikke-widget for DJI vs ArduPilot

### Problem
`StickWidget` bruker `x > 900 || y > 900` for å auto-detektere om verdiene er ArduPilot (1000–2000) eller DJI (364–1684). DJI-verdier går opp til 1684, som feilaktig treffer ArduPilot-sjekken. Da brukes feil min/max og nullpunktet forskyves.

### Løsning
Flytte deteksjonen opp til `FlightAnalysisTimeline`, som har tilgang til **alle** RC-verdier i hele flyturen. Skann alle posisjoner én gang: hvis noen RC-verdi > 1700 → ArduPilot, ellers DJI. Send `inputRange` som prop ned til `StickWidget`.

### Endringer

**1. `src/components/dashboard/StickWidget.tsx`**
- Legg til valgfri prop `inputRange: 'dji' | 'ardupilot'`
- Bruk `inputRange` i stedet for auto-deteksjon
- Fallback til auto-deteksjon hvis `inputRange` ikke er satt (bakoverkompatibel)

**2. `src/components/dashboard/FlightAnalysisTimeline.tsx`**
- Beregn `rcInputRange` med `useMemo`: skann alle RC-verdier, hvis noen > 1700 → `'ardupilot'`, ellers `'dji'`
- Send `inputRange={rcInputRange}` til begge `StickWidget`-instanser

### Teknisk detalj
- DJI: 364–1684, nullpunkt 1024
- ArduPilot: 1000–2000, nullpunkt 1500
- Terskel 1700 er trygg: DJI maks er 1684, ArduPilot sentrum er 1500

### Filer som endres
- `src/components/dashboard/StickWidget.tsx`
- `src/components/dashboard/FlightAnalysisTimeline.tsx`

