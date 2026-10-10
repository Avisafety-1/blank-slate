import { describe, expect, test } from "bun:test";
import { AUDIT_TEMPLATES, AUDIT_TEMPLATE_KEYS, computeSectionStatus, isAwaitingVerification } from "../src/components/admin/audit/lib/auditTemplates";

describe("auditTemplates", () => {
  test("item keys are unique within each template", () => {
    for (const k of AUDIT_TEMPLATE_KEYS) {
      const keys = AUDIT_TEMPLATES[k].flatMap((s) => s.items.map((i) => i.key));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
  test("luc contains every specific section", () => {
    const luc = AUDIT_TEMPLATES.luc;
    for (const s of AUDIT_TEMPLATES.specific) {
      const match = luc.find((l) => l.key === s.key);
      expect(match?.items.map((i) => i.key)).toEqual(s.items.map((i) => i.key));
    }
    expect(luc.some((s) => s.key === "luc_sms")).toBe(true);
  });
  test("section status", () => {
    expect(computeSectionStatus(["pass", "fail", "warn"])).toBe("danger");
    expect(computeSectionStatus(["pass", "warn"])).toBe("warning");
    expect(computeSectionStatus(["pass", "na"])).toBe("ok");
    expect(computeSectionStatus(["pass", "unknown"])).toBe("info");
  });
  test("awaiting verification requires actions that are all closed", () => {
    expect(isAwaitingVerification("in_progress", [])).toBe(false);
    expect(isAwaitingVerification("in_progress", ["closed", "open"])).toBe(false);
    expect(isAwaitingVerification("in_progress", ["closed", "closed"])).toBe(true);
    expect(isAwaitingVerification("open", ["closed"])).toBe(true);
    expect(isAwaitingVerification("open", [])).toBe(false);
    expect(isAwaitingVerification("open", ["closed", "open"])).toBe(false);
    expect(isAwaitingVerification("verified", ["closed"])).toBe(false);
  });
});

import { suggestDeadline, findingDisplayStatus, closeBlockers, onlyCriticalBlocks, defaultSeverityForResult } from "../src/components/admin/audit/lib/auditTemplates";

describe("audit round A rules", () => {
  const today = new Date(2026, 9, 10);
  test("deadline suggestion per level", () => {
    expect(suggestDeadline("critical", today)).toBe("2026-10-17");
    expect(suggestDeadline("warning", today)).toBe("2026-12-09");
    expect(suggestDeadline("info", today)).toBeNull();
  });
  test("default level from result", () => {
    expect(defaultSeverityForResult("fail")).toBe("warning");
    expect(defaultSeverityForResult("warn")).toBe("info");
  });
  test("ready for verification is derived", () => {
    expect(findingDisplayStatus("in_progress", [])).toBe("in_progress");
    expect(findingDisplayStatus("in_progress", ["closed", "open"])).toBe("in_progress");
    expect(findingDisplayStatus("in_progress", ["closed", "closed"])).toBe("ready");
    expect(findingDisplayStatus("open", ["closed"])).toBe("ready");
    expect(findingDisplayStatus("open", [])).toBe("open");
    expect(findingDisplayStatus("closed", [])).toBe("verified");
  });
  test("close blockers", () => {
    const b = closeBlockers(
      [
        { id: "a", result: "unknown", comment: null },
        { id: "b", result: "fail", comment: " " },
        { id: "c", result: "warn", comment: "ok grunn" },
        { id: "d", result: "pass", comment: null },
      ],
      [
        { id: "f1", severity: "critical", status: "open" },
        { id: "f2", severity: "critical", status: "verified" },
        { id: "f3", severity: "warning", status: "open" },
      ],
    );
    expect(b).toEqual([
      { kind: "unassessed", itemId: "a" },
      { kind: "missingReason", itemId: "b" },
      { kind: "openCritical", findingId: "f1" },
    ]);
    expect(onlyCriticalBlocks(b)).toBe(false);
    expect(onlyCriticalBlocks([{ kind: "openCritical", findingId: "f1" }])).toBe(true);
    expect(onlyCriticalBlocks([])).toBe(false);
  });
});
