import { describe, expect, test } from "bun:test";
import { airworthyFleet, flightLogCoverage, formatShare, nextInternalAudit } from "../src/components/admin/audit/lib/overviewMetrics";

const now = new Date(2026, 9, 10, 12);
const closed = (monthsAgo: number, unit = "c1") => ({
  review_type: "internal", audited_company_id: unit, status: "closed", review_date: null,
  closed_at: new Date(2026, 9 - monthsAgo, 10, 9).toISOString(),
});

describe("next internal audit", () => {
  test("none closed → red, no date", () => {
    const r = nextInternalAudit([], "c1", now);
    expect(r.due).toBeNull(); expect(r.tone).toBe("danger");
  });
  test("closed 11 months ago → ~1 month left, neutral", () => {
    const r = nextInternalAudit([closed(11)], "c1", now);
    expect(r.daysLeft).toBe(30); expect(r.tone).toBe("warning");
  });
  test("closed 10 months ago → neutral", () => {
    expect(nextInternalAudit([closed(10)], "c1", now).tone).toBe("neutral");
  });
  test("closed 13 months ago → overdue, red", () => {
    const r = nextInternalAudit([closed(13)], "c1", now);
    expect(r.daysLeft!).toBeLessThan(0); expect(r.tone).toBe("danger");
  });
  test("other unit's audits are ignored", () => {
    expect(nextInternalAudit([closed(1, "c2")], "c1", now).due).toBeNull();
  });
  test("planned audit is shown", () => {
    const r = nextInternalAudit([closed(13), { review_type: "internal", audited_company_id: "c1", status: "planned", closed_at: null, review_date: "2026-11-01" }], "c1", now);
    expect(r.planned?.getDate()).toBe(1); expect(r.planned?.getMonth()).toBe(10);
  });
});

describe("airworthy fleet", () => {
  test("8 of 10 → 80 %, yellow", () => {
    const r = airworthyFleet([...Array(8).fill({ status: "Grønn" }), { status: "Gul" }, { status: "Rød" }]);
    expect(formatShare(r, "av")).toBe("8 av 10 (80 %)"); expect(r.tone).toBe("warning");
  });
  test("below 80 % red, 100 % neutral", () => {
    expect(airworthyFleet([{ status: "Grønn" }, { status: "Rød" }]).tone).toBe("danger");
    expect(airworthyFleet([{ status: "Grønn" }]).tone).toBe("neutral");
  });
  test("0 drones → –", () => {
    const r = airworthyFleet([]);
    expect(r.pct).toBeNull(); expect(formatShare(r, "av")).toBe("–");
  });
});

describe("flight log coverage", () => {
  test("45 of 50 → 90 %, yellow", () => {
    const r = flightLogCoverage(50, 5);
    expect(formatShare(r, "av")).toBe("45 av 50 (90 %)"); expect(r.tone).toBe("warning");
  });
  test("<80 % red, ≥95 % neutral", () => {
    expect(flightLogCoverage(10, 3).tone).toBe("danger");
    expect(flightLogCoverage(20, 1).tone).toBe("neutral");
  });
  test("0 missions → –", () => expect(formatShare(flightLogCoverage(0, 0), "av")).toBe("–"));
});
