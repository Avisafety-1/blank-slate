import { describe, it, expect } from "vitest";
import { auditDeepLink, noFlightDeepLink } from "../src/components/admin/audit/utils/auditDeepLink";

describe("audit reminder links", () => {
  it("mission links open the mission card via ?mission=", () => {
    expect(auditDeepLink("mission", "abc").path).toBe("/oppdrag?mission=abc");
  });
  it("no-flight reminder uses ?mission= with action=noFlight", () => {
    expect(noFlightDeepLink("abc")).toBe("/oppdrag?mission=abc&action=noFlight");
  });
});
