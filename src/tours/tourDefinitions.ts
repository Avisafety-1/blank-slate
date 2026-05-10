import type { TourDefinition, TourId } from "./types";
import { systemOverviewTour } from "./systemOverviewTour";
import { missionCreationTour } from "./missionCreationTour";
import { dashboardWidgetsTour } from "./dashboardWidgetsTour";
import { startFlightTour } from "./startFlightTour";
import { logFlightTour } from "./logFlightTour";
import { uploadDroneLogTour } from "./uploadDroneLogTour";
import { incidentReportTour } from "./incidentReportTour";

export const allTours: Record<TourId, TourDefinition> = {
  "system-overview": systemOverviewTour,
  "mission-creation": missionCreationTour,
  "dashboard-widgets": dashboardWidgetsTour,
  "start-flight": startFlightTour,
  "log-flight": logFlightTour,
  "upload-drone-log": uploadDroneLogTour,
  "incident-report": incidentReportTour,
};

export const tourList: TourDefinition[] = [
  systemOverviewTour,
  dashboardWidgetsTour,
  missionCreationTour,
  startFlightTour,
  logFlightTour,
  uploadDroneLogTour,
  incidentReportTour,
];

/** Tourer som kan tildeles brukere som kurs via opplæringsmodulen */
export const assignableTours: { id: TourId; title: string; description: string }[] =
  tourList.map((t) => ({ id: t.id, title: t.title, description: t.description }));
