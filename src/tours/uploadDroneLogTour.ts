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

const openUploadDialog = async () => {
  if (document.querySelector('[data-tour="upload-log-dialog"]')) return;
  (window as any).__avisafeTour?.openUploadLog?.();
  await sleep(450);
};

export const createUploadDroneLogTour = (t: TFunction): TourDefinition => ({
  id: "upload-drone-log",
  title: t("tours.uploadDroneLog.title"),
  description: t("tours.uploadDroneLog.description"),
  steps: [
    {
      id: "intro",
      selector: '[data-tour="dashboard-log-flight"]',
      title: t("tours.uploadDroneLog.steps.intro.title"),
      description: t("tours.uploadDroneLog.steps.intro.description"),
      side: "bottom",
      route: "/",
      beforeStep: closeAnyOpenDialog,
      optional: true,
    },
    {
      id: "open-dialog",
      selector: '[data-tour="upload-log-dialog"]',
      title: t("tours.uploadDroneLog.steps.open-dialog.title"),
      description: t("tours.uploadDroneLog.steps.open-dialog.description"),
      side: "left",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
    {
      id: "file",
      selector: '[data-tour="upload-log-file"]',
      title: t("tours.uploadDroneLog.steps.file.title"),
      description: t("tours.uploadDroneLog.steps.file.description"),
      side: "right",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
    {
      id: "dji",
      selector: '[data-tour="upload-log-dji"]',
      title: t("tours.uploadDroneLog.steps.dji.title"),
      description: t("tours.uploadDroneLog.steps.dji.description"),
      side: "left",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
    {
      id: "pending",
      selector: '[data-tour="upload-log-pending"]',
      title: t("tours.uploadDroneLog.steps.pending.title"),
      description: t("tours.uploadDroneLog.steps.pending.description"),
      side: "left",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
    {
      id: "match",
      selector: '[data-tour="upload-log-dialog"]',
      title: t("tours.uploadDroneLog.steps.match.title"),
      description: t("tours.uploadDroneLog.steps.match.description"),
      side: "left",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
    {
      id: "finish",
      selector: '[data-tour="upload-log-dialog"]',
      title: t("tours.uploadDroneLog.steps.finish.title"),
      description: t("tours.uploadDroneLog.steps.finish.description"),
      side: "left",
      route: "/",
      beforeStep: openUploadDialog,
      optional: true,
    },
  ],
});
