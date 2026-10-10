import { describe, expect, test } from "bun:test";
import {
  actionDeepLink, availableActions, emailActionLinks, hasQuickActions, missionCodeForStatus,
  normalizeActionParam, parseFindingKeys,
} from "../supabase/functions/_shared/reminderActions";

describe("which codes have one-tap actions", () => {
  test.each([
    "MissionPlannedPastDue", "MissionInProgressStale", "ActiveFlightStale", "MissionWithoutFlightLog", "IncidentNoResponsible",
  ])("%s has quick actions", (c) => expect(hasQuickActions(c)).toBe(true));
  test.each(["IncidentOpenTooLong", "DocumentExpired", "CompetencyExpired", "InspectionOverdue"])(
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
    expect(availableActions("IncidentNoResponsible", { incidentResponsibleId: null })).toEqual(["takeResponsibility"]);
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
      .toBe("/oppdrag?mission=m1&action=notFlown&msg=x");
  });
  test("codes without quick actions produce no email buttons", () => {
    expect(emailActionLinks("DocumentExpired:document:d1", "x", "no")).toEqual([]);
  });
  test("mission code inferred from status", () => {
    expect(missionCodeForStatus("Pågående")).toBe("MissionInProgressStale");
    expect(missionCodeForStatus("Avbrutt")).toBeNull();
  });
});
