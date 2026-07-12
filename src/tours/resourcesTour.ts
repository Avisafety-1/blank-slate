import type { TFunction } from "i18next";
import type { TourDefinition } from "./types";
import { sleep } from "./tourUtils";

const bridge = () => (window as any).__avisafeResourcesTour;

const closeAnyOpenDialog = async () => {
  // Lukk åpne dialoger via Escape (Radix lytter på Escape)
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  // Sikre at Resources-broen får ryddet opp i sin state
  bridge()?.closeAll?.();
  await sleep(300);
};

const openFirstDrone = async () => {
  await closeAnyOpenDialog();
  bridge()?.openFirstDrone?.();
  await sleep(450);
};

const openDroneLogbook = async () => {
  bridge()?.openDroneLogbook?.();
  await sleep(450);
};

const closeDroneLogbook = async () => {
  bridge()?.closeDroneLogbook?.();
  await sleep(300);
};

const openAddDrone = async () => {
  await closeAnyOpenDialog();
  bridge()?.openAddDrone?.();
  await sleep(450);
};

const openFirstEquipment = async () => {
  await closeAnyOpenDialog();
  bridge()?.openFirstEquipment?.();
  await sleep(450);
};

const openEquipmentLogbook = async () => {
  bridge()?.openEquipmentLogbook?.();
  await sleep(450);
};

const closeEquipmentLogbook = async () => {
  bridge()?.closeEquipmentLogbook?.();
  await sleep(300);
};

const openAddEquipment = async () => {
  await closeAnyOpenDialog();
  bridge()?.openAddEquipment?.();
  await sleep(450);
};

const openAddDronetag = async () => {
  await closeAnyOpenDialog();
  bridge()?.openAddDronetag?.();
  await sleep(450);
};

const openFirstPerson = async () => {
  await closeAnyOpenDialog();
  bridge()?.openFirstPerson?.();
  await sleep(450);
};

const openAddCompetency = async () => {
  await closeAnyOpenDialog();
  bridge()?.openAddCompetency?.();
  await sleep(450);
};

export const createResourcesTour = (t: TFunction): TourDefinition => ({
  id: "resources",
  title: t("tours.resources.title"),
  description: t("tours.resources.description"),
  steps: [
    // ---------- INTRO ----------
    {
      id: "intro",
      route: "/ressurser",
      selector: "main",
      title: t("tours.resources.steps.intro.title"),
      description: t("tours.resources.steps.intro.description"),
      side: "bottom",
    },

    // ---------- DRONER ----------
    {
      id: "drone-section",
      route: "/ressurser",
      selector: '[data-tour="resources-drone-section"]',
      title: t("tours.resources.steps.drone-section.title"),
      description: t("tours.resources.steps.drone-section.description"),
      side: "right",
      beforeStep: closeAnyOpenDialog,
    },
    {
      id: "drone-add",
      selector: '[data-tour="resources-drone-add"]',
      title: t("tours.resources.steps.drone-add.title"),
      description: t("tours.resources.steps.drone-add.description"),
      side: "left",
    },
    {
      id: "drone-search",
      selector: '[data-tour="resources-drone-search"]',
      title: t("tours.resources.steps.drone-search.title"),
      description: t("tours.resources.steps.drone-search.description"),
      side: "bottom",
    },
    {
      id: "drone-filters",
      selector: '[data-tour="resources-drone-filters"]',
      title: t("tours.resources.steps.drone-filters.title"),
      description: t("tours.resources.steps.drone-filters.description"),
      side: "bottom",
    },
    {
      id: "drone-card",
      selector: '[data-tour="resources-drone-card"]',
      title: t("tours.resources.steps.drone-card.title"),
      description: t("tours.resources.steps.drone-card.description"),
      side: "left",
    },

    // ---------- DRONE DETAIL ----------
    {
      id: "drone-detail",
      selector: '[role="dialog"]:has([data-tour="drone-detail-logbok"])',
      title: t("tours.resources.steps.drone-detail.title"),
      description: t("tours.resources.steps.drone-detail.description"),
      side: "over",
      beforeStep: openFirstDrone,
      optional: false,
    },
    {
      id: "drone-detail-logbok",
      selector: '[data-tour="drone-detail-logbok"]',
      title: t("tours.resources.steps.drone-detail-logbok.title"),
      description: t("tours.resources.steps.drone-detail-logbok.description"),
      side: "bottom",
    },

    // ---------- DRONE LOGBOK ----------
    {
      id: "drone-logbook",
      selector: '[role="dialog"]:has([data-tour="drone-logbook-add"])',
      title: t("tours.resources.steps.drone-logbook.title"),
      description: t("tours.resources.steps.drone-logbook.description"),
      side: "over",
      beforeStep: openDroneLogbook,
      optional: false,
    },
    {
      id: "drone-logbook-add",
      selector: '[data-tour="drone-logbook-add"]',
      title: t("tours.resources.steps.drone-logbook-add.title"),
      description: t("tours.resources.steps.drone-logbook-add.description"),
      side: "right",
    },
    {
      id: "drone-logbook-export",
      selector: '[data-tour="drone-logbook-export"]',
      title: t("tours.resources.steps.drone-logbook-export.title"),
      description: t("tours.resources.steps.drone-logbook-export.description"),
      side: "left",
    },

    // ---------- BACK TO DRONE DETAIL ----------
    {
      id: "drone-detail-back",
      selector: '[role="dialog"]:has([data-tour="drone-detail-logbok"])',
      title: t("tours.resources.steps.drone-detail-back.title"),
      description: t("tours.resources.steps.drone-detail-back.description"),
      side: "over",
      beforeStep: closeDroneLogbook,
    },
    {
      id: "drone-detail-edit",
      selector: '[data-tour="drone-detail-edit"]',
      title: t("tours.resources.steps.drone-detail-edit.title"),
      description: t("tours.resources.steps.drone-detail-edit.description"),
      side: "left",
    },

    // ---------- ADD DRONE DIALOG ----------
    {
      id: "add-drone",
      selector: '[role="dialog"]:has([data-tour="add-drone-marker"])',
      title: t("tours.resources.steps.add-drone.title"),
      description: t("tours.resources.steps.add-drone.description"),
      side: "over",
      beforeStep: openAddDrone,
      optional: false,
    },
    {
      id: "add-drone-inspection",
      selector: '[role="dialog"]:has([data-tour="add-drone-marker"])',
      title: t("tours.resources.steps.add-drone-inspection.title"),
      description: t("tours.resources.steps.add-drone-inspection.description"),
      side: "over",
    },

    // ---------- UTSTYR ----------
    {
      id: "equipment-section",
      selector: '[data-tour="resources-equipment-section"]',
      title: t("tours.resources.steps.equipment-section.title"),
      description: t("tours.resources.steps.equipment-section.description"),
      side: "left",
      beforeStep: closeAnyOpenDialog,
    },
    {
      id: "equipment-add",
      selector: '[data-tour="resources-equipment-add"]',
      title: t("tours.resources.steps.equipment-add.title"),
      description: t("tours.resources.steps.equipment-add.description"),
      side: "left",
    },
    {
      id: "equipment-dronetag",
      selector: '[data-tour="resources-equipment-dronetag"]',
      title: t("tours.resources.steps.equipment-dronetag.title"),
      description: t("tours.resources.steps.equipment-dronetag.description"),
      side: "left",
    },
    {
      id: "equipment-filters",
      selector: '[data-tour="resources-equipment-filters"]',
      title: t("tours.resources.steps.equipment-filters.title"),
      description: t("tours.resources.steps.equipment-filters.description"),
      side: "bottom",
    },
    {
      id: "equipment-card",
      selector: '[data-tour="resources-equipment-card"]',
      title: t("tours.resources.steps.equipment-card.title"),
      description: t("tours.resources.steps.equipment-card.description"),
      side: "left",
    },

    // ---------- EQUIPMENT DETAIL ----------
    {
      id: "equipment-detail",
      selector: '[role="dialog"]:has([data-tour="equipment-detail-logbok"])',
      title: t("tours.resources.steps.equipment-detail.title"),
      description: t("tours.resources.steps.equipment-detail.description"),
      side: "over",
      beforeStep: openFirstEquipment,
      optional: false,
    },
    {
      id: "equipment-detail-logbok",
      selector: '[data-tour="equipment-detail-logbok"]',
      title: t("tours.resources.steps.equipment-detail-logbok.title"),
      description: t("tours.resources.steps.equipment-detail-logbok.description"),
      side: "bottom",
    },
    {
      id: "equipment-logbook",
      selector: '[role="dialog"]:has([data-tour="equipment-logbook-add"])',
      title: t("tours.resources.steps.equipment-logbook.title"),
      description: t("tours.resources.steps.equipment-logbook.description"),
      side: "over",
      beforeStep: openEquipmentLogbook,
      optional: false,
    },

    // ---------- ADD EQUIPMENT ----------
    {
      id: "add-equipment",
      selector: '[role="dialog"]:has([data-tour="add-equipment-marker"])',
      title: t("tours.resources.steps.add-equipment.title"),
      description: t("tours.resources.steps.add-equipment.description"),
      side: "over",
      beforeStep: async () => {
        await closeEquipmentLogbook();
        await closeAnyOpenDialog();
        await openAddEquipment();
      },
      optional: false,
    },

    // ---------- DRONETAG ----------
    {
      id: "add-dronetag",
      selector: '[role="dialog"]:has([data-tour="add-dronetag-marker"])',
      title: t("tours.resources.steps.add-dronetag.title"),
      description: t("tours.resources.steps.add-dronetag.description"),
      side: "over",
      beforeStep: openAddDronetag,
      optional: false,
    },

    // ---------- PERSONELL ----------
    {
      id: "personnel-section",
      selector: '[data-tour="resources-personnel-section"]',
      title: t("tours.resources.steps.personnel-section.title"),
      description: t("tours.resources.steps.personnel-section.description"),
      side: "left",
      beforeStep: closeAnyOpenDialog,
    },
    {
      id: "personnel-add",
      selector: '[data-tour="resources-personnel-add"]',
      title: t("tours.resources.steps.personnel-add.title"),
      description: t("tours.resources.steps.personnel-add.description"),
      side: "left",
    },
    {
      id: "personnel-filters",
      selector: '[data-tour="resources-personnel-filters"]',
      title: t("tours.resources.steps.personnel-filters.title"),
      description: t("tours.resources.steps.personnel-filters.description"),
      side: "bottom",
    },
    {
      id: "personnel-card",
      selector: '[data-tour="resources-personnel-card"]',
      title: t("tours.resources.steps.personnel-card.title"),
      description: t("tours.resources.steps.personnel-card.description"),
      side: "left",
    },

    // ---------- PERSON DIALOG ----------
    {
      id: "person-dialog",
      selector: '[role="dialog"]:has([data-tour="person-logbok"])',
      title: t("tours.resources.steps.person-dialog.title"),
      description: t("tours.resources.steps.person-dialog.description"),
      side: "over",
      beforeStep: openFirstPerson,
      optional: false,
    },
    {
      id: "person-logbok",
      selector: '[data-tour="person-logbok"]',
      title: t("tours.resources.steps.person-logbok.title"),
      description: t("tours.resources.steps.person-logbok.description"),
      side: "bottom",
    },
    {
      id: "person-competencies",
      selector: '[data-tour="person-competencies"]',
      title: t("tours.resources.steps.person-competencies.title"),
      description: t("tours.resources.steps.person-competencies.description"),
      side: "top",
    },
    {
      id: "person-courses",
      selector: '[data-tour="person-courses"]',
      title: t("tours.resources.steps.person-courses.title"),
      description: t("tours.resources.steps.person-courses.description"),
      side: "top",
      optional: true,
    },
    {
      id: "person-add-competency",
      selector: '[data-tour="person-add-competency"]',
      title: t("tours.resources.steps.person-add-competency.title"),
      description: t("tours.resources.steps.person-add-competency.description"),
      side: "top",
    },

    // ---------- ADD COMPETENCY ----------
    {
      id: "add-competency",
      selector: '[role="dialog"]:has([data-tour="add-competency-marker"])',
      title: t("tours.resources.steps.add-competency.title"),
      description: t("tours.resources.steps.add-competency.description"),
      side: "over",
      beforeStep: openAddCompetency,
      optional: false,
    },

    // ---------- DONE ----------
    {
      id: "done",
      selector: "main",
      title: t("tours.resources.steps.done.title"),
      description: t("tours.resources.steps.done.description"),
      side: "bottom",
      beforeStep: closeAnyOpenDialog,
    },
  ],
});
