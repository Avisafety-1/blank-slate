import { describe, it, expect } from "bun:test";
import { auditDeepLink, noFlightDeepLink } from "../src/components/admin/audit/utils/auditDeepLink";

describe("audit reminder links", () => {
  it("mission links open the mission card via ?mission=", () => {
    expect(auditDeepLink("mission", "abc").path).toBe("/oppdrag?mission=abc");
  });
  it("no-flight reminder uses ?mission= with action=noFlight", () => {
    expect(noFlightDeepLink("abc")).toBe("/oppdrag?mission=abc&action=noFlight");
  });
});

describe("audit task links", () => {
  it("findings and actions open AuditTaskDialog via ?auditFinding=", () => {
    expect(auditDeepLink("audit_finding", "f1").path).toBe("/?auditFinding=f1");
    expect(auditDeepLink("audit_action", "f1").path).toBe("/?auditFinding=f1");
  });
});
