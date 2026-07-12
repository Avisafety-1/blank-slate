import type { TFunction } from "i18next";
import type { TourDefinition } from "./types";
import { sleep } from "./tourUtils";

// Map fra data-tour-anker → Radix Tabs value (må samsvare med Admin.tsx)
const TAB_VALUE: Record<string, string> = {
  '[data-tour="admin-tab-users"]': "users",
  '[data-tour="admin-tab-customers"]': "customers",
  '[data-tour="admin-tab-email"]': "email-templates",
  '[data-tour="admin-tab-sora"]': "company-config",
  '[data-tour="admin-tab-child"]': "child-companies",
  '[data-tour="admin-tab-training"]': "training",
};

const clickTab = async (selector: string) => {
  const value = TAB_VALUE[selector];
  if (!value) return;
  // Be Admin-siden bytte fane direkte (kontrollert state) — mer robust enn syntetiske klikk
  window.dispatchEvent(new CustomEvent("avisafe:set-admin-tab", { detail: { value } }));
  // Vent til Radix har markert riktig trigger som aktiv
  for (let i = 0; i < 30; i++) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el?.getAttribute("data-state") === "active") break;
    await sleep(25);
  }
  await sleep(200);
};

export const createAdminTour = (t: TFunction): TourDefinition => ({
  id: "admin",
  title: t("tours.admin.title"),
  description: t("tours.admin.description"),
  steps: [
    // ---------- INTRO ----------
    {
      id: "intro",
      route: "/admin",
      selector: "main",
      title: t("tours.admin.steps.intro.title"),
      description: t("tours.admin.steps.intro.description"),
      side: "bottom",
      requiresAdmin: true,
    },
    {
      id: "tabs",
      selector: '[data-tour="admin-tabs"]',
      title: t("tours.admin.steps.tabs.title"),
      description: t("tours.admin.steps.tabs.description"),
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-users"]'),
    },

    // ====================================================
    // BRUKERE (8 steg)
    // ====================================================
    {
      id: "users-tab",
      selector: '[data-tour="admin-tab-users"]',
      title: t("tours.admin.steps.users-tab.title"),
      description: t("tours.admin.steps.users-tab.description"),
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-users"]'),
    },
    {
      id: "registration-code",
      selector: '[data-tour="admin-registration-code"]',
      title: t("tours.admin.steps.registration-code.title"),
      description: t("tours.admin.steps.registration-code.description"),
      side: "bottom",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "invite",
      selector: '[data-tour="admin-invite"]',
      title: t("tours.admin.steps.invite.title"),
      description: t("tours.admin.steps.invite.description"),
      side: "bottom",
      requiresAdmin: true,
    },
    {
      id: "pending",
      selector: '[data-tour="admin-pending"]',
      title: t("tours.admin.steps.pending.title"),
      description: t("tours.admin.steps.pending.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "approved-actions",
      selector: '[data-tour="admin-approved-actions"]',
      title: t("tours.admin.steps.approved-actions.title"),
      description: t("tours.admin.steps.approved-actions.description"),
      side: "bottom",
      requiresAdmin: true,
    },
    {
      id: "approved-list",
      selector: '[data-tour="admin-approved"]',
      title: t("tours.admin.steps.approved-list.title"),
      description: t("tours.admin.steps.approved-list.description"),
      side: "top",
      requiresAdmin: true,
    },
    {
      id: "user-roles-switches",
      selector: '[data-tour="admin-approved"]',
      title: t("tours.admin.steps.user-roles-switches.title"),
      description: t("tours.admin.steps.user-roles-switches.description"),
      side: "top",
      requiresAdmin: true,
    },
    {
      id: "user-training-delete",
      selector: '[data-tour="admin-approved"]',
      title: t("tours.admin.steps.user-training-delete.title"),
      description: t("tours.admin.steps.user-training-delete.description"),
      side: "top",
      requiresAdmin: true,
    },

    // ====================================================
    // KUNDER (3 steg)
    // ====================================================
    {
      id: "tab-customers",
      selector: '[data-tour="admin-tab-customers"]',
      title: t("tours.admin.steps.tab-customers.title"),
      description: t("tours.admin.steps.tab-customers.description"),
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-customers"]'),
    },
    {
      id: "customers-add",
      selector: '[data-tour="admin-content-customers"]',
      title: t("tours.admin.steps.customers-add.title"),
      description: t("tours.admin.steps.customers-add.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "customers-list",
      selector: '[data-tour="admin-content-customers"]',
      title: t("tours.admin.steps.customers-list.title"),
      description: t("tours.admin.steps.customers-list.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ====================================================
    // E-POST (4 steg)
    // ====================================================
    {
      id: "tab-email",
      selector: '[data-tour="admin-tab-email"]',
      title: t("tours.admin.steps.tab-email.title"),
      description: t("tours.admin.steps.tab-email.description"),
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-email"]'),
    },
    {
      id: "email-templates",
      selector: '[data-tour="admin-content-email"]',
      title: t("tours.admin.steps.email-templates.title"),
      description: t("tours.admin.steps.email-templates.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "email-settings",
      selector: '[data-tour="admin-content-email"]',
      title: t("tours.admin.steps.email-settings.title"),
      description: t("tours.admin.steps.email-settings.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "email-bulk",
      selector: '[data-tour="admin-content-email"]',
      title: t("tours.admin.steps.email-bulk.title"),
      description: t("tours.admin.steps.email-bulk.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ====================================================
    // SORA (4 steg, optional via addon)
    // ====================================================
    {
      id: "tab-sora",
      selector: '[data-tour="admin-tab-sora"]',
      title: t("tours.admin.steps.tab-sora.title"),
      description: t("tours.admin.steps.tab-sora.description"),
      side: "bottom",
      requiresAdmin: true,
      optional: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-sora"]'),
    },
    {
      id: "sora-flightgeo",
      selector: '[data-tour="admin-content-sora"]',
      title: t("tours.admin.steps.sora-flightgeo.title"),
      description: t("tours.admin.steps.sora-flightgeo.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "sora-altitude",
      selector: '[data-tour="admin-content-sora"]',
      title: t("tours.admin.steps.sora-altitude.title"),
      description: t("tours.admin.steps.sora-altitude.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "sora-mitigations",
      selector: '[data-tour="admin-content-sora"]',
      title: t("tours.admin.steps.sora-mitigations.title"),
      description: t("tours.admin.steps.sora-mitigations.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ====================================================
    // MITT SELSKAP (5 steg)
    // ====================================================
    {
      id: "tab-child",
      selector: '[data-tour="admin-tab-child"]',
      title: t("tours.admin.steps.tab-child.title"),
      description: t("tours.admin.steps.tab-child.description"),
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-child"]'),
    },
    {
      id: "child-info",
      selector: '[data-tour="admin-content-child"]',
      title: t("tours.admin.steps.child-info.title"),
      description: t("tours.admin.steps.child-info.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "child-departments",
      selector: '[data-tour="admin-content-child"]',
      title: t("tours.admin.steps.child-departments.title"),
      description: t("tours.admin.steps.child-departments.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "child-checklists",
      selector: '[data-tour="admin-content-child"]',
      title: t("tours.admin.steps.child-checklists.title"),
      description: t("tours.admin.steps.child-checklists.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "child-integrations-propagation",
      selector: '[data-tour="admin-content-child"]',
      title: t("tours.admin.steps.child-integrations-propagation.title"),
      description: t("tours.admin.steps.child-integrations-propagation.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ====================================================
    // OPPLÆRING (5 steg)
    // ====================================================
    {
      id: "tab-training",
      selector: '[data-tour="admin-tab-training"]',
      title: t("tours.admin.steps.tab-training.title"),
      description: t("tours.admin.steps.tab-training.description"),
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-training"]'),
    },
    {
      id: "training-courses",
      selector: '[data-tour="admin-content-training"]',
      title: t("tours.admin.steps.training-courses.title"),
      description: t("tours.admin.steps.training-courses.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "training-ai",
      selector: '[data-tour="admin-content-training"]',
      title: t("tours.admin.steps.training-ai.title"),
      description: t("tours.admin.steps.training-ai.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "training-assign",
      selector: '[data-tour="admin-content-training"]',
      title: t("tours.admin.steps.training-assign.title"),
      description: t("tours.admin.steps.training-assign.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },
    {
      id: "training-status",
      selector: '[data-tour="admin-content-training"]',
      title: t("tours.admin.steps.training-status.title"),
      description: t("tours.admin.steps.training-status.description"),
      side: "top",
      requiresAdmin: true,
      optional: true,
    },

    // ====================================================
    // AVSLUTNING
    // ====================================================
    {
      id: "done",
      selector: "main",
      title: t("tours.admin.steps.done.title"),
      description: t("tours.admin.steps.done.description"),
      side: "bottom",
      requiresAdmin: true,
      beforeStep: () => clickTab('[data-tour="admin-tab-users"]'),
    },
  ],
});
