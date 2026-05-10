import type { TourDefinition } from "./types";
import { sleep } from "./tourUtils";

const closeAnyOpenDialog = async () => {
  const open = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]');
  if (open) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(200);
  }
};

const openUploadDialog = async () => {
  if (document.querySelector('[data-tour="upload-log-dialog"]')) return;
  (window as any).__avisafeTour?.openUploadLog?.();
  await sleep(450);
};

export const uploadDroneLogTour: TourDefinition = {
  id: "upload-drone-log",
  title: "Last opp DJI-flylogg",
  description:
    "Lær hvordan du laster opp flylogger manuelt, behandler ventende auto-sync-logger og kobler dem til oppdrag.",
  steps: [
    {
      id: "intro",
      selector: '[data-tour="dashboard-log-flight"]',
      title: "Last opp flylogg",
      description:
        "Fra dashbordet finner du «Last opp flylogg» under flytid-menyen. Du kan laste opp DJI- og ArduPilot-logger, eller la AviSafe synkronisere automatisk fra DJI-kontoen din.",
      side: "bottom",
      route: "/",
      beforeStep: closeAnyOpenDialog,
      optional: true,
    },
    {
      id: "open-dialog",
      selector: '[data-tour="upload-log-dialog"]',
      title: "Velg metode",
      description:
        "To alternativer: last opp en fil manuelt, eller logg inn med DJI-kontoen for å hente logger fra skyen automatisk.",
      side: "left",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
    {
      id: "file",
      selector: '[data-tour="upload-log-file"]',
      title: "Last opp fil manuelt",
      description:
        "Klikk her for å velge en TXT- eller ZIP-fil (eller .bin for ArduPilot). Du kan også velge flere filer samtidig for bulk-opplasting.",
      side: "right",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
    {
      id: "dji",
      selector: '[data-tour="upload-log-dji"]',
      title: "DJI-konto (auto-sync)",
      description:
        "Logg inn med DJI én gang så henter AviSafe nye logger automatisk i bakgrunnen. Anbefalt for daglig bruk.",
      side: "left",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
    {
      id: "pending",
      selector: '[data-tour="upload-log-pending"]',
      title: "Ventende logger til behandling",
      description:
        "Auto-synkede logger dukker opp her. Grønn ✓ = drone matchet, gul ⚠ = drone må kobles, rød = feil. «Kun mine»-bryteren filtrerer på dine logger.",
      side: "left",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
    {
      id: "match",
      selector: '[data-tour="upload-log-dialog"]',
      title: "Match drone, batteri og oppdrag",
      description:
        "Velg en logg fra listen for å åpne detaljer. Her kobler du loggen til riktig drone/batteri (opprett ny ved behov) og knytter den til et oppdrag samme dag.",
      side: "left",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
    {
      id: "finish",
      selector: '[data-tour="upload-log-dialog"]',
      title: "Behandlede logger",
      description:
        "Når en logg er behandlet flyttes den til Statistikk → Flylogg, og data om batteri, høyde og rute blir tilgjengelig i flydashbordet.",
      side: "left",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
  ],
};
