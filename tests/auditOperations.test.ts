import { describe, expect, test } from "bun:test";
import {
  operationsCheckResults,
  soraEnvelopeIssue,
  staleActiveFlightIssue,
  staleMissionIssue,
} from "../src/components/admin/audit/lib/operationsAnalysis";

const now = new Date("2026-10-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe("hanging missions", () => {
  test("Planlagt more than 24h past end is a warning", () => {
    const i = staleMissionIssue({ id: "a", status: "Planlagt", tidspunkt: hoursAgo(25) }, now);
    expect(i?.code).toBe("missionPlannedPastDue");
    expect(i?.severity).toBe("warning");
  });
  test("Planlagt 23h past end is not flagged", () => {
    expect(staleMissionIssue({ id: "a", status: "Planlagt", tidspunkt: hoursAgo(23) }, now)).toBeNull();
  });
  test("Pågående more than 72h past end is critical, using slutt_tidspunkt first", () => {
    const i = staleMissionIssue(
      { id: "b", status: "Pågående", tidspunkt: hoursAgo(200), slutt_tidspunkt: hoursAgo(73) },
      now,
    );
    expect(i?.code).toBe("missionInProgressStale");
    expect(i?.severity).toBe("critical");
    expect(staleMissionIssue({ id: "b", status: "Pågående", tidspunkt: hoursAgo(200), slutt_tidspunkt: hoursAgo(71) }, now)).toBeNull();
  });
  test("active flight older than 12h is critical", () => {
    expect(staleActiveFlightIssue({ id: "f", start_time: hoursAgo(13) }, null, now)?.severity).toBe("critical");
    expect(staleActiveFlightIssue({ id: "f", start_time: hoursAgo(11) }, null, now)).toBeNull();
  });
});

describe("SORA envelope", () => {
  const dev = { used: true, deviations: ["Høyde over 120 m"] };
  test("critical when completed, warning otherwise", () => {
    expect(soraEnvelopeIssue({ id: "m", status: "Fullført" }, dev, "II", false)?.severity).toBe("critical");
    expect(soraEnvelopeIssue({ id: "m", status: "Planlagt" }, dev, "II", true)?.severity).toBe("critical");
    expect(soraEnvelopeIssue({ id: "m", status: "Planlagt" }, dev, "II", false)?.severity).toBe("warning");
  });
  test("no issue without deviations or when profile unused", () => {
    expect(soraEnvelopeIssue({ id: "m" }, { used: true, deviations: [] }, null, true)).toBeNull();
    expect(soraEnvelopeIssue({ id: "m" }, { used: false, deviations: ["x"] }, null, true)).toBeNull();
  });
});

describe("operations score", () => {
  test("a mission with several deviations fails once", () => {
    const r = operationsCheckResults(
      [
        { id: "1", missionId: "m", missionTitle: "", missionDate: null, code: "missionInProgressStale" },
        { id: "2", missionId: "m", missionTitle: "", missionDate: null, code: "flownWithNoGo" },
      ],
      4,
      false,
    );
    expect(r.filter((x) => x === "fail").length).toBe(1);
  });
  test("missing risk assessment only counts when required", () => {
    const issues = [{ id: "1", missionId: "m", missionTitle: "", missionDate: null, code: "missingRiskAssessment" as const }];
    expect(operationsCheckResults(issues, 2, false).includes("fail")).toBe(false);
    expect(operationsCheckResults(issues, 2, true).includes("fail")).toBe(true);
  });
  test("planned past due does not affect the score", () => {
    const issues = [{ id: "1", missionId: "m", missionTitle: "", missionDate: null, code: "missionPlannedPastDue" as const }];
    expect(operationsCheckResults(issues, 2, true).includes("fail")).toBe(false);
  });
});

import { incidentIssues, noGoApprovalState, droneStatusCheck } from "../src/components/admin/audit/lib/operationsAnalysis";

describe("flown with NO-GO", () => {
  const assessed = "2026-10-01T10:00:00Z";
  test("approved after the NO-GO assessment is OK", () => {
    expect(noGoApprovalState({ approval_status: "approved", approved_at: "2026-10-01T11:00:00Z" }, assessed)).toBe("approved");
  });
  test("approved before the NO-GO assessment is still a finding", () => {
    expect(noGoApprovalState({ approval_status: "approved", approved_at: "2026-09-30T11:00:00Z" }, assessed)).toBe("approvedBefore");
  });
  test("not approved is a finding", () => {
    expect(noGoApprovalState({ approval_status: "pending_approval", approved_at: null }, assessed)).toBe("notApproved");
  });
});

describe("incidents", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  test("open more than 30 days is warning, critical when high severity", () => {
    const base = { id: "i", status: "Åpen", opprettet_dato: "2026-09-01T00:00:00Z", oppfolgingsansvarlig_id: "p" };
    expect(incidentIssues({ ...base, alvorlighetsgrad: "Lav" }, now)[0]).toMatchObject({ code: "incidentOpenTooLong", severity: "warning" });
    expect(incidentIssues({ ...base, alvorlighetsgrad: "Høy" }, now)[0].severity).toBe("critical");
    expect(incidentIssues({ ...base, alvorlighetsgrad: "Kritisk" }, now)[0].severity).toBe("critical");
  });
  test("open without follow-up owner is a warning; closed incidents are ignored", () => {
    expect(incidentIssues({ id: "i", status: "Under behandling", opprettet_dato: "2026-10-09T00:00:00Z" }, now).map((x) => x.code)).toEqual(["incidentNoResponsible"]);
    expect(incidentIssues({ id: "i", status: "Lukket", opprettet_dato: "2026-01-01T00:00:00Z" }, now)).toEqual([]);
    expect(incidentIssues({ id: "i", status: "Ferdigbehandlet", opprettet_dato: "2026-01-01T00:00:00Z" }, now)).toEqual([]);
  });
});

describe("fleet score", () => {
  test("red fails, yellow warns, green passes", () => {
    expect(droneStatusCheck("Rød")).toBe("fail");
    expect(droneStatusCheck("Gul")).toBe("warn");
    expect(droneStatusCheck("Grønn")).toBe("pass");
  });
});

import { missionWithoutFlightLogIssue, groupMissingLogsByRecipient } from "../src/components/admin/audit/lib/operationsAnalysis";
import { matchPossibleLogs } from "../src/components/admin/audit/lib/missingFlightLogs";

describe("missions without flight log", () => {
  test("Fullført ended more than 48h ago without log is a warning", () => {
    const i = missionWithoutFlightLogIssue({ id: "m", status: "Fullført", tidspunkt: hoursAgo(49) }, false, now);
    expect(i?.code).toBe("missionWithoutFlightLog");
    expect(i?.severity).toBe("warning");
  });
  test("ended 47h ago is not flagged", () => {
    expect(missionWithoutFlightLogIssue({ id: "m", status: "Fullført", tidspunkt: hoursAgo(47) }, false, now)).toBeNull();
  });
  test("uses slutt_tidspunkt as end time", () => {
    expect(missionWithoutFlightLogIssue({ id: "m", status: "Fullført", tidspunkt: hoursAgo(100), slutt_tidspunkt: hoursAgo(10) }, false, now)).toBeNull();
  });
  test("Avbrutt never counts", () => {
    expect(missionWithoutFlightLogIssue({ id: "m", status: "Avbrutt", tidspunkt: hoursAgo(100) }, false, now)).toBeNull();
  });
  test("disappears once a flight log is linked", () => {
    expect(missionWithoutFlightLogIssue({ id: "m", status: "Fullført", tidspunkt: hoursAgo(100) }, true, now)).toBeNull();
  });
  test("counts as warn, not fail, in the operations score", () => {
    const r = operationsCheckResults([{ id: "1", missionId: "m", missionTitle: "", missionDate: null, code: "missionWithoutFlightLog" }], 3, false);
    expect(r.filter((x) => x === "warn").length).toBe(1);
    expect(r.includes("fail")).toBe(false);
  });
  test("bulk groups one message per pilot", () => {
    const g = groupMissingLogsByRecipient([
      { missionId: "a", recipientIds: ["p1", "p2"] },
      { missionId: "b", recipientIds: ["p1"] },
    ]);
    expect(g.get("p1")?.map((x) => x.missionId)).toEqual(["a", "b"]);
    expect(g.get("p2")?.length).toBe(1);
  });
  test("possible log matches same day and same drone or pilot only", () => {
    const missions = [{ id: "m", tidspunkt: "2026-10-01T10:00:00", droneIds: ["d1"], pilotIds: ["p1"] }];
    const hit = matchPossibleLogs(missions, [{ id: "l", flight_date: "2026-10-01", drone_id: "d1", user_id: null, flight_duration_minutes: 12 }]);
    expect(hit.get("m")?.id).toBe("l");
    const otherDay = matchPossibleLogs(missions, [{ id: "l", flight_date: "2026-10-02", drone_id: "d1", user_id: null, flight_duration_minutes: 12 }]);
    expect(otherDay.size).toBe(0);
    const noMatch = matchPossibleLogs(missions, [{ id: "l", flight_date: "2026-10-01", drone_id: "d9", user_id: "p9", flight_duration_minutes: 12 }]);
    expect(noMatch.size).toBe(0);
    const byPilot = matchPossibleLogs(missions, [{ id: "l", flight_date: "2026-10-01", drone_id: null, user_id: "p1", flight_duration_minutes: 12 }]);
    expect(byPilot.get("m")?.id).toBe("l");
  });
});

import { requiresRiskAssessment } from "../src/components/admin/audit/lib/operationsAnalysis";
import { operationsValidator } from "../src/components/admin/audit/validators/index";

describe("missing risk assessment scope", () => {
  test("only Fullført and Pågående missions", () => {
    expect(requiresRiskAssessment("Fullført")).toBe(true);
    expect(requiresRiskAssessment("Pågående")).toBe(true);
    expect(requiresRiskAssessment("Avbrutt")).toBe(false);
    expect(requiresRiskAssessment("Planlagt")).toBe(false);
  });
});

describe("stale active flight reminder target", () => {
  test("targets the flight, not the mission, so the pilot gets the reminder", () => {
    const issue = staleActiveFlightIssue({ id: "f1", mission_id: "m1", start_time: hoursAgo(13) } as any, "Oppdrag", now)!;
    const [f] = operationsValidator({ operations: [issue], requireSoraOnMissions: false } as any);
    expect(f.entityType).toBe("active_flight");
    expect(f.entityId).toBe("f1");
  });
});

import { reminderRowsFromMessages } from "../src/components/admin/audit/lib/operationsAnalysis";

describe("reminder delivery status", () => {
  test("message without recipient row is left out", () => {
    expect(reminderRowsFromMessages([{ finding_key: "k", status: "done", created_at: "2026-10-01", internal_message_recipients: [] }])).toEqual([]);
  });
  test("recipient row with status done counts as done", () => {
    const r = reminderRowsFromMessages([{ finding_key: "k", status: "unread", created_at: "2026-10-01", internal_message_recipients: [{ status: "done" }] }]);
    expect(r).toEqual([{ finding_key: "k", status: "done", created_at: "2026-10-01" }]);
  });
});
