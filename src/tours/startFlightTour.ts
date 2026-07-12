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

const openStartFlightDialog = async () => {
  if (document.querySelector('[data-tour="start-flight-dialog"]')) return;
  (window as any).__avisafeTour?.openStartFlight?.();
  await sleep(450);
};

export const createStartFlightTour = (t: TFunction): TourDefinition => ({
  id: "start-flight",
  title: t("tours.startFlight.title"),
  description: t("tours.startFlight.description"),
  steps: [
    {
      id: "intro",
      selector: '[data-tour="dashboard-flight-controls"]',
      title: t("tours.startFlight.steps.intro.title"),
      description: t("tours.startFlight.steps.intro.description"),
      side: "top",
      route: "/",
      beforeStep: closeAnyOpenDialog,
      optional: true,
    },
    {
      id: "open-dialog",
      selector: '[data-tour="start-flight-dialog"]',
      title: t("tours.startFlight.steps.open-dialog.title"),
      description: t("tours.startFlight.steps.open-dialog.description"),
      side: "left",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
    {
      id: "traffic",
      selector: '[data-tour="start-flight-traffic"]',
      title: t("tours.startFlight.steps.traffic.title"),
      description: t("tours.startFlight.steps.traffic.description"),
      side: "left",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
    {
      id: "checklists",
      selector: '[data-tour="start-flight-checklists"]',
      title: t("tours.startFlight.steps.checklists.title"),
      description: t("tours.startFlight.steps.checklists.description"),
      side: "left",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
    {
      id: "mission",
      selector: '[data-tour="start-flight-mission"]',
      title: t("tours.startFlight.steps.mission.title"),
      description: t("tours.startFlight.steps.mission.description"),
      side: "left",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
    {
      id: "publish-mode",
      selector: '[data-tour="start-flight-publish-mode"]',
      title: t("tours.startFlight.steps.publish-mode.title"),
      description: t("tours.startFlight.steps.publish-mode.description"),
      side: "left",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
    {
      id: "dronetag",
      selector: '[data-tour="start-flight-dronetag"]',
      title: t("tours.startFlight.steps.dronetag.title"),
      description: t("tours.startFlight.steps.dronetag.description"),
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "submit",
      selector: '[data-tour="start-flight-submit"]',
      title: t("tours.startFlight.steps.submit.title"),
      description: t("tours.startFlight.steps.submit.description"),
      side: "top",
      route: "/",
      beforeStep: openStartFlightDialog,
      optional: true,
    },
  ],
});
