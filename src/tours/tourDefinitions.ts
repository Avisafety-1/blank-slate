import type { TourDefinition, TourId } from "./types";
import { systemOverviewTour } from "./systemOverviewTour";
import { missionCreationTour } from "./missionCreationTour";
import { dashboardWidgetsTour } from "./dashboardWidgetsTour";

export const allTours: Record<TourId, TourDefinition> = {
  "system-overview": systemOverviewTour,
  "mission-creation": missionCreationTour,
  "dashboard-widgets": dashboardWidgetsTour,
};

export const tourList: TourDefinition[] = [systemOverviewTour, dashboardWidgetsTour, missionCreationTour];
