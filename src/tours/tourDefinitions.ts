import type { TFunction } from "i18next";
import type { TourDefinition, TourId } from "./types";
import { createSystemOverviewTour } from "./systemOverviewTour";
import { createMissionCreationTour } from "./missionCreationTour";
import { createDashboardWidgetsTour } from "./dashboardWidgetsTour";
import { createStartFlightTour } from "./startFlightTour";
import { createLogFlightTour } from "./logFlightTour";
import { createUploadDroneLogTour } from "./uploadDroneLogTour";
import { createIncidentReportTour } from "./incidentReportTour";
import { createResourcesTour } from "./resourcesTour";
import { createAdminTour } from "./adminTour";

export function getAllTours(t: TFunction): Record<TourId, TourDefinition> {
  return {
    "system-overview": createSystemOverviewTour(t),
    "mission-creation": createMissionCreationTour(t),
    "dashboard-widgets": createDashboardWidgetsTour(t),
    "start-flight": createStartFlightTour(t),
    "log-flight": createLogFlightTour(t),
    "upload-drone-log": createUploadDroneLogTour(t),
    "incident-report": createIncidentReportTour(t),
    resources: createResourcesTour(t),
    admin: createAdminTour(t),
  };
}

export function getTourList(t: TFunction): TourDefinition[] {
  const all = getAllTours(t);
  return [
    all["system-overview"],
    all["dashboard-widgets"],
    all["mission-creation"],
    all["start-flight"],
    all["log-flight"],
    all["upload-drone-log"],
    all["incident-report"],
    all.resources,
    all.admin,
  ];
}

export function getTourById(id: TourId, t: TFunction): TourDefinition | undefined {
  return getAllTours(t)[id];
}

/** Tourer som kan tildeles brukere som kurs via opplæringsmodulen */
export function getAssignableTours(t: TFunction): { id: TourId; title: string; description: string }[] {
  return getTourList(t).map((tour) => ({ id: tour.id, title: tour.title, description: tour.description }));
}
