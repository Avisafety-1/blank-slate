import type { TFunction } from "i18next";
import type { TourDefinition } from "./types";

const ensureRoutePlannerOpen = async () => {
  if (!document.querySelector('[data-tour="map-route-save"]')) {
    document.querySelector<HTMLElement>('[data-tour="map-route-planner-trigger"]')?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 300));
  }
};

export const createMissionCreationTour = (t: TFunction): TourDefinition => ({
  id: "mission-creation",
  title: t("tours.missionCreation.title"),
  description: t("tours.missionCreation.description"),
  steps: [
    {
      id: "kart-intro",
      selector: '[data-tour="nav-map"]',
      title: t("tours.missionCreation.steps.kart-intro.title"),
      description: t("tours.missionCreation.steps.kart-intro.description"),
      side: "bottom",
      route: "/kart",
      optional: true,
    },
    {
      id: "start-route-planner",
      selector: '[data-tour="map-route-planner-trigger"]',
      title: t("tours.missionCreation.steps.start-route-planner.title"),
      description: t("tours.missionCreation.steps.start-route-planner.description"),
      side: "left",
      route: "/kart",
      optional: true,
    },
    {
      id: "draw-route",
      selector: '[data-tour="map-container"]',
      title: t("tours.missionCreation.steps.draw-route.title"),
      description: t("tours.missionCreation.steps.draw-route.description"),
      side: "top",
      route: "/kart",
      beforeStep: async () => {
        if (!document.querySelector('[data-tour="map-route-save"]')) {
          document.querySelector<HTMLElement>('[data-tour="map-route-planner-trigger"]')?.click();
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      },
      allowMapInteraction: true,
      optional: true,
    },
    {
      id: "sora-toggle",
      selector: '[data-tour="map-sora-toggle"]',
      title: t("tours.missionCreation.steps.sora-toggle.title"),
      description: t("tours.missionCreation.steps.sora-toggle.description"),
      side: "bottom",
      route: "/kart",
      allowMapInteraction: true,
      optional: true,
    },
    {
      id: "adjacent-toggle",
      selector: '[data-tour="map-adjacent-toggle"]',
      title: t("tours.missionCreation.steps.adjacent-toggle.title"),
      description: t("tours.missionCreation.steps.adjacent-toggle.description"),
      side: "bottom",
      route: "/kart",
      optional: true,
    },
    {
      id: "pilot-position",
      selector: '[data-tour="map-pilot-button"]',
      title: t("tours.missionCreation.steps.pilot-position.title"),
      description: t("tours.missionCreation.steps.pilot-position.description"),
      side: "bottom",
      route: "/kart",
      optional: true,
      beforeStep: ensureRoutePlannerOpen,
    },
    {
      id: "kml-import",
      selector: '[data-tour="map-route-kml"]',
      title: t("tours.missionCreation.steps.kml-import.title"),
      description: t("tours.missionCreation.steps.kml-import.description"),
      side: "bottom",
      route: "/kart",
      optional: true,
      beforeStep: ensureRoutePlannerOpen,
    },
    {
      id: "ippc-link",
      selector: '[data-tour="map-route-ippc"]',
      title: t("tours.missionCreation.steps.ippc-link.title"),
      description: t("tours.missionCreation.steps.ippc-link.description"),
      side: "bottom",
      route: "/kart",
      optional: true,
      beforeStep: ensureRoutePlannerOpen,
    },
    {
      id: "sensor-link",
      selector: '[data-tour="map-route-sensor"]',
      title: t("tours.missionCreation.steps.sensor-link.title"),
      description: t("tours.missionCreation.steps.sensor-link.description"),
      side: "bottom",
      route: "/kart",
      optional: true,
      beforeStep: ensureRoutePlannerOpen,
    },
    {
      id: "fh2-send",
      selector: '[data-tour="map-route-fh2"]',
      title: t("tours.missionCreation.steps.fh2-send.title"),
      description: t("tours.missionCreation.steps.fh2-send.description"),
      side: "bottom",
      route: "/kart",
      requiresModule: "missions",
      optional: true,
      beforeStep: ensureRoutePlannerOpen,
    },
    {
      id: "undo-point",
      selector: '[data-tour="map-route-undo"]',
      title: t("tours.missionCreation.steps.undo-point.title"),
      description: t("tours.missionCreation.steps.undo-point.description"),
      side: "top",
      route: "/kart",
      optional: true,
      beforeStep: ensureRoutePlannerOpen,
    },
    {
      id: "clear-route",
      selector: '[data-tour="map-route-clear"]',
      title: t("tours.missionCreation.steps.clear-route.title"),
      description: t("tours.missionCreation.steps.clear-route.description"),
      side: "top",
      route: "/kart",
      optional: true,
      beforeStep: ensureRoutePlannerOpen,
    },
    {
      id: "cancel-route",
      selector: '[data-tour="map-route-cancel"]',
      title: t("tours.missionCreation.steps.cancel-route.title"),
      description: t("tours.missionCreation.steps.cancel-route.description"),
      side: "top",
      route: "/kart",
      optional: true,
      beforeStep: ensureRoutePlannerOpen,
    },
    {
      id: "save-route",
      selector: '[data-tour="map-route-save"]',
      title: t("tours.missionCreation.steps.save-route.title"),
      description: t("tours.missionCreation.steps.save-route.description"),
      side: "left",
      route: "/kart",
      optional: true,
    },
    {
      id: "finish",
      selector: '[data-tour="nav-map"]',
      title: t("tours.missionCreation.steps.finish.title"),
      description: t("tours.missionCreation.steps.finish.description"),
      side: "bottom",
      route: "/kart",
      optional: true,
    },
  ],
});
