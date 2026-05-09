import type { TourDefinition, TourId } from "./types";
import { systemOverviewTour } from "./systemOverviewTour";
import { missionCreationTour } from "./missionCreationTour";

export const allTours: Record<TourId, TourDefinition> = {
  "system-overview": systemOverviewTour,
  "mission-creation": missionCreationTour,
};

export const tourList: TourDefinition[] = [systemOverviewTour, missionCreationTour];
