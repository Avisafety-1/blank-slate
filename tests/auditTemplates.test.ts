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
    expect(isAwaitingVerification("open", ["closed"])).toBe(false);
  });
});
