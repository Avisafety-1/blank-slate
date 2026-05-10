import type { TourDefinition } from "./types";
import { sleep } from "./tourUtils";

const closeAnyOpenDialog = async () => {
  const open = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]');
  if (open) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(220);
  }
};

const openIncidentDialog = async () => {
  if (document.querySelector('[data-tour="incident-dialog"]')) return;
  const trigger =
    document.querySelector<HTMLElement>('[data-tour="incident-widget-report"]') ||
    document.querySelector<HTMLElement>('[data-tour="hendelser-add"]');
  trigger?.click();
  await sleep(450);
};

export const incidentReportTour: TourDefinition = {
  id: "incident-report",
  title: "Rapportere hendelser",
  description:
    "Lær hvordan du raskt rapporterer en hendelse fra dashbord-widgeten, og hvordan du finner full oversikt på Hendelser-siden.",
  steps: [
    // ---- Del A: Dashbord-widget ----
    {
      id: "widget-intro",
      selector: '[data-tour="dashboard-incidents"]',
      title: "Hendelses-widget",
      description:
        "Hendelses-widgeten på dashbordet gir kjapp oversikt over de siste rapportene og en hurtigvei til å rapportere noe nytt.",
      side: "top",
      route: "/",
      beforeStep: closeAnyOpenDialog,
      optional: true,
    },
    {
      id: "widget-report",
      selector: '[data-tour="incident-widget-report"]',
      title: "Rapporter hendelse",
      description:
        "Klikk her for å åpne rapporteringsskjemaet direkte. Rask tilgang er viktig — terskelen for å melde inn skal være lav.",
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "widget-tabs",
      selector: '[data-tour="incident-widget-tabs"]',
      title: "Hendelser og oppfølging",
      description:
        "Er du oppfølgingsansvarlig får du en egen «Oppfølging»-fane med saker tildelt deg, slik at ingenting faller mellom to stoler.",
      side: "bottom",
      route: "/",
      optional: true,
    },
    {
      id: "widget-list",
      selector: '[data-tour="incident-widget-list"]',
      title: "Klikk for detaljer",
      description:
        "Klikk på et kort for å åpne detaljdialogen med kommentarer, vedlegg, ECCAIRS-status og koblinger til oppdrag/ressurser.",
      side: "top",
      route: "/",
      optional: true,
    },

    // ---- Overgang: åpne dialog ----
    {
      id: "open-dialog",
      selector: '[data-tour="incident-dialog"]',
      title: "Rapporteringsskjema",
      description:
        "Dette er samme skjema enten du åpner det fra widgeten eller fra Hendelser-siden. Vi går gjennom feltene fra topp til bunn.",
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "mission",
      selector: '[data-tour="incident-mission"]',
      title: "Knytt til oppdrag",
      description:
        "Velg et oppdrag for å forhåndsutfylle pilot, drone, lokasjon og tidspunkt — og for å gi full sporbarhet mellom hendelse og operasjon.",
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "title-desc",
      selector: '[data-tour="incident-title-desc"]',
      title: "Tittel og beskrivelse",
      description:
        "Tittel er obligatorisk. Beskriv hva som skjedde, hvor og hvorfor — jo mer kontekst, desto bedre læring i ettertid.",
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "meta",
      selector: '[data-tour="incident-meta"]',
      title: "Tidspunkt, alvorlighet og status",
      description:
        "Sett tidspunkt for hendelsen og velg alvorlighetsgrad (Lav/Middels/Høy/Kritisk). «Kritisk» trigger varsling til admin.",
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "classification",
      selector: '[data-tour="incident-classification"]',
      title: "Klassifisering",
      description:
        "Kategori, hovedårsak og medvirkende årsaker brukes i statistikk og for ECCAIRS-rapportering til Luftfartstilsynet.",
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "resources",
      selector: '[data-tour="incident-resources"]',
      title: "Ressurser (drone, pilot, utstyr)",
      description:
        "Koble ressurser slik at hendelsen automatisk dukker opp i loggboken til hver enkelt drone/utstyrsenhet — viktig for vedlikehold og analyse.",
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "image",
      selector: '[data-tour="incident-image"]',
      title: "Bilde",
      description:
        "Legg ved et bilde direkte. Flere vedlegg kan legges til i detaljdialogen etter at hendelsen er opprettet.",
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "followup",
      selector: '[data-tour="incident-followup"]',
      title: "Oppfølgingsansvarlig",
      description:
        "Tildel en ansvarlig — vedkommende får varsel og ser saken i sin «Oppfølging»-fane på dashbordet.",
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "anonymous",
      selector: '[data-tour="incident-anonymous"]',
      title: "Anonym rapportering",
      description:
        "Du kan velge å rapportere anonymt. Admin kan også slå på selskapsinnstilling som gjør alle rapporter anonyme automatisk.",
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "submit",
      selector: '[data-tour="incident-submit"]',
      title: "Send inn rapporten",
      description:
        "Trykk Rapporter for å lagre. Vi går videre til Hendelser-siden for å se hvor du finner full oversikt.",
      side: "top",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },

    // ---- Del B: /hendelser ----
    {
      id: "nav",
      selector: '[data-tour="nav-incidents"]',
      title: "Gå til Hendelser",
      description:
        "På Hendelser-siden får du full oversikt med søk, filtrering, ECCAIRS-rapportering, vedlegg og PDF-eksport.",
      side: "right",
      route: "/hendelser",
      beforeStep: closeAnyOpenDialog,
      optional: true,
    },
    {
      id: "search",
      selector: '[data-tour="hendelser-search"]',
      title: "Søk",
      description:
        "Søk i tittel, beskrivelse, oppdrag og lokasjon på tvers av alle hendelser du har tilgang til.",
      side: "bottom",
      route: "/hendelser",
      optional: true,
    },
    {
      id: "status-filter",
      selector: '[data-tour="hendelser-status-filter"]',
      title: "Statusfilter",
      description:
        "Filtrer på Åpen, Under behandling, Ferdigbehandlet eller Lukket for å fokusere på det som krever handling.",
      side: "top",
      route: "/hendelser",
      optional: true,
    },
    {
      id: "add",
      selector: '[data-tour="hendelser-add"]',
      title: "Ny hendelse",
      description:
        "Samme rapporteringsskjema som fra widgeten. Bruk denne når du allerede er på Hendelser-siden.",
      side: "left",
      route: "/hendelser",
      optional: true,
    },
    {
      id: "outro",
      selector: '[data-tour="nav-incidents"]',
      title: "Ferdig",
      description:
        "Nå vet du hvordan du rapporterer og finner igjen hendelser. Du kan starte denne touren på nytt fra Min profil → Kompetanse.",
      side: "right",
      route: "/hendelser",
      optional: true,
    },
  ],
};
