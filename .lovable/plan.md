## Bakgrunn

Brukeren vil ha én sammenhengende guidet tour for hendelsesrapportering, som først viser hvordan man rapporterer fra hendelses-widgeten på dashbordet, og deretter navigerer til `/hendelser` og viser samme/utvidede flyt der.

Vi gjenbruker eksisterende infrastruktur (`GuidedTourProvider`, `driver.js`, `StartTourButton`). Begge inngangene åpner samme `AddIncidentDialog` (`src/components/dashboard/AddIncidentDialog.tsx`), så feltsteg-beskrivelsene gjelder uansett opprinnelse.

Eksisterende `data-tour`-anker:
- `dashboard-incidents` ligger automatisk på `DraggableSection` med id `incidents` (dashbord-widget-wrapper).
- `nav-incidents` på navigasjons-knappen til `/hendelser`.

## Endring

### 1. Ny tour-fil

Opprett `src/tours/incidentReportTour.ts` (id: `"incident-report"`). Registrer i `tourDefinitions.ts` (allTours + tourList) og i `TourId`-unionen.

### 2. Stegrekkefølge (én sammenhengende tour)

**Del A — Dashbord-widget (route `/`):**

1. **Intro / widget-plassering** — highlight `[data-tour="dashboard-incidents"]`. Forklarer at hendelses-widgeten gir kjapp oversikt og rask rapportering. `beforeStep`: lukk åpne dialoger, scroll widget i view.
2. **Rapporter-knappen i widgeten** — highlight `[data-tour="incident-widget-report"]` (ny). Forklarer at dette er hurtigveien til ny rapport.
3. **Faner: Hendelser / Oppfølging** — highlight `[data-tour="incident-widget-tabs"]` (ny). Forklarer at oppfølgingsansvarlige ser sin egen fane med saker de er tildelt.
4. **Hendelseskort i listen** — highlight `[data-tour="incident-widget-list"]` (ny på listen-wrapperen). Forklarer at klikk åpner detaljdialog med kommentarer, ECCAIRS-status, vedlegg.

**Overgang — åpne `AddIncidentDialog`:**

5. **Åpne ny rapport-dialog** — highlight DialogTitle via `[data-tour="incident-dialog"]` (ny på `DialogContent`). `beforeStep` klikker `[data-tour="incident-widget-report"]` og venter til dialogen er montert. Forklarer at dette skjemaet brukes både fra widget og fra `/hendelser`.

**Felt-steg i dialogen (alle med `optional: true`):**

6. **Knytt til oppdrag** — `[data-tour="incident-mission"]` (ny). Forklarer at å koble oppdrag forhåndsutfyller pilot/drone og gir sporbarhet.
7. **Tittel + beskrivelse** — `[data-tour="incident-title-desc"]` (ny wrapper rundt tittel/beskrivelse-blokken). Forklarer at en kort tittel + utfyllende beskrivelse er minimumskravet.
8. **Tidspunkt + alvorlighet + status** — `[data-tour="incident-meta"]` (ny wrapper rundt tidspunkt/alvorlighet/status). Forklarer alvorlighetsgrader (Lav/Middels/Høy/Kritisk) og at "Kritisk" trigger varsling.
9. **Kategori, hovedårsak, medvirkende** — `[data-tour="incident-classification"]` (ny wrapper rundt kategori/hovedårsak/medvirkende-årsak). Forklarer at klassifisering brukes i statistikk og ECCAIRS-mapping.
10. **Ressurser (drone, pilot, utstyr)** — `[data-tour="incident-resources"]` (på `Collapsible`-wrapperen). Nevner at å koble ressurser auto-oppretter logg-entry på hver ressurs (jf. memory: Incident Logging Link).
11. **Bilde / vedlegg** — `[data-tour="incident-image"]` (ny). Forklarer kort at vedlegg legges til i detaljdialogen etter opprettelse.
12. **Oppfølgingsansvarlig** — `[data-tour="incident-followup"]` (ny). Forklarer at vedkommende får varsel og dukker opp i Oppfølging-fanen i widgeten.
13. **Anonymitet** — `[data-tour="incident-anonymous"]` (ny). Forklarer både den per-rapport-bryteren og at admin kan tvinge anonym rapportering globalt (`hide_reporter_identity`).
14. **Lagre / Rapporter** — `[data-tour="incident-submit"]` (ny på Rapporter-knappen). Forklarer at man kan stenge dialogen her — tour-en fortsetter på `/hendelser`.

**Del B — `/hendelser`-siden (route `/hendelser`):**

`beforeStep` på første /hendelser-steg lukker dialogen før navigering.

15. **Naviger til Hendelser** — highlight `[data-tour="nav-incidents"]`. Forklarer at full oversikt, søk, filtrering, ECCAIRS-rapportering og PDF-eksport ligger på egen side.
16. **Søkefelt** — `[data-tour="hendelser-search"]` (ny). Søker i tittel/beskrivelse/oppdrag/lokasjon.
17. **Statusfilter** — `[data-tour="hendelser-status-filter"]` (ny på filter-rad). Forklar Alle / Åpen / Under behandling / Ferdigbehandlet / Lukket.
18. **«Legg til hendelse»-knapp** — `[data-tour="hendelser-add"]` (ny). Forklar at samme dialog brukes som fra widgeten.
19. **Hendelseskort + handlinger** — informativt steg, target = body, `optional: true`. Forklarer at kortet viser ECCAIRS-status, kommentarer, koblinger til oppdrag/ressurser og at admin kan eksportere/markere/slette.
20. **Avslutning** — peker på `[data-tour="nav-incidents"]` igjen og henviser til Min profil → Kompetanse for å starte touren på nytt.

### 3. Nye `data-tour`-attributter

I `src/components/dashboard/IncidentsSection.tsx`:

- `data-tour="incident-widget-report"` på Rapporter-knappen (~linje 268).
- `data-tour="incident-widget-tabs"` på `TabsList` (~linje 280).
- `data-tour="incident-widget-list"` på listen-wrapperen i `TabsContent value="incidents"` (~linje 292).

I `src/components/dashboard/AddIncidentDialog.tsx`:

- `data-tour="incident-dialog"` på `DialogContent` (~linje 532).
- `data-tour="incident-mission"` på "Knytt til oppdrag"-wrapperen (~linje 542).
- `data-tour="incident-title-desc"` på en ny felles wrapper rundt tittel + beskrivelse (~linje 580–598).
- `data-tour="incident-meta"` på felles wrapper rundt tidspunkt/alvorlighet/status (~linje 600–644).
- `data-tour="incident-classification"` på felles wrapper rundt kategori/hovedårsak/medvirkende (~linje 646–755).
- `data-tour="incident-resources"` på `Collapsible`-wrapperen (~linje 768).
- `data-tour="incident-image"` på "Bilde (valgfritt)"-wrapperen (~linje 884).
- `data-tour="incident-followup"` på "Oppfølgingsansvarlig"-wrapperen (~linje 924).
- `data-tour="incident-anonymous"` på anonymitet-blokken (~linje 938 / 946).
- `data-tour="incident-submit"` på Rapporter-knappen (~linje 970).

I `src/pages/Hendelser.tsx`:

- `data-tour="hendelser-search"` på Input-wrapperen (~linje 928).
- `data-tour="hendelser-add"` på "Legg til hendelse"-knappen (~linje 938).
- `data-tour="hendelser-status-filter"` på filter-raden (~linje 944).

### 4. Hjelpere

I `incidentReportTour.ts`:

```ts
const closeAnyOpenDialog = async () => {
  if (document.querySelector('[role="dialog"][data-state="open"]')) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(200);
  }
};

const openIncidentDialog = async () => {
  if (document.querySelector('[data-tour="incident-dialog"]')) return;
  document.querySelector<HTMLElement>('[data-tour="incident-widget-report"], [data-tour="hendelser-add"]')?.click();
  await sleep(450);
};
```

Felt-stegene i dialogen får `beforeStep: openIncidentDialog` slik at de virker uansett om brukeren har lukket dialogen mellom steg. Naviger til `/hendelser` håndteres automatisk av `route` på stegene i Del B; `closeAnyOpenDialog` settes som `beforeStep` på første `/hendelser`-steg for å unngå at dialogen henger igjen.

### 5. Det vi ikke endrer

- Tour-infrastruktur (`GuidedTourProvider`, `tour-styles.css`, `StartTourButton`).
- Eksisterende tour-er (system-overview, dashboard-widgets, mission-creation, start-flight, log-flight, upload-drone-log).
- Ingen forretningslogikk i widget, dialog eller side — kun nye `data-tour`-attributter og tour-fil.
- ECCAIRS-flyten dekkes ikke i denne touren (eget tema).

### 6. Robusthet

- Alle steg får `optional: true` og `beforeStep` der det trengs — hopper gracefully over manglende elementer (f.eks. Oppfølging-fane vises kun for ansvarlige; anonym-checkbox skjules når `hide_reporter_identity` er på).
- Vi gjenbruker `closeMobileNav` indirekte via `GuidedTourProvider`s rydde-logikk.
- Mobiltilpasset: hendelses-widgeten ligger forskjellig på mobil vs desktop, men `data-tour="dashboard-incidents"` finnes i én visning av gangen — eksisterende `findVisible` i `tourUtils` velger den synlige.

### Tekniske detaljer (for utviklere)

- `TourId`-typen i `src/tours/types.ts` utvides med `"incident-report"`.
- Touren legges sist i `tourList` slik at den vises nederst i kompetanse-listen.
- Dialogene har z-index 10002 (allerede satt i `tour-styles.css`); driver.js-popoveren ligger på 10005, så høydekonflikten er allerede løst.
