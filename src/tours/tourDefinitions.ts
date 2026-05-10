import type { TourDefinition, TourId } from "./types";
import { systemOverviewTour } from "./systemOverviewTour";
import { missionCreationTour } from "./missionCreationTour";
import { dashboardWidgetsTour } from "./dashboardWidgetsTour";
import { startFlightTour } from "./startFlightTour";
import { logFlightTour } from "./logFlightTour";
import { uploadDroneLogTour } from "./uploadDroneLogTour";

export const allTours: Record<TourId, TourDefinition> = {
  "system-overview": systemOverviewTour,
  "mission-creation": missionCreationTour,
  "dashboard-widgets": dashboardWidgetsTour,
  "start-flight": startFlightTour,
  "log-flight": logFlightTour,
  "upload-drone-log": uploadDroneLogTour,
};

export const tourList: TourDefinition[] = [
  systemOverviewTour,
  dashboardWidgetsTour,
  missionCreationTour,
  startFlightTour,
  logFlightTour,
  uploadDroneLogTour,
];
