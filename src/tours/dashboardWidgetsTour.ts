import type { TourDefinition } from "./types";
import { closeMobileNav, sleep } from "./tourUtils";

/** Scroll the highlighted widget into view before the popover positions itself. */
const scrollIntoView = (selector: string) => async () => {
  await closeMobileNav();
  const el = document.querySelector<HTMLElement>(selector);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(300);
  }
};

export const dashboardWidgetsTour: TourDefinition = {
  id: "dashboard-widgets",
  title: "Dashbord-widgetene",
  description: "Bli kjent med widgetene på forsiden — hva de viser og hvordan du bruker dem.",
  steps: [
    {
      id: "intro",
      selector: "main",
      title: "Velkommen til dashbordet",
      description:
        "Forsiden gir deg et raskt overblikk: aktive flyvninger, nyheter, status, oppdrag, hendelser, kalender og nøkkeltall. Du kan dra widgetene for å endre rekkefølge.",
      side: "bottom",
      route: "/",
      beforeStep: closeMobileNav,
    },
    {
      id: "log-flight",
      selector: '[data-tour="dashboard-log-flight"]',
      title: "Logg flytid / Last opp flylogg",
      description:
        "Registrer flytid manuelt etter en operasjon, eller last opp flylogg fra DJI/ArduPilot for automatisk parsing av telemetri, batteri og flyspor.",
      side: "bottom",
      requiresModule: "missions",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-log-flight"]'),
    },
    {
      id: "flight-controls",
      selector: '[data-tour="dashboard-flight-controls"]',
      title: "Start / avslutt flytur",
      description:
        "Start en flytur for å aktivere klokken, sjekklister og live-posisjon (DroneTag). Trykk «Avslutt» når du lander — da lagres varigheten og du kan fullføre etter-flyt-sjekklisten.",
      side: "top",
      requiresModule: "missions",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-flight-controls"]'),
    },
    {
      id: "active-flights",
      selector: '[data-tour="dashboard-active-flights"]',
      title: "Aktive flyvninger",
      description:
        "Viser pågående flyvninger i sanntid for selskapet ditt — pilot, drone, varighet og posisjon. Klikk en flyvning for å følge den på kart.",
      side: "bottom",
      requiresModule: "missions",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-active-flights"]'),
    },
    {
      id: "ai-search",
      selector: '[data-tour="dashboard-ai-search"]',
      title: "AI-søk",
      description:
        "Spør AviSafe på naturlig språk — f.eks. «vis siste oppdrag i Oslo» eller «hvilke droner trenger vedlikehold?». AI-en søker på tvers av modulene du har tilgang til.",
      side: "bottom",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-ai-search"]'),
    },
    {
      id: "news",
      selector: '[data-tour="dashboard-news"]',
      title: "Nyheter",
      description:
        "Driftsmeldinger, nye funksjoner og varsler fra AviSafe og selskapet ditt. Hold øye med denne for viktige oppdateringer.",
      side: "bottom",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-news"]'),
    },
    {
      id: "status",
      selector: '[data-tour="dashboard-status"]',
      title: "Status",
      description:
        "Statusoversikt over ressursene dine — droner, batterier og utstyr som nærmer seg vedlikehold eller har utgått vedlikehold, samt personell med kompetanse som snart utløper eller er utgått.",
      side: "left",
      requiresModule: "status",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-status"]'),
    },
    {
      id: "missions",
      selector: '[data-tour="dashboard-missions"]',
      title: "Oppdrag",
      description:
        "Dine kommende og pågående oppdrag. Klikk et oppdrag for å åpne planlegger, sjekklister og dokumentasjon.",
      side: "top",
      requiresModule: "missions",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-missions"]'),
    },
    {
      id: "calendar",
      selector: '[data-tour="dashboard-calendar"]',
      title: "Kalender",
      description:
        "Oversikt over planlagte oppdrag denne og neste uke. Klikk en dato for å åpne hele kalenderen.",
      side: "top",
      requiresModule: "calendar",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-calendar"]'),
    },
    {
      id: "incidents",
      selector: '[data-tour="dashboard-incidents"]',
      title: "Hendelser",
      description:
        "Siste rapporterte hendelser og avvik. Følg opp åpne saker eller registrer nye for å holde sikkerhetsarbeidet løpende.",
      side: "left",
      requiresModule: "incidents",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-incidents"]'),
    },
    {
      id: "documents",
      selector: '[data-tour="dashboard-documents"]',
      title: "Dokumenter",
      description:
        "Snarvei til siste dokumenter — manualer, sjekklister og prosedyrer. Klikk for å åpne dokumentbiblioteket.",
      side: "top",
      requiresModule: "documents",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-documents"]'),
    },
    {
      id: "kpi",
      selector: '[data-tour="dashboard-kpi"]',
      title: "Nøkkeltall (KPI)",
      description:
        "Grafer og tall som viser flytid, antall oppdrag og hendelser over tid — nyttig for ledelse og rapportering.",
      side: "top",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-kpi"]'),
    },
    {
      id: "finish",
      selector: "main",
      title: "Det var widgetene!",
      description:
        "Tips: Dra og slipp widgetene for å tilpasse dashbordet ditt. Du kan starte denne guiden igjen fra profilsiden.",
      side: "bottom",
    },
  ],
};
