

## Fix: ArduPilot .zip-filer rutes til feil edge function

### Problem
Frontenden sjekker kun `file.name.endsWith('.bin')` for å rute til `process-ardupilot`. Når du laster opp en `.zip`-fil (som inneholder en ArduPilot `.bin`), sendes den til `process-dronelog` (DJI-parseren), som ikke kan lese ArduPilot-data — derav 500-feilen.

Edge function `process-ardupilot` håndterer allerede `.zip`-filer med `.bin` inni, men frontenden sender dem aldri dit.

### Løsning
Brukeren må kunne velge filtype, eller systemet må forsøke å gjette. Enkleste tilnærming: legg til en valgmulighet i upload-dialogen der brukeren kan angi at det er en ArduPilot-logg, ELLER inspiser zip-innholdet klient-side.

**Anbefalt: La brukeren velge loggtype** — en enkel toggle/select i upload-dialogen.

### Endring

**`src/components/UploadDroneLogDialog.tsx`**

1. Legg til state `logType: 'auto' | 'dji' | 'ardupilot'` (default `'auto'`)
2. Vis en enkel Select/RadioGroup under filopplasteren: «Loggtype: Automatisk / DJI / ArduPilot»
3. Oppdater rutinglogikken (linje 593 og 657):

```text
// Nåværende:
const isArduPilot = file.name.toLowerCase().endsWith('.bin');

// Nytt:
const fileName = file.name.toLowerCase();
const isArduPilot = logType === 'ardupilot' 
  || (logType === 'auto' && (fileName.endsWith('.bin')));
```

Når brukeren eksplisitt velger «ArduPilot», sendes `.zip`-filer til `process-ardupilot`. I «auto»-modus fungerer det som i dag (`.bin` → ArduPilot, alt annet → DJI).

### Filer som endres

| Fil | Endring |
|-----|---------|
| `src/components/UploadDroneLogDialog.tsx` | Legg til `logType` state + Select-komponent + oppdater ruting på 2 steder |

