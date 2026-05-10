## Problem

I touren `log-flight` (Logg flytid / avslutt flygning) og `start-flight` åpner ikke dialogene som forventet:

1. **Logg flytid manuelt** — touren prøver å åpne dropdown-menyen (`<DropdownMenuTrigger asChild>` rundt en Button) ved å kalle `.click()`. Radix DropdownMenu lytter på `onPointerDown`, ikke `onClick`, så et programmatisk `HTMLElement.click()` åpner ikke menyen. Dermed finner helper aldri `[data-tour="dashboard-log-manual"]` og dialogen åpnes aldri.
2. **Avslutt flygning** — `handleEndFlight` returnerer tidlig med toast-feilen «Ingen aktiv flygning» når `!isActive`. Touren har ingen mulighet til å demonstrere dialogen uten å faktisk starte en flygning.
3. **Start flygning** — samme dialog (`StartFlightDialog`) åpnes via `setStartFlightConfirmOpen(true)`. Knappen er en vanlig Button, så `.click()` virker når `!isActive`. Problemet kan likevel oppstå når flighten allerede er aktiv (knappen er disabled). I tillegg er det skjørt å lete via `button:not([disabled])` siden rekkefølgen avhenger av layout.

## Løsning

Eksponer tour-trygge åpne-funksjoner globalt fra dashbordet og kall dem direkte fra touren. Da slipper vi å late som om vi klikker på UI, og vi kan «overstyre» kravet om aktiv flygning kun for tour-formål.

### 1. Tour-bridge på dashbordet (`src/pages/Index.tsx`)

Legg til en `useEffect` som registrerer hjelpere på `window.__avisafeTour`:

```ts
useEffect(() => {
  (window as any).__avisafeTour = {
    openStartFlight: () => setStartFlightConfirmOpen(true),
    openLogFlight: () => setLogFlightDialogOpen(true),
    openUploadLog: () => setUploadDroneLogOpen(true),
  };
  return () => { delete (window as any).__avisafeTour; };
}, []);
```

Ingen forretningslogikk endres — dette er bare en alternativ inngang som setter samme `open`-state som de eksisterende knappene.

### 2. Oppdater tour-hjelpere

**`src/tours/logFlightTour.ts`** — `openLogFlightDialog`:

```ts
const openLogFlightDialog = async () => {
  if (document.querySelector('[data-tour="log-flight-dialog"]')) return;
  (window as any).__avisafeTour?.openLogFlight?.();
  await sleep(450);
};
```

**`src/tours/startFlightTour.ts`** — `openStartFlightDialog`:

```ts
const openStartFlightDialog = async () => {
  if (document.querySelector('[data-tour="start-flight-dialog"]')) return;
  (window as any).__avisafeTour?.openStartFlight?.();
  await sleep(450);
};
```

**`src/tours/uploadDroneLogTour.ts`** — `openUploadDialog`:

```ts
const openUploadDialog = async () => {
  if (document.querySelector('[data-tour="upload-log-dialog"]')) return;
  (window as any).__avisafeTour?.openUploadLog?.();
  await sleep(450);
};
```

Dette løser også upload-touren som har samme Radix-dropdown-problem på mobil.

### 3. Overstyring for «Avslutt flygning» i tour-modus

Når `LogFlightTimeDialog` åpnes via touren uten aktiv flygning er det greit — den fungerer som manuell logging og demonstrerer alle felter. Vi trenger ikke endre `handleEndFlight`. Tour-teksten i steg `intro` justeres så den ikke gir inntrykk av at man må ha en aktiv flygning:

> «Når du stopper en aktiv flygning åpnes denne dialogen automatisk og fyller ut tid, drone og pilot. Du kan også åpne den manuelt for å logge en flygning i etterkant — vi viser sistnevnte nå.»

### 4. Det vi ikke endrer

- Ingen endringer i `StartFlightDialog`, `LogFlightTimeDialog` eller `UploadDroneLogDialog`.
- Ingen endringer i `useFlightTimer` eller `handleEndFlight`-logikk.
- Ingen endring av `data-tour`-attributter — bare hjelpefunksjonene i tour-filene.
- `incident-report`, `mission-creation` etc. berøres ikke (de bruker ikke Radix-dropdowns på samme måte).

### Tekniske detaljer

- `window.__avisafeTour` er bare montert mens `Index.tsx` lever (cleanup i useEffect). Andre sider trenger ikke disse — alle tre touren har `route: "/"` på dialog-stegene.
- TypeScript: vi caster til `any` i tour-filene for å unngå global type-augmentering. Alternativt kan vi legge en global.d.ts-deklarasjon hvis vi vil ha typer — ikke nødvendig her.
- Eksisterende `closeAnyOpenDialog` brukes uendret før `intro`-steg.
