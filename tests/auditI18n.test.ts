import { describe, it, expect } from "bun:test";
import no from "../src/i18n/locales/no.json";
import en from "../src/i18n/locales/en.json";
import { AUDIT_ERROR_CODES, auditErrorMessage, parseAuditError } from "../src/components/admin/audit/lib/auditErrors";

const keys = (o: unknown, p = ""): string[] =>
  o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p];

describe("audit i18n", () => {
  const noKeys = new Set(keys((no as any).audit));
  const enKeys = new Set(keys((en as any).audit));
  it("every audit.* key in no.json exists in en.json", () => expect([...noKeys].filter((k) => !enKeys.has(k))).toEqual([]));
  it("every audit.* key in en.json exists in no.json", () => expect([...enKeys].filter((k) => !noKeys.has(k))).toEqual([]));
  it("every AUDIT_* code has a translation", () => {
    expect(AUDIT_ERROR_CODES.filter((c) => !noKeys.has(`errors.${c}`) || !enKeys.has(`errors.${c}`))).toEqual([]);
  });
});

describe("auditErrorMessage", () => {
  const t = (k: string, o?: Record<string, unknown>) => `${k}|${o?.count ?? ""}`;
  it("parses code with count", () => expect(parseAuditError("AUDIT_UNASSESSED_ITEMS:3: 3 punkter er ikke vurdert")).toEqual({ code: "AUDIT_UNASSESSED_ITEMS", count: 3 }));
  it("translates known code", () => expect(auditErrorMessage({ message: "AUDIT_ROOT_CAUSE_LOCKED: x" }, t)).toBe("audit.errors.AUDIT_ROOT_CAUSE_LOCKED|0"));
  it("passes count", () => expect(auditErrorMessage({ message: "AUDIT_MISSING_REASON:2: x" }, t)).toBe("audit.errors.AUDIT_MISSING_REASON|2"));
  it("unknown errors unchanged", () => expect(auditErrorMessage({ message: "network down" }, t)).toBe("network down"));
});
