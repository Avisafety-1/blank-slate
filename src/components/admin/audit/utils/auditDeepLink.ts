import type { DeepLink } from "../types";

/**
 * Central mapping from an entity in AviSafe to a UI route.
 * Keep this the single source of truth — validators produce entity ids only,
 * this util turns them into navigable links.
 */
export function auditDeepLink(entityType: string, entityId: string): DeepLink {
  switch (entityType) {
    case "drone":
      return { path: `/ressurser?tab=drones&id=${entityId}` };
    case "equipment":
      return { path: `/ressurser?tab=equipment&id=${entityId}` };
    case "profile":
    case "person":
    case "personnel":
    case "competency":
      return { path: `/ressurser?tab=personnel&id=${entityId}` };
    case "mission":
      return { path: `/oppdrag?mission=${entityId}` };
    case "flight":
      return { path: `/oppdrag?flight=${entityId}` };
    case "document":
      return { path: `/dokumenter?id=${entityId}` };
    case "incident":
    case "action":
      return { path: `/hendelser?id=${entityId}` };
    // Opens AuditTaskDialog anywhere in the app; for actions, pass the finding id.
    case "audit_finding":
    case "audit_action":
      return { path: `/?auditFinding=${entityId}` };
    default:
      return { path: `/admin?tab=audit` };
  }
}

/** Reminder link for a completed mission without flight log; opens the "was it flown?" card. */
export const noFlightDeepLink = (missionId: string) => `/oppdrag?mission=${missionId}&action=noFlight`;
