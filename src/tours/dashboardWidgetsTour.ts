import type { TFunction } from "i18next";
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

export const createDashboardWidgetsTour = (t: TFunction): TourDefinition => ({
  id: "dashboard-widgets",
  title: t("tours.dashboardWidgets.title"),
  description: t("tours.dashboardWidgets.description"),
  steps: [
    {
      id: "intro",
      selector: "main",
      title: t("tours.dashboardWidgets.steps.intro.title"),
      description: t("tours.dashboardWidgets.steps.intro.description"),
      side: "bottom",
      route: "/",
      beforeStep: closeMobileNav,
    },
    {
      id: "log-flight",
      selector: '[data-tour="dashboard-log-flight"]',
      title: t("tours.dashboardWidgets.steps.log-flight.title"),
      description: t("tours.dashboardWidgets.steps.log-flight.description"),
      side: "bottom",
      requiresModule: "missions",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-log-flight"]'),
    },
    {
      id: "flight-controls",
      selector: '[data-tour="dashboard-flight-controls"]',
      title: t("tours.dashboardWidgets.steps.flight-controls.title"),
      description: t("tours.dashboardWidgets.steps.flight-controls.description"),
      side: "top",
      requiresModule: "missions",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-flight-controls"]'),
    },
    {
      id: "active-flights",
      selector: '[data-tour="dashboard-active-flights"]',
      title: t("tours.dashboardWidgets.steps.active-flights.title"),
      description: t("tours.dashboardWidgets.steps.active-flights.description"),
      side: "bottom",
      requiresModule: "missions",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-active-flights"]'),
    },
    {
      id: "ai-search",
      selector: '[data-tour="dashboard-ai-search"]',
      title: t("tours.dashboardWidgets.steps.ai-search.title"),
      description: t("tours.dashboardWidgets.steps.ai-search.description"),
      side: "bottom",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-ai-search"]'),
    },
    {
      id: "news",
      selector: '[data-tour="dashboard-news"]',
      title: t("tours.dashboardWidgets.steps.news.title"),
      description: t("tours.dashboardWidgets.steps.news.description"),
      side: "bottom",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-news"]'),
    },
    {
      id: "status",
      selector: '[data-tour="dashboard-status"]',
      title: t("tours.dashboardWidgets.steps.status.title"),
      description: t("tours.dashboardWidgets.steps.status.description"),
      side: "left",
      requiresModule: "status",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-status"]'),
    },
    {
      id: "missions",
      selector: '[data-tour="dashboard-missions"]',
      title: t("tours.dashboardWidgets.steps.missions.title"),
      description: t("tours.dashboardWidgets.steps.missions.description"),
      side: "top",
      requiresModule: "missions",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-missions"]'),
    },
    {
      id: "calendar",
      selector: '[data-tour="dashboard-calendar"]',
      title: t("tours.dashboardWidgets.steps.calendar.title"),
      description: t("tours.dashboardWidgets.steps.calendar.description"),
      side: "top",
      requiresModule: "calendar",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-calendar"]'),
    },
    {
      id: "incidents",
      selector: '[data-tour="dashboard-incidents"]',
      title: t("tours.dashboardWidgets.steps.incidents.title"),
      description: t("tours.dashboardWidgets.steps.incidents.description"),
      side: "left",
      requiresModule: "incidents",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-incidents"]'),
    },
    {
      id: "documents",
      selector: '[data-tour="dashboard-documents"]',
      title: t("tours.dashboardWidgets.steps.documents.title"),
      description: t("tours.dashboardWidgets.steps.documents.description"),
      side: "top",
      requiresModule: "documents",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-documents"]'),
    },
    {
      id: "kpi",
      selector: '[data-tour="dashboard-kpi"]',
      title: t("tours.dashboardWidgets.steps.kpi.title"),
      description: t("tours.dashboardWidgets.steps.kpi.description"),
      side: "top",
      optional: true,
      beforeStep: scrollIntoView('[data-tour="dashboard-kpi"]'),
    },
    {
      id: "finish",
      selector: "main",
      title: t("tours.dashboardWidgets.steps.finish.title"),
      description: t("tours.dashboardWidgets.steps.finish.description"),
      side: "bottom",
    },
  ],
});
