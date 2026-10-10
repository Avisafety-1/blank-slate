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
