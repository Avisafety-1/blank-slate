## Bakgrunn

Vi har allerede tour-infrastruktur (`GuidedTourProvider`, `driver.js`, `StartTourButton`, `tourDefinitions`) og tre eksisterende guider: system-overview, dashboard-widgets og mission-creation. Brukeren vil ha guidede tour-er for de tre mest brukte daglig-flyt-dialogene:

1. **Start flygning** (`StartFlightDialog`) — åpnes fra «Start flygning»-knappen på dashbordet.
2. **Avslutt flygning / Logg flytid** (`LogFlightTimeDialog`) — åpnes når en aktiv flygning stoppes, eller fra «Logg flytid manuelt» / «Avslutt flygning».
3. **Last opp DJI-logg** (`UploadDroneLogDialog`) — åpnes fra «Last opp flylogg» og inneholder også ventende auto-sync-logger.

Alle tre er popup-dialoger som ligger over dashbordet. Vi gjenbruker mønsteret fra forrige fix: starte tour fra dashbordet, åpne dialogen i `beforeStep`, høyne dialogens z-index ift. tour-overlay (allerede gjort i `tour-styles.css`), og bruke `optional: true` på alle steg.

## Endring

### 1. Tre nye tour-definisjoner

Legg til i `src/tours/`:

- `startFlightTour.ts` (id: `"start-flight"`)
- `logFlightTour.ts` (id: `"log-flight"`)
- `uploadDroneLogTour.ts` (id: `"upload-drone-log"`)

Registrer dem i `src/tours/tourDefinitions.ts` og legg de tre nye id-ene i `TourId`-unionen i `src/tours/types.ts`. Inkluder dem i `tourList` slik at `StartTourButton` automatisk lister dem under «Min profil → Kompetanse».

### 2. Steg per tour

**Start flygning (8 steg, alle på `/`):**

1. Intro — highlight «Start flygning»-knappen (`dashboard-flight-controls`). `beforeStep` lukker dialogen hvis åpen.
2. Åpne dialogen — `beforeStep` klikker «Start flygning», highlight DialogTitle.
3. Lufttrafikk-banner — forklarer at AviSafe sjekker nærmeste trafikk automatisk (skips hvis ingen banner vises).
4. Sjekklister — highlight sjekkliste-seksjonen, forklarer påkrevde sjekklister før start.
5. Velg oppdrag — highlight `mission-select`.
6. Publiseringsmodus — highlight RadioGroup (none / advisory / live UAV) og forklarer SafeSky/Live UAV.
7. DroneTag-enhet — highlight DroneTag-velgeren (vises kun ved live UAV; `optional: true`).
8. Start-knapp — highlight footer-knappen «Start flygning».

**Avslutt / logg flytid (9 steg, alle på `/`):**

1. Intro — highlight «Avslutt flygning»- eller «Logg flytid»-knappen. Forklar at samme dialog brukes for stopp av aktiv flygning og manuell logging.
2. Åpne dialogen — `beforeStep` klikker «Logg flytid manuelt» (sikrere enn å stoppe en faktisk flygning).
3. Tilknytt oppdrag + «Marker som fullført»-checkbox.
4. Drone (vehicle) select.
5. Pilot select.
6. Personell / passasjerer (hvis seksjonen finnes; `optional`).
7. Dato + avgang/landing/varighet — forklar at varighet auto-beregnes.
8. Bevegelser + operasjonstype (VLOS/BVLOS).
9. Lagre-knappen i footer.

**Last opp DJI-logg (8 steg, alle på `/`):**

1. Intro — highlight «Last opp flylogg»-knappen. `beforeStep` lukker andre dialoger.
2. Åpne dialogen — `beforeStep` klikker knappen, highlight DialogTitle.
3. Manuell filopplasting — highlight upload-zonen («Last opp fil»-kortet).
4. Bulk-opplasting (flere filer samtidig).
5. DJI auto-sync-knappen («Logg inn med DJI»), forklarer at logger hentes automatisk.
6. Ventende logger-listen (`PendingDjiLogsSection`) — forklar «Kun mine»-bryteren og fargene (gul = rate-limit, rød = feil, grønn check = matchet drone).
7. Match-/oppdrag-tilknytning — informativt steg uten target (`optional`, target = body), forklarer at man velger oppdrag og kobler ny drone/batteri ved behov.
8. Avslutt — peker på «Avbryt/Lukk»-knappen, forklarer at behandlede logger flyttes til Statistikk → Flylogg.

### 3. Nye `data-tour`-attributter som må legges til

I `src/pages/Index.tsx`:

- `data-tour="dashboard-start-flight"` på «Start flygning»-knappen (mobil + desktop).
- `data-tour="dashboard-end-flight"` på «Avslutt flygning»-knappen.
- `data-tour="dashboard-upload-log"` på «Last opp flylogg»-menyvalget i dropdown.
- `data-tour="dashboard-log-manual"` på «Logg flytid manuelt»-menyvalget.

I `src/components/StartFlightDialog.tsx`:

- `data-tour="start-flight-dialog"` på `DialogContent`.
- `data-tour="start-flight-traffic"` på lufttrafikk-banneret.
- `data-tour="start-flight-checklists"` på sjekkliste-wrapperen.
- `data-tour="start-flight-mission"` på mission-select-wrapperen.
- `data-tour="start-flight-publish-mode"` på RadioGroup-wrapperen.
- `data-tour="start-flight-dronetag"` på DroneTag-velgeren.
- `data-tour="start-flight-submit"` på «Start»-knappen i footer.

I `src/components/LogFlightTimeDialog.tsx`:

- `data-tour="log-flight-dialog"` på `DialogContent`.
- `data-tour="log-flight-mission"`, `log-flight-drone"`, `log-flight-pilot"`, `log-flight-personnel"`, `log-flight-times"`, `log-flight-movements"`, `log-flight-submit"` på respektive seksjoner.

I `src/components/UploadDroneLogDialog.tsx`:

- `data-tour="upload-log-dialog"` på `DialogContent`.
- `data-tour="upload-log-file"` på «Last opp fil»-kortet.
- `data-tour="upload-log-bulk"` på bulk-knappen/seksjonen.
- `data-tour="upload-log-dji"` på DJI-auto-sync-knappen.
- `data-tour="upload-log-pending"` på `PendingDjiLogsSection`-wrapperen.
- `data-tour="upload-log-close"` på Avbryt-knappen i footer.

### 4. `beforeStep`-hjelpere

For alle tre tour-er trenger vi en pålitelig måte å åpne riktig dialog uten å klikke et menypunkt som krever to klikk. Vi legger inn en liten hjelper i `tourUtils.ts`:

```ts
export const openByTour = async (selector: string, waitMs = 350) => {
  document.querySelector<HTMLElement>(selector)?.click();
  await sleep(waitMs);
};
```

For `dashboard-log-flight`-dropdownen må vi først åpne dropdownen (klikk trigger, vente, klikk menypunkt). Hjelperen håndterer to-klikks-tilfellet ved å akseptere en array av selektorer.

### 5. Det vi ikke endrer

- Tour-infrastruktur (`GuidedTourProvider`, `tour-styles.css`, `StartTourButton`).
- Eksisterende tour-er (system-overview, dashboard-widgets, mission-creation).
- Forretningslogikk i de tre dialogene — kun nye `data-tour`-attributter.
- Ingen API-endringer.

### 6. Robusthet

- Alle steg får `optional: true` slik at de hoppes gracefully over (f.eks. lufttrafikk-banner uten data, DroneTag-velger når Live UAV ikke er valgt, personell-seksjon hvis ikke aktivert).
- `beforeStep` lukker forrige dialog før neste tour-steg åpner sin egen, slik at vi ikke får stablede dialoger.
- Vi bruker `waitForElement` (allerede i `tourUtils`) for å håndtere lazy-rendering i dialogene.

### Tekniske detaljer (for utviklere)

- `StartTourButton` itererer `tourList` automatisk — ingen UI-endring nødvendig der.
- `TourId`-typen må utvides; alle tre id-ene må legges til i `allTours`-mappet i `tourDefinitions.ts`.
- driver.js-popoveren kan vise seg utenfor dialogen fordi `tour-styles.css` allerede setter z-index 10005 på `.avisafe-tour`.
- For dialoger med `max-h-[90vh]` og intern scroll må vi sette `smoothScroll: true` (allerede på) — `driver.js` håndterer scroll-into-view innenfor scroll-containere.
