import type { TFunction } from "i18next";
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

export const createIncidentReportTour = (t: TFunction): TourDefinition => ({
  id: "incident-report",
  title: t("tours.incidentReport.title"),
  description: t("tours.incidentReport.description"),
  steps: [
    // ---- Del A: Dashbord-widget ----
    {
      id: "widget-intro",
      selector: '[data-tour="dashboard-incidents"]',
      title: t("tours.incidentReport.steps.widget-intro.title"),
      description: t("tours.incidentReport.steps.widget-intro.description"),
      side: "top",
      route: "/",
      beforeStep: closeAnyOpenDialog,
      optional: true,
    },
    {
      id: "widget-report",
      selector: '[data-tour="incident-widget-report"]',
      title: t("tours.incidentReport.steps.widget-report.title"),
      description: t("tours.incidentReport.steps.widget-report.description"),
      side: "left",
      route: "/",
      optional: true,
    },
    {
      id: "widget-tabs",
      selector: '[data-tour="incident-widget-tabs"]',
      title: t("tours.incidentReport.steps.widget-tabs.title"),
      description: t("tours.incidentReport.steps.widget-tabs.description"),
      side: "bottom",
      route: "/",
      optional: true,
    },
    {
      id: "widget-list",
      selector: '[data-tour="incident-widget-list"]',
      title: t("tours.incidentReport.steps.widget-list.title"),
      description: t("tours.incidentReport.steps.widget-list.description"),
      side: "top",
      route: "/",
      optional: true,
    },

    // ---- Overgang: åpne dialog ----
    {
      id: "open-dialog",
      selector: '[data-tour="incident-dialog"]',
      title: t("tours.incidentReport.steps.open-dialog.title"),
      description: t("tours.incidentReport.steps.open-dialog.description"),
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "mission",
      selector: '[data-tour="incident-mission"]',
      title: t("tours.incidentReport.steps.mission.title"),
      description: t("tours.incidentReport.steps.mission.description"),
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "title-desc",
      selector: '[data-tour="incident-title-desc"]',
      title: t("tours.incidentReport.steps.title-desc.title"),
      description: t("tours.incidentReport.steps.title-desc.description"),
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "meta",
      selector: '[data-tour="incident-meta"]',
      title: t("tours.incidentReport.steps.meta.title"),
      description: t("tours.incidentReport.steps.meta.description"),
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "classification",
      selector: '[data-tour="incident-classification"]',
      title: t("tours.incidentReport.steps.classification.title"),
      description: t("tours.incidentReport.steps.classification.description"),
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "resources",
      selector: '[data-tour="incident-resources"]',
      title: t("tours.incidentReport.steps.resources.title"),
      description: t("tours.incidentReport.steps.resources.description"),
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "image",
      selector: '[data-tour="incident-image"]',
      title: t("tours.incidentReport.steps.image.title"),
      description: t("tours.incidentReport.steps.image.description"),
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "followup",
      selector: '[data-tour="incident-followup"]',
      title: t("tours.incidentReport.steps.followup.title"),
      description: t("tours.incidentReport.steps.followup.description"),
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "anonymous",
      selector: '[data-tour="incident-anonymous"]',
      title: t("tours.incidentReport.steps.anonymous.title"),
      description: t("tours.incidentReport.steps.anonymous.description"),
      side: "left",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },
    {
      id: "submit",
      selector: '[data-tour="incident-submit"]',
      title: t("tours.incidentReport.steps.submit.title"),
      description: t("tours.incidentReport.steps.submit.description"),
      side: "top",
      route: "/",
      beforeStep: openIncidentDialog,
      optional: true,
    },

    // ---- Del B: /hendelser ----
    {
      id: "nav",
      selector: '[data-tour="nav-incidents"]',
      title: t("tours.incidentReport.steps.nav.title"),
      description: t("tours.incidentReport.steps.nav.description"),
      side: "right",
      route: "/hendelser",
      beforeStep: closeAnyOpenDialog,
      optional: true,
    },
    {
      id: "search",
      selector: '[data-tour="hendelser-search"]',
      title: t("tours.incidentReport.steps.search.title"),
      description: t("tours.incidentReport.steps.search.description"),
      side: "bottom",
      route: "/hendelser",
      optional: true,
    },
    {
      id: "status-filter",
      selector: '[data-tour="hendelser-status-filter"]',
      title: t("tours.incidentReport.steps.status-filter.title"),
      description: t("tours.incidentReport.steps.status-filter.description"),
      side: "top",
      route: "/hendelser",
      optional: true,
    },
    {
      id: "add",
      selector: '[data-tour="hendelser-add"]',
      title: t("tours.incidentReport.steps.add.title"),
      description: t("tours.incidentReport.steps.add.description"),
      side: "left",
      route: "/hendelser",
      optional: true,
    },
    {
      id: "outro",
      selector: '[data-tour="nav-incidents"]',
      title: t("tours.incidentReport.steps.outro.title"),
      description: t("tours.incidentReport.steps.outro.description"),
      side: "right",
      route: "/hendelser",
      optional: true,
    },
  ],
});
