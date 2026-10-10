import { describe, expect, test } from "bun:test";
import { airworthyFleet, flightLogCoverage, auditProgramme, formatShare } from "../src/components/admin/audit/lib/overviewMetrics";

const now = new Date(2026, 9, 10, 12);
const closed = (monthsAgo: number, unit = "c1") => ({
  review_type: "internal", audited_company_id: unit, status: "closed", review_date: null,
  closed_at: new Date(2026, 9 - monthsAgo, 10, 9).toISOString(),
});

const units = [{ id: "c1", name: "Mor" }, { id: "c2", name: "Avd" }];
const rev = (o: Partial<any>) => ({ id: "r", title: "T", template_key: "open", review_type: "internal", audited_company_id: "c1", status: "planned", closed_at: null, review_date: "2026-11-01", ...o });
const closedAgo = (unit: string, y: number, m: number, d: number) => rev({ id: `x${unit}${m}${d}`, audited_company_id: unit, status: "closed", closed_at: new Date(y, m, d, 9).toISOString() });

describe("audit programme", () => {
  test("sorted by date, in progress first on ties", () => {
    const p = auditProgramme([rev({ id: "a", review_date: "2026-12-01" }), rev({ id: "b" }), rev({ id: "c", status: "in_progress" })], units, now);
    expect(p.upcoming.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
  test("planned with past date is overdue; in progress never", () => {
    const p = auditProgramme([rev({ id: "a", review_date: "2026-09-01" }), rev({ id: "b", status: "in_progress", review_date: "2026-09-01" })], units, now);
    expect(p.upcoming.find((r) => r.id === "a")!.overdue).toBe(true);
    expect(p.upcoming.find((r) => r.id === "b")!.overdue).toBe(false);
  });
  test("coverage: none → red, organisation-wide", () => {
    const p = auditProgramme([], units, now);
    expect(p.coverage).toEqual({ tone: "danger" });
    expect(p.lastClosed).toBeNull();
  });
  test("coverage: closed 11.5 months ago → yellow", () => {
    expect(auditProgramme([closedAgo("c1", 2025, 9, 25)], units, now).coverage?.tone).toBe("warning");
  });
  test("coverage: closed 13 months ago → red", () => {
    expect(auditProgramme([closedAgo("c1", 2025, 8, 10)], units, now).coverage?.tone).toBe("danger");
  });
  test("coverage: closed 6 months ago or upcoming → no warning", () => {
    expect(auditProgramme([closedAgo("c1", 2026, 3, 10)], units, now).coverage).toBeNull();
    expect(auditProgramme([rev({})], units, now).coverage).toBeNull();
  });
  test("coverage: an audit of one department covers the whole organisation", () => {
    const p = auditProgramme([closedAgo("c2", 2026, 3, 10)], units, now);
    expect(p.coverage).toBeNull();
    expect(p.lastClosed?.unitName).toBe("Avd");
  });
  test("coverage: never per-department warnings", () => {
    // c2 audited recently, c1 never → still no warning (org covered by c2)
    const p = auditProgramme([closedAgo("c2", 2026, 8, 10)], units, now, "c1");
    expect(p.coverage).toBeNull();
    expect(p.lastClosed?.unitName).toBe("Avd");
  });
  test("upcoming filters by selected department, coverage stays org-wide", () => {
    const p = auditProgramme([rev({ id: "a" }), rev({ id: "b", audited_company_id: "c2" })], units, now, "c2");
    expect(p.upcoming.map((r) => r.id)).toEqual(["b"]);
    expect(p.coverage).toBeNull(); // c1's planned audit covers the org
  });
  test("external reviews never count", () => {
    const p = auditProgramme([rev({ id: "z", review_type: "external" })], units, now);
    expect(p.upcoming).toEqual([]);
    expect(p.coverage?.tone).toBe("danger");
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
