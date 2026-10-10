import { describe, it, expect } from "bun:test";
import { selectMyAuditTasks, sortAuditTasks, deadlineTone, type AuditTask } from "../src/components/admin/audit/lib/auditTasks";

const U = "u1";
const f = (id: string, o: Partial<Parameters<typeof selectMyAuditTasks>[0][number]> = {}) => ({
  id, description: id, severity: "warning" as const, deadline: null, status: "open", responsible_user_id: U, reviewTitle: "R", ...o,
});
const a = (id: string, o: Partial<Parameters<typeof selectMyAuditTasks>[1][number]> = {}) => ({
  id, finding_id: "fx", description: id, deadline: null, status: "open", responsible_user_id: U,
  findingSeverity: "warning" as const, findingStatus: "open", reviewTitle: "R", ...o,
});

describe("selectMyAuditTasks", () => {
  it("includes open and in-progress findings I am responsible for", () => {
    const r = selectMyAuditTasks([f("a"), f("b", { status: "in_progress" })], [], U);
    expect(r.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });
  it("excludes verified/closed findings and other people's findings", () => {
    const r = selectMyAuditTasks([f("v", { status: "verified" }), f("c", { status: "closed" }), f("o", { responsible_user_id: "x" })], [], U);
    expect(r).toEqual([]);
  });
  it("includes my open actions, excludes closed actions and actions on verified findings", () => {
    const r = selectMyAuditTasks([], [a("open"), a("closed", { status: "closed" }), a("onVerified", { findingStatus: "verified" }), a("other", { responsible_user_id: "x" })], U);
    expect(r.map((x) => x.id)).toEqual(["open"]);
    expect(r[0].kind).toBe("action");
    expect(r[0].findingId).toBe("fx");
  });
});

describe("sortAuditTasks", () => {
  const t = (id: string, severity: AuditTask["severity"], deadline: string | null): AuditTask =>
    ({ kind: "finding", id, findingId: id, description: id, severity, deadline, reviewTitle: null });
  it("overdue first, then Level 1, then deadline, no deadline last", () => {
    const r = sortAuditTasks([
      t("noDl", "warning", null), t("lvl2late", "warning", "2026-12-01"), t("lvl1", "critical", "2026-12-31"),
      t("overdueInfo", "info", "2026-10-01"), t("lvl2soon", "warning", "2026-10-20"),
    ], "2026-10-10");
    expect(r.map((x) => x.id)).toEqual(["overdueInfo", "lvl1", "lvl2soon", "lvl2late", "noDl"]);
  });
});

describe("deadlineTone", () => {
  const today = "2026-10-10";
  it("red when passed", () => expect(deadlineTone("2026-10-09", today)).toBe("overdue"));
  it("yellow today", () => expect(deadlineTone("2026-10-10", today)).toBe("soon"));
  it("yellow at 7 days", () => expect(deadlineTone("2026-10-17", today)).toBe("soon"));
  it("normal at 8 days", () => expect(deadlineTone("2026-10-18", today)).toBe("normal"));
  it("normal without deadline", () => expect(deadlineTone(null, today)).toBe("normal"));
});
