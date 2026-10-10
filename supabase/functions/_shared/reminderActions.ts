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
  | "takeResponsibility"
  | "addIncidentComment"
  | "closeIncident"
  | "selectResponsible"
  | "openAuditTask"
  | "reportIncident"
  | "writeMissionExplanation"
  | "startRiskAssessment"
  | "openRiskAssessment"
  | "editCompetency"
  | "uploadDocumentVersion"
  | "uploadEmergencyPlan"
  | "openDroneMaintenance";

export type ReminderActionKind = "open" | "mutate";

export const ACTION_KIND: Record<ReminderActionId, ReminderActionKind> = {
  notFlown: "mutate", flown: "mutate", changeDate: "open", finishMission: "mutate",
  endFlight: "mutate", uploadLog: "open", takeResponsibility: "mutate",
  addIncidentComment: "mutate", closeIncident: "open", selectResponsible: "open",
  openAuditTask: "open", reportIncident: "open", writeMissionExplanation: "mutate",
  startRiskAssessment: "open", openRiskAssessment: "open", editCompetency: "open",
  uploadDocumentVersion: "open", uploadEmergencyPlan: "open", openDroneMaintenance: "open",
};

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
  IncidentOpenTooLong: ["takeResponsibility", "addIncidentComment", "closeIncident"],
  OpenActionsTooLong: ["openAuditTask"],
  FindingAwaitingVerification: ["openAuditTask"],
  FlownWithNoGo: ["reportIncident", "writeMissionExplanation"],
  MissingRiskAssessment: ["startRiskAssessment", "reportIncident", "writeMissionExplanation"],
  SoraEnvelopeExceeded: ["openRiskAssessment", "reportIncident"],
  ExpiredCompetence: ["editCompetency"],
  CompetenceExpiringSoon: ["editCompetency"],
  ExpiredDocument: ["uploadDocumentVersion"],
  DocumentExpired: ["uploadDocumentVersion"],
  DocumentReviewOverdue: ["uploadDocumentVersion"],
  MissingEmergencyPlan: ["uploadEmergencyPlan"],
  DroneStatusRed: ["openDroneMaintenance"],
  DroneStatusYellow: ["openDroneMaintenance"],
};

/** Actions that change data and therefore need a confirmation dialog + thread reply. */
export const MUTATING_ACTIONS: ReminderActionId[] = Object.entries(ACTION_KIND)
  .filter(([, kind]) => kind === "mutate")
  .map(([action]) => action as ReminderActionId);

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
  isCurrentUserResponsible?: boolean;
  canWrite?: boolean;
  auditActionClosed?: boolean;
  missionTimePassed?: boolean;
  activeFlightEnded?: boolean;
  riskAssessmentMissing?: boolean;
  soraEnvelopeExceeded?: boolean;
  competencyRelevant?: boolean;
  documentRelevant?: boolean;
  emergencyPlanMissing?: boolean;
  droneNeedsAttention?: boolean;
}

export const missionWasFlownOrCompleted = (s: ReminderEntityState): boolean =>
  s.missionStatus === COMPLETED || (!!s.missionTimePassed && (!!s.hasFlightLog || !!s.activeFlightEnded));

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
    case "IncidentOpenTooLong":
      return s.incidentClosed ? [] : [
        ...(!s.isCurrentUserResponsible && s.canWrite ? ["takeResponsibility" as const] : []),
        ...(s.canWrite ? ["addIncidentComment" as const] : []),
        "closeIncident" as const,
      ];
    case "OpenActionsTooLong":
      return s.auditActionClosed ? [] : ["openAuditTask"];
    case "FindingAwaitingVerification":
      return ["openAuditTask"];
    case "FlownWithNoGo":
      return s.canWrite === false ? ["reportIncident"] : ["reportIncident", "writeMissionExplanation"];
    case "MissingRiskAssessment":
      if (!s.riskAssessmentMissing) return [];
      return missionWasFlownOrCompleted(s)
        ? ["reportIncident", ...(s.canWrite === false ? [] : ["writeMissionExplanation" as const])]
        : ["startRiskAssessment"];
    case "SoraEnvelopeExceeded":
      if (!s.soraEnvelopeExceeded) return [];
      return missionWasFlownOrCompleted(s) ? ["reportIncident", "openRiskAssessment"] : ["openRiskAssessment"];
    case "ExpiredCompetence":
    case "CompetenceExpiringSoon":
      return s.competencyRelevant ? ["editCompetency"] : [];
    case "ExpiredDocument":
    case "DocumentExpired":
    case "DocumentReviewOverdue":
      return s.documentRelevant ? ["uploadDocumentVersion"] : [];
    case "MissingEmergencyPlan":
      return s.emergencyPlanMissing ? ["uploadEmergencyPlan"] : [];
    case "DroneStatusRed":
    case "DroneStatusYellow":
      return s.droneNeedsAttention ? ["openDroneMaintenance"] : [];
    default:
      return code.startsWith("Audit") ? ["openAuditTask"] : [];
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
  const all = Object.keys(ACTION_KIND) as ReminderActionId[];
  return (all as string[]).includes(v) ? (v as ReminderActionId) : null;
}

/** App path that opens the card with the action pre-selected. Never performs the action itself. */
export function actionDeepLink(k: ParsedFindingKey, action: ReminderActionId, msgId: string): string {
  void action;
  return `/?msg=${encodeURIComponent(msgId)}&entity=${encodeURIComponent(k.entityType)}&entityId=${encodeURIComponent(k.entityId)}`;
}

const EMAIL_LABELS: Record<"no" | "en", Record<ReminderActionId, string>> = {
  no: {
    notFlown: "Ble ikke fløyet", flown: "Ble fløyet", changeDate: "Endre dato",
    finishMission: "Avslutt oppdraget", endFlight: "Avslutt flygingen",
    uploadLog: "Last opp flylogg", takeResponsibility: "Jeg tar ansvaret",
    addIncidentComment: "Skriv kommentar", closeIncident: "Lukk hendelse…", selectResponsible: "Velg ansvarlig…",
    openAuditTask: "Åpne revisjonsoppgave", reportIncident: "Registrer avvik", writeMissionExplanation: "Skriv forklaring",
    startRiskAssessment: "Start risikovurdering", openRiskAssessment: "Åpne risikovurdering", editCompetency: "Oppdater kompetanse…",
    uploadDocumentVersion: "Last opp ny versjon…", uploadEmergencyPlan: "Last opp beredskapsplan…",
    openDroneMaintenance: "Registrer inspeksjon/vedlikehold…",
  },
  en: {
    notFlown: "Not flown", flown: "Was flown", changeDate: "Change date",
    finishMission: "Complete mission", endFlight: "End flight",
    uploadLog: "Upload flight log", takeResponsibility: "I'll take responsibility",
    addIncidentComment: "Write comment", closeIncident: "Close incident…", selectResponsible: "Choose responsible…",
    openAuditTask: "Open audit task", reportIncident: "Register deviation", writeMissionExplanation: "Write explanation",
    startRiskAssessment: "Start risk assessment", openRiskAssessment: "Open risk assessment", editCompetency: "Update competency…",
    uploadDocumentVersion: "Upload new version…", uploadEmergencyPlan: "Upload emergency plan…",
    openDroneMaintenance: "Register inspection/maintenance…",
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
