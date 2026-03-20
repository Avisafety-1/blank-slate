

## Plan: Smartere presentasjon av APP-advarsler

### Problemet
1. APP_WARNING-meldinger vises som en lang, sammenslått streng i warnings-boksen — vanskelig å lese og krever horisontal scrolling
2. Mange duplikate/repeterende advarsler (f.eks. "Image transmission signal weak" dukker opp flere ganger med litt ulik tekst)
3. Lavprioritet-advarsler (signalstyrke-info) blandes med faktisk kritiske hendelser

### Løsning: Kategorisere, deduplisere og prioritere

**1. Backend — `process-dronelog/index.ts` (linje 523-526)**

I stedet for å slå sammen alle app-advarsler til én lang streng, kategoriser dem:

- **Kritisk** (rød): "Emergency", "Crash", "Motor", "Propeller"
- **Viktig** (gul): "Battery", "RTH", "Landing", "GPS", "Compass", "IMU"
- **Informasjon** (grå): "Signal weak", "Downlink", "Image transmission", "Antenna"

Endre warnings-output fra:
```
{ type: "app_warning", message: "App-advarsler: msg1; msg2; msg3; msg4; msg5" }
```
Til separate, dedupliserte warnings per kategori:
```
{ type: "app_warning_critical", message: "Motor overbelastet", severity: "critical" }
{ type: "app_warning_important", message: "GPS signal svakt", severity: "warning" }
{ type: "app_warning_info", message: "Bildeoverføring svakt signal (3x)", severity: "info", count: 3 }
```

Deduplisering: Normaliser meldinger (fjern "Adjust antennas and fly with caution" vs "Adjust antennas" → samme kategori) og tell forekomster.

**2. Frontend — `UploadDroneLogDialog.tsx` (linje 1786-1808 + 2382-2420)**

- Vis kritiske og viktige advarsler som separate warning-kort (som i dag, men hver for seg)
- Vis info-advarsler som en sammenfoldet seksjon: "3 informasjonsmeldinger" som kan utvides
- Bruk `break-words` / `whitespace-normal` på meldingsteksten for å unngå horisontal scroll
- Vis antall forekomster som badge: "Bildeoverføring svakt signal ×3"

**3. Hendelseslisten (events) — samme filer**

Dedupliser APP_WARNING events i visningen:
- Grupper like APP_WARNING-meldinger og vis "×N" i stedet for å liste hver enkelt
- Behold tidsstempel for første forekomst

### Filer som endres
- `supabase/functions/process-dronelog/index.ts` — kategoriser og dedupliser app_warnings
- `src/components/UploadDroneLogDialog.tsx` — smartere warning-UI med folding og word-wrap

### Forventet resultat
- Kritiske advarsler er tydelig synlige
- Signalstyrke-meldinger er kompakt oppsummert ("×3") og foldet bort
- Ingen horisontal scrolling
- Eksisterende flylogger med gammel format vises fortsatt (bakoverkompatibelt)

