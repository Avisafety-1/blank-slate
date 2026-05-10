import type { TourDefinition } from "./types";
import { sleep } from "./tourUtils";

const closeAnyOpenDialog = async () => {
  const open = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]');
  if (open) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(200);
  }
};

/**
 * Open "Logg flytid manuelt" via the dropdown on dashboard.
 * Falls back to the direct "Logg flytid" button when no DJI/upload dropdown exists.
 */
const openLogFlightDialog = async () => {
  if (document.querySelector('[data-tour="log-flight-dialog"]')) return;

  // Try direct button first (no dropdown variant)
  const direct = document.querySelector<HTMLButtonElement>('button[data-tour="dashboard-log-flight"]');
  if (direct && direct.tagName === "BUTTON" && !direct.getAttribute("aria-haspopup")) {
    direct.click();
    await sleep(450);
    return;
  }

  // Dropdown trigger variant
  const trigger = document.querySelector<HTMLElement>('[data-tour="dashboard-log-flight"]');
  if (trigger) {
    trigger.click();
    await sleep(250);
    const item = document.querySelector<HTMLElement>('[data-tour="dashboard-log-manual"]');
    item?.click();
    await sleep(450);
  }
};

export const logFlightTour: TourDefinition = {
  id: "log-flight",
  title: "Logg flytid / avslutt flygning",
  description:
    "Lær hvordan du logger flytid manuelt eller avslutter en aktiv flygning. Samme dialog brukes i begge tilfeller.",
  steps: [
    {
      id: "intro",
      selector: '[data-tour="dashboard-flight-controls"]',
      title: "Avslutt flygning eller logg manuelt",
      description:
        "Når du stopper en aktiv flygning åpnes denne dialogen automatisk. Du kan også åpne den manuelt via «Logg flytid manuelt» fra dashbordet.",
      side: "top",
      route: "/",
      beforeStep: closeAnyOpenDialog,
      optional: true,
    },
    {
      id: "open-dialog",
      selector: '[data-tour="log-flight-dialog"]',
      title: "Logg flytid-dialogen",
      description:
        "Her registrerer du flytid, avgangs- og landingssted, drone, pilot, utstyr og bevegelser. Data lagres i flyloggen og oppdaterer dronens flytid.",
      side: "left",
      route: "/",
      beforeStep: openLogFlightDialog,
      optional: true,
    },
    {
      id: "mission",
      selector: '[data-tour="log-flight-mission"]',
      title: "Tilknytt oppdrag",
      description:
        "Koble flytiden til et oppdrag for sporbarhet. Når oppdrag er valgt kan du sette det til «Fullført» direkte herfra.",
      side: "left",
      route: "/",
      beforeStep: openLogFlightDialog,
      optional: true,
    },
    {
      id: "drone",
      selector: '[data-tour="log-flight-drone"]',
      title: "Velg drone",
      description:
        "Velg dronen som ble brukt. Drone-tid og antall bevegelser oppdateres automatisk på ressursen for vedlikeholdssporing.",
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "pilot",
      selector: '[data-tour="log-flight-pilot"]',
      title: "Pilot",
      description:
        "Velg pilot — dette gir korrekt loggføring per pilot, og brukes i kompetanse-/erfaringsoversikten.",
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "times",
      selector: '[data-tour="log-flight-times"]',
      title: "Dato, sted og varighet",
      description:
        "Fyll inn dato, avgangs- og landingssted, og varighet (minutter eller fra/til-klokkeslett). Varighet og timer beregnes automatisk.",
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "movements",
      selector: '[data-tour="log-flight-movements"]',
      title: "Bevegelser og operasjonstype",
      description:
        "Antall landinger og operasjonstype (VLOS / BVLOS / EVLOS). Inngår i statistikken og er viktig for regulatorisk rapportering.",
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "submit",
      selector: '[data-tour="log-flight-submit"]',
      title: "Lagre flytid",
      description:
        "Trykk «Logg flytid» for å lagre. Loggen vises på Statistikk-siden og oppdaterer dronens vedlikeholdsstatus.",
      side: "top",
      route: "/",
      beforeStep: openLogFlightDialog,
      optional: true,
    },
  ],
};
