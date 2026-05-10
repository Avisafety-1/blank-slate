export type TourId =
  | "system-overview"
  | "mission-creation"
  | "dashboard-widgets"
  | "start-flight"
  | "log-flight"
  | "upload-drone-log";

export interface TourStep {
  /** Stable id for debugging */
  id: string;
  /** CSS selector — typically [data-tour="..."] */
  selector: string;
  /** Norwegian title shown in popover */
  title: string;
  /** Norwegian description body (short) */
  description: string;
  /** Preferred side for popover */
  side?: "top" | "bottom" | "left" | "right" | "over";
  /** Navigate to this route before showing the step */
  route?: string;
  /** Skip the step if user is not admin */
  requiresAdmin?: boolean;
  /** Skip the step if user is not superadmin */
  requiresSuperAdmin?: boolean;
  /** Skip the step if module is not enabled (training module key) */
  requiresModule?: string;
  /** Run before showing — open dropdowns etc. */
  beforeStep?: () => Promise<void> | void;
  /** Allow Leaflet map clicks while this step is active */
  allowMapInteraction?: boolean;
  /** Skip silently if selector not found within timeout (default true) */
  optional?: boolean;
}

export interface TourDefinition {
  id: TourId;
  title: string;
  description: string;
  steps: TourStep[];
}
