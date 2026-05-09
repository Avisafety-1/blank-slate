## Mål

Bygge et gjenbrukbart, robust guided-tour-system for AviSafe med to tourer ferdig (full systemoversikt + opprett oppdrag), startbart fra Kompetanse-fanen i profil og fra et lite "?" i Header.

## Bibliotek

Bruke **driver.js** (`driver.js` v1.x) — lettvekt (~5KB), framework-agnostisk, full kontroll over highlight/overlay, fungerer godt med Tailwind/shadcn og lar oss bygge custom popover-styling. React-joyride er tyngre og mer "låst" UI.

## Arkitektur

```text
src/tours/
  ├── types.ts                 // TourStep, TourDefinition typer
  ├── tourDefinitions.ts       // Sentral registry: allTours[]
  ├── systemOverviewTour.ts    // Full system-tour
  ├── missionCreationTour.ts   // Oppdrag-tour
  └── tourUtils.ts             // waitForElement, openMobileMenu, navigateAndWait

src/hooks/
  └── useGuidedTour.ts         // start(tourId), reset(tourId), isCompleted(tourId)

src/components/guided-tour/
  ├── GuidedTourProvider.tsx   // Context som omslutter app
  ├── StartTourButton.tsx      // "?" / "Start opplæring" knapp
  └── tour-styles.css          // shadcn-tilpasset popover-styling
```

## Tour-step-modell

```ts
type TourStep = {
  id: string;
  selector: string;            // f.eks. '[data-tour="nav-missions"]'
  title: string;               // norsk
  description: string;         // norsk, kort
  side?: 'top'|'bottom'|'left'|'right';
  route?: string;              // hvis steget krever ny side, navigeres dit først
  requiresAdmin?: boolean;
  requiresModule?: string;     // bruker canShowModule()
  beforeStep?: () => Promise<void>;  // f.eks. åpne dropdown
  optional?: boolean;          // skip stille om selector ikke finnes
};
```

## Robusthet

- `waitForElement(selector, timeout=2000)` — MutationObserver-basert, skipper steget hvis ikke funnet innen timeout (ingen krasj).
- Multi-side flyt: hvis `step.route` ≠ current → `navigate(route)`, vent på at selector dukker opp, så vis steg.
- Tilgang: filtrer steg gjennom `canShowModule()` (eksisterer i Header) + `isAdmin`/`isSuperadmin` fra `useAuth`.
- Mobil hamburger: `beforeStep` for nav-steg åpner DropdownMenu på mobil (sjekker `window.innerWidth < 1024`). Driver.js scroller selv inn i view.
- Tooltip-bredde: bruk `popoverClass` med `max-w-[90vw] sm:max-w-sm`.

## Tracking

- `localStorage["avisafe.tours.completed"] = ["system-overview", "mission-creation"]`
- `localStorage["avisafe.tours.skipped"] = [...]`
- Reset-knapp i Kompetanse-fanen tømmer disse.

## data-tour-attributter som legges til

**Navigasjon (Header.tsx, både desktop-knapper og dropdown-items):**
`nav-home, nav-missions, nav-map, nav-documents, nav-calendar, nav-incidents, nav-status, nav-resources, nav-statistics, nav-changelog, nav-installer, nav-admin, nav-profile, nav-notifications`

**Oppdrag-listen (Oppdrag.tsx):**
`mission-create-button`

**Oppdragsskjema (komponent under src/components/oppdrag/):**
`mission-title, mission-customer, mission-date, mission-location, mission-route-planner, mission-drone-select, mission-personnel, mission-equipment, mission-risk-assessment, mission-checklist, mission-save, mission-publish, mission-safesky, mission-flight-logs, mission-incident-report`

**Kart (Kart.tsx):**
`mission-map, mission-draw-area, mission-buffer-settings, mission-weather-airspace`

Alle attributtene legges til ikke-invasivt (kun `data-tour=` på eksisterende elementer, ingen logikk-endringer).

## Tour 1: Systemoversikt

~14 steg, ett per hovedmenypunkt. Hvert steg: navigerer ikke, bare highlighter menyknappen og forklarer modulen + når en droneoperatør bruker den. Steg filtreres dynamisk på `canShowModule` + admin-rolle.

## Tour 2: Opprett oppdrag (hovedprioritet)

~18 steg som spenner over flere sider:
1–2: Oppdrag-listen → "Nytt oppdrag"
3–14: Inne i oppdragsskjemaet (tittel, kunde, dato, sted, ruteplanlegger, dronevalg, personell, utstyr, risikovurdering, sjekkliste, lagre, publiser)
15: Kart-siden (ruteplanlegger, buffer/SORA-volum, vær/luftrom)
16–18: SafeSky live, etterlogging av flylogg, hendelsesrapportering

Steg som krever sideskifte bruker `route`-feltet og venter på element. Steg for funksjoner som ikke er aktive (f.eks. SafeSky disabled) skipper stille.

## UI-integrasjon

1. **Kompetanse-tab i ProfileDialog** (linje ~1325): nytt kort øverst "Opplæring & guider" med:
   - Knapp "Start systemguide" (badge "Fullført" hvis i localStorage)
   - Knapp "Start oppdrag-guide"
   - Lenke "Tilbakestill alle guider"
2. **Header**: lite ikon-knapp `<HelpCircle>` ved siden av notifications som åpner en liten dropdown med samme to valg. `data-tour="header-help"`.
3. **GuidedTourProvider** mountes i `App.tsx` rett innenfor `BrowserRouter` så den har tilgang til `useNavigate`.

## Norsk tekst & knapper

Driver.js støtter custom labels: `nextBtnText: "Neste"`, `prevBtnText: "Tilbake"`, `doneBtnText: "Fullfør"`, og custom "Hopp over"-knapp injiseres i `onPopoverRender`.

## Styling

Custom CSS i `tour-styles.css` overstyrer driver.js-popover med:
- `bg-card`, `border-border`, `text-foreground`, `rounded-lg`, `shadow-xl`
- Highlight-stage: `outline: 2px solid hsl(var(--primary))`, blød overlay
- `z-index: 10000` for å ligge over alle dialoger

## Implementeringsrekkefølge

1. Installere `driver.js`, opprette infrastruktur (types, provider, hook, utils, styles).
2. Legge til alle `data-tour`-attributter i Header, Oppdrag, oppdragsskjema, Kart.
3. Implementere `systemOverviewTour`.
4. Implementere `missionCreationTour` med multi-side-støtte.
5. Legge til StartTourButton i Header + Kompetanse-fanen i ProfileDialog.
6. Test på desktop (1280), tablet (768), mobil (390).

## Ikke-mål

- Ingen endringer i forretningslogikk, RLS, navigasjon eller skjemaer.
- Ingen automatisk visning ved første innlogging (kan legges til senere — bruker må starte selv).
