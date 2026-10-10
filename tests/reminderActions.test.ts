import { describe, expect, test } from "bun:test";
import {
  ACTION_KIND, actionDeepLink, availableActions, emailActionLinks, hasQuickActions, missionCodeForStatus,
  normalizeActionParam, parseFindingKeys,
} from "../supabase/functions/_shared/reminderActions";

describe("which codes have one-tap actions", () => {
  test.each([
    "MissionPlannedPastDue", "MissionInProgressStale", "ActiveFlightStale", "MissionWithoutFlightLog", "IncidentNoResponsible",
    "IncidentOpenTooLong", "OpenActionsTooLong", "FlownWithNoGo", "MissingRiskAssessment", "SoraEnvelopeExceeded",
    "ExpiredCompetence", "CompetenceExpiringSoon", "ExpiredDocument", "DocumentReviewOverdue", "MissingEmergencyPlan",
    "DroneStatusRed", "DroneStatusYellow",
  ])("%s has quick actions", (c) => expect(hasQuickActions(c)).toBe(true));
  test.each(["CompetencyExpired", "InspectionOverdue"])(
    "%s only gets an Open link", (c) => expect(hasQuickActions(c)).toBe(false),
  );
});

describe("actions hidden once status has changed", () => {
  test("planned past due offers not flown / flown / change date while Planlagt", () => {
    expect(availableActions("MissionPlannedPastDue", { missionStatus: "Planlagt" })).toEqual(["notFlown", "flown", "changeDate"]);
  });
  test("planned past due offers nothing once Avbrutt", () => {
    expect(availableActions("MissionPlannedPastDue", { missionStatus: "Avbrutt" })).toEqual([]);
  });
  test("in-progress stale offers nothing once Fullført", () => {
    expect(availableActions("MissionInProgressStale", { missionStatus: "Fullført" })).toEqual([]);
  });
  test("missing log offers nothing once a log exists", () => {
    expect(availableActions("MissionWithoutFlightLog", { missionStatus: "Fullført", hasFlightLog: true })).toEqual([]);
  });
  test("stale flight can only be ended by its own pilot while still active", () => {
    expect(availableActions("ActiveFlightStale", { flightActive: true, flightIsMine: true })).toEqual(["endFlight"]);
    expect(availableActions("ActiveFlightStale", { flightActive: true, flightIsMine: false })).toEqual([]);
    expect(availableActions("ActiveFlightStale", { flightActive: false, flightIsMine: true })).toEqual([]);
  });
  test("incident with an owner offers nothing", () => {
    expect(availableActions("IncidentNoResponsible", { incidentResponsibleId: "u1" })).toEqual([]);
    expect(availableActions("IncidentNoResponsible", { incidentResponsibleId: null, canWrite: true })).toEqual(["takeResponsibility", "selectResponsible"]);
  });
  test("open incident offers only currently relevant actions", () => {
    expect(availableActions("IncidentOpenTooLong", { incidentClosed: false, canWrite: true })).toEqual(["takeResponsibility", "addIncidentComment", "closeIncident"]);
    expect(availableActions("IncidentOpenTooLong", { incidentClosed: true, canWrite: true })).toEqual([]);
  });
  test("missing assessment changes after flight", () => {
    expect(availableActions("MissingRiskAssessment", { riskAssessmentMissing: true, missionTimePassed: false, canWrite: true })).toEqual(["startRiskAssessment"]);
    expect(availableActions("MissingRiskAssessment", { riskAssessmentMissing: true, missionStatus: "Fullført", canWrite: true })).toEqual(["reportIncident", "writeMissionExplanation"]);
    expect(availableActions("MissingRiskAssessment", { riskAssessmentMissing: true, missionTimePassed: true, hasFlightLog: true, canWrite: true })).toEqual(["reportIncident", "writeMissionExplanation"]);
    expect(availableActions("MissingRiskAssessment", { riskAssessmentMissing: true, missionTimePassed: true, activeFlightEnded: true, canWrite: true })).toEqual(["reportIncident", "writeMissionExplanation"]);
  });
  test("SORA deviation changes after flight", () => {
    expect(availableActions("SoraEnvelopeExceeded", { soraEnvelopeExceeded: true, missionTimePassed: false })).toEqual(["openRiskAssessment"]);
    expect(availableActions("SoraEnvelopeExceeded", { soraEnvelopeExceeded: true, missionStatus: "Fullført" })).toEqual(["reportIncident", "openRiskAssessment"]);
  });
  test("remaining finding codes have exact relevant and resolved actions", () => {
    expect(availableActions("OpenActionsTooLong", { auditActionClosed: false })).toEqual(["openAuditTask"]);
    expect(availableActions("OpenActionsTooLong", { auditActionClosed: true })).toEqual([]);
    expect(availableActions("FindingAwaitingVerification", {})).toEqual(["openAuditTask"]);
    expect(availableActions("FlownWithNoGo", { canWrite: true })).toEqual(["reportIncident", "writeMissionExplanation"]);
    expect(availableActions("ExpiredCompetence", { competencyRelevant: true })).toEqual(["editCompetency"]);
    expect(availableActions("ExpiredCompetence", { competencyRelevant: false })).toEqual([]);
    expect(availableActions("CompetenceExpiringSoon", { competencyRelevant: true })).toEqual(["editCompetency"]);
    expect(availableActions("ExpiredDocument", { documentRelevant: true })).toEqual(["uploadDocumentVersion"]);
    expect(availableActions("DocumentReviewOverdue", { documentRelevant: false })).toEqual([]);
    expect(availableActions("MissingEmergencyPlan", { emergencyPlanMissing: true })).toEqual(["uploadEmergencyPlan"]);
    expect(availableActions("DroneStatusRed", { droneNeedsAttention: true })).toEqual(["openDroneMaintenance"]);
    expect(availableActions("DroneStatusYellow", { droneNeedsAttention: false })).toEqual([]);
  });
  test("all mutating actions are classified", () => {
    expect(ACTION_KIND.takeResponsibility).toBe("mutate");
    expect(ACTION_KIND.addIncidentComment).toBe("mutate");
    expect(ACTION_KIND.writeMissionExplanation).toBe("mutate");
    expect(ACTION_KIND.openRiskAssessment).toBe("open");
  });
});

describe("links and keys", () => {
  test("bulk finding keys are split per mission", () => {
    expect(parseFindingKeys("MissionWithoutFlightLog:mission:a, MissionWithoutFlightLog:mission:b").map((k) => k.entityId)).toEqual(["a", "b"]);
  });
  test("legacy action=noFlight is still accepted", () => {
    expect(normalizeActionParam("noFlight")).toBe("noFlight");
    expect(normalizeActionParam("deleteEverything")).toBeNull();
  });
  test("email link opens the app with action and msg, never an API", () => {
    expect(actionDeepLink({ code: "MissionPlannedPastDue", entityType: "mission", entityId: "m1" }, "notFlown", "x"))
      .toBe("/?msg=x&entity=mission&entityId=m1");
  });
  test("email parameters only open the inbox and never encode an executable action", () => {
    const rows = emailActionLinks("IncidentOpenTooLong:incident:i1", "x", "no");
    expect(rows[0]?.actions.every((a) => !a.path.includes("action=") && a.path.startsWith("/?msg=x"))).toBe(true);
  });
  test("mission code inferred from status", () => {
    expect(missionCodeForStatus("Pågående")).toBe("MissionInProgressStale");
    expect(missionCodeForStatus("Avbrutt")).toBeNull();
  });
});
