/**
 * Quick-action registry for reminders (internal_messages.finding_key).
 * Pure module shared by the app (ReminderActionCard) and send-reminder (e-mail buttons),
 * so the actions offered in the inbox, in e-mail and in deep links can never drift.
 * finding_key format: "<Code>:<entityType>:<entityId>" — bulk reminders join several with ",".
 */

export type ReminderActionId =
  | "notFlown"
  | "flown"
  | "changeDate"
  | "finishMission"
  | "endFlight"
  | "uploadLog"
  | "takeResponsibility";

export const PLANNED = "Planlagt";
export const IN_PROGRESS = "Pågående";
export const COMPLETED = "Fullført";
export const CANCELLED = "Avbrutt";

/** Actions per finding code. Codes not listed only get an "Open" link — never a closing action. */
export const REMINDER_ACTIONS: Record<string, ReminderActionId[]> = {
  MissionPlannedPastDue: ["notFlown", "flown", "changeDate"],
  MissionInProgressStale: ["finishMission", "notFlown"],
  ActiveFlightStale: ["endFlight"],
  MissionWithoutFlightLog: ["uploadLog", "notFlown"],
  IncidentNoResponsible: ["takeResponsibility"],
};

/** Actions that change data and therefore need a confirmation dialog + thread reply. */
export const MUTATING_ACTIONS: ReminderActionId[] = ["notFlown", "flown", "finishMission", "endFlight", "takeResponsibility"];

export interface ParsedFindingKey { code: string; entityType: string; entityId: string }

export function parseFindingKeys(key: string | null | undefined): ParsedFindingKey[] {
  return (key ?? "").split(",").map((s) => s.trim()).filter(Boolean).flatMap((k) => {
    const [code, entityType, ...rest] = k.split(":");
    const entityId = rest.join(":");
    return code && entityType && entityId ? [{ code, entityType, entityId }] : [];
  });
}

export const hasQuickActions = (code: string): boolean => (REMINDER_ACTIONS[code]?.length ?? 0) > 0;

/** Current state of the entity the reminder is about. */
export interface ReminderEntityState {
  missionStatus?: string | null;
  hasFlightLog?: boolean;
  /** ActiveFlightStale: the active_flights row still exists. */
  flightActive?: boolean;
  /** ActiveFlightStale: the flight belongs to the current user (only the pilot can end it). */
  flightIsMine?: boolean;
  incidentResponsibleId?: string | null;
  incidentClosed?: boolean;
}

/** Which actions are still relevant now — hides e.g. "not flown" once the mission is already Avbrutt. */
export function availableActions(code: string, s: ReminderEntityState): ReminderActionId[] {
  const status = s.missionStatus ?? null;
  switch (code) {
    case "MissionPlannedPastDue":
      return status === PLANNED ? ["notFlown", "flown", "changeDate"] : [];
    case "MissionInProgressStale":
      return status === IN_PROGRESS ? ["finishMission", "notFlown"] : [];
    case "MissionWithoutFlightLog":
      return status === COMPLETED && !s.hasFlightLog ? ["uploadLog", "notFlown"] : [];
    case "ActiveFlightStale":
      return s.flightActive && s.flightIsMine ? ["endFlight"] : [];
    case "IncidentNoResponsible":
      return !s.incidentResponsibleId && !s.incidentClosed ? ["takeResponsibility"] : [];
    default:
      return [];
  }
}

/** Mission status after a mutating action (null = no status change). */
export function targetMissionStatus(action: ReminderActionId): string | null {
  if (action === "notFlown") return CANCELLED;
  if (action === "flown" || action === "finishMission") return COMPLETED;
  return null;
}

/** Normalises ?action= values; legacy action=noFlight maps to the missing-log card. */
export function normalizeActionParam(v: string | null | undefined): ReminderActionId | "noFlight" | null {
  if (!v) return null;
  if (v === "noFlight") return "noFlight";
  const all: ReminderActionId[] = ["notFlown", "flown", "changeDate", "finishMission", "endFlight", "uploadLog", "takeResponsibility"];
  return (all as string[]).includes(v) ? (v as ReminderActionId) : null;
}

/** App path that opens the card with the action pre-selected. Never performs the action itself. */
export function actionDeepLink(k: ParsedFindingKey, action: ReminderActionId, msgId: string): string {
  const q = `action=${action}&msg=${encodeURIComponent(msgId)}`;
  if (k.entityType === "incident") return `/hendelser?id=${encodeURIComponent(k.entityId)}&${q}`;
  if (k.entityType === "active_flight") return `/oppdrag?flight=${encodeURIComponent(k.entityId)}&${q}`;
  return `/oppdrag?mission=${encodeURIComponent(k.entityId)}&${q}`;
}

const EMAIL_LABELS: Record<"no" | "en", Record<ReminderActionId, string>> = {
  no: {
    notFlown: "Ble ikke fløyet", flown: "Ble fløyet", changeDate: "Endre dato",
    finishMission: "Avslutt oppdraget", endFlight: "Avslutt flygingen",
    uploadLog: "Last opp flylogg", takeResponsibility: "Jeg tar ansvaret",
  },
  en: {
    notFlown: "Not flown", flown: "Was flown", changeDate: "Change date",
    finishMission: "Complete mission", endFlight: "End flight",
    uploadLog: "Upload flight log", takeResponsibility: "I'll take responsibility",
  },
};

/** E-mail buttons: links into the app only (scanners follow links, so they must not act). */
export function emailActionLinks(findingKey: string | null | undefined, msgId: string, lang: string | null | undefined) {
  const l = lang?.startsWith("en") ? "en" : "no";
  return parseFindingKeys(findingKey).slice(0, 10).map((k) => ({
    key: k,
    actions: (REMINDER_ACTIONS[k.code] ?? []).map((a) => ({ action: a, label: EMAIL_LABELS[l][a], path: actionDeepLink(k, a, msgId) })),
  })).filter((r) => r.actions.length > 0);
}

/** Deep link without a message: infer the mission finding from its current status. */
export function missionCodeForStatus(status: string | null | undefined): string | null {
  if (status === PLANNED) return "MissionPlannedPastDue";
  if (status === IN_PROGRESS) return "MissionInProgressStale";
  if (status === COMPLETED) return "MissionWithoutFlightLog";
  return null;
}

export const INCIDENT_CLOSED_STATUSES = ["Ferdigbehandlet", "Lukket"];
