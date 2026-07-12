import type { TFunction } from "i18next";
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
 * Open Logg flytid-dialogen via tour-bridge på dashbordet.
 * Bruker window.__avisafeTour i stedet for å klikke Radix-dropdown
 * (som ikke responderer på programmatisk .click()).
 */
const openLogFlightDialog = async () => {
  if (document.querySelector('[data-tour="log-flight-dialog"]')) return;
  (window as any).__avisafeTour?.openLogFlight?.();
  await sleep(450);
};

export const createLogFlightTour = (t: TFunction): TourDefinition => ({
  id: "log-flight",
  title: t("tours.logFlight.title"),
  description: t("tours.logFlight.description"),
  steps: [
    {
      id: "intro",
      selector: '[data-tour="dashboard-flight-controls"]',
      title: t("tours.logFlight.steps.intro.title"),
      description: t("tours.logFlight.steps.intro.description"),
      side: "top",
      route: "/",
      beforeStep: closeAnyOpenDialog,
      optional: true,
    },
    {
      id: "open-dialog",
      selector: '[data-tour="log-flight-dialog"]',
      title: t("tours.logFlight.steps.open-dialog.title"),
      description: t("tours.logFlight.steps.open-dialog.description"),
      side: "left",
      route: "/",
      beforeStep: openLogFlightDialog,
      optional: true,
    },
    {
      id: "mission",
      selector: '[data-tour="log-flight-mission"]',
      title: t("tours.logFlight.steps.mission.title"),
      description: t("tours.logFlight.steps.mission.description"),
      side: "left",
      route: "/",
      beforeStep: openLogFlightDialog,
      optional: true,
    },
    {
      id: "drone",
      selector: '[data-tour="log-flight-drone"]',
      title: t("tours.logFlight.steps.drone.title"),
      description: t("tours.logFlight.steps.drone.description"),
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "pilot",
      selector: '[data-tour="log-flight-pilot"]',
      title: t("tours.logFlight.steps.pilot.title"),
      description: t("tours.logFlight.steps.pilot.description"),
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "times",
      selector: '[data-tour="log-flight-times"]',
      title: t("tours.logFlight.steps.times.title"),
      description: t("tours.logFlight.steps.times.description"),
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "movements",
      selector: '[data-tour="log-flight-movements"]',
      title: t("tours.logFlight.steps.movements.title"),
      description: t("tours.logFlight.steps.movements.description"),
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "submit",
      selector: '[data-tour="log-flight-submit"]',
      title: t("tours.logFlight.steps.submit.title"),
      description: t("tours.logFlight.steps.submit.description"),
      side: "top",
      route: "/",
      beforeStep: openLogFlightDialog,
      optional: true,
    },
  ],
});
