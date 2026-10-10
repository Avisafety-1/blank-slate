import { describe, expect, test } from "bun:test";
import {
  buildFollowUp, filterInputsByDepartment, followUpRate, sortActionItems, type ViewInputs,
} from "../src/components/admin/audit/lib/complianceView";
import type { ScannerFinding } from "../src/components/admin/audit/types";

const now = new Date("2026-10-10T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const f = (id: string, severity: ScannerFinding["severity"] = "critical"): ScannerFinding => ({
  code: "DroneStatusRed", severity, categoryKey: "fleet", titleKey: "", entityType: "drone", entityId: id,
});
const empty = { reminders: [], dispositions: [], registered: [] };

describe("follow-up (oppfølgingsgrad)", () => {
  test("reminder sent within 14 days counts as handled", () => {
    const s = buildFollowUp({ ...empty, reminders: [{ finding_key: "DroneStatusRed:drone:a", status: "unread", created_at: daysAgo(13) }] }, now);
    expect(s(f("a")).handled).toBe(true);
  });
  test("reminder older than 14 days does not count", () => {
    const s = buildFollowUp({ ...empty, reminders: [{ finding_key: "DroneStatusRed:drone:a", status: "unread", created_at: daysAgo(15) }] }, now);
    expect(s(f("a")).handled).toBe(false);
  });
  test("reminder unanswered for more than 7 days is 'no response'", () => {
    const s = buildFollowUp({ ...empty, reminders: [{ finding_key: "DroneStatusRed:drone:a", status: "unread", created_at: daysAgo(8) }] }, now);
    expect(s(f("a")).reminder).toBe("noResponse");
  });
  test("reminder 6 days old is 'waiting'", () => {
    const s = buildFollowUp({ ...empty, reminders: [{ finding_key: "DroneStatusRed:drone:a", status: "unread", created_at: daysAgo(6) }] }, now);
    expect(s(f("a")).reminder).toBe("waiting");
  });
  test("accepted only counts with a reason", () => {
    const d = (reason: string | null) => [{ finding_code: "DroneStatusRed", entity_type: "drone", entity_id: "a", disposition: "accepted", reason, snooze_until: null }];
    expect(buildFollowUp({ ...empty, dispositions: d("ok") }, now)(f("a")).handled).toBe(true);
    expect(buildFollowUp({ ...empty, dispositions: d(null) }, now)(f("a")).handled).toBe(false);
  });
  test("audit finding needs responsible and deadline", () => {
    const r = (responsible: string | null) => [{ source_scanner_code: "DroneStatusRed:drone:a", responsible_user_id: responsible, deadline: "2026-11-01" }];
    expect(buildFollowUp({ ...empty, registered: r("u") }, now)(f("a")).handled).toBe(true);
    expect(buildFollowUp({ ...empty, registered: r(null) }, now)(f("a")).handled).toBe(false);
  });
  test("rate ignores info findings", () => {
    const s = buildFollowUp({ ...empty, reminders: [{ finding_key: "DroneStatusRed:drone:a", status: "unread", created_at: daysAgo(1) }] }, now);
    expect(followUpRate([f("a"), f("b", "warning"), f("c", "info")], s)).toBe(50);
  });
});

describe("action list order", () => {
  test("untreated criticals come before handled criticals", () => {
    const ctx = { companyId: null, responsible: null, ageDays: 1 };
    const items = sortActionItems([
      { finding: f("w", "warning"), ctx, follow: { handled: false, reminder: "none" as const, reminderSentAt: null } },
      { finding: f("h"), ctx, follow: { handled: true, reminder: "waiting" as const, reminderSentAt: null } },
      { finding: f("u"), ctx, follow: { handled: false, reminder: "none" as const, reminderSentAt: null } },
    ]);
    expect(items.map((i) => i.finding.entityId)).toEqual(["u", "h", "w"]);
  });
});

describe("department filter", () => {
  test("keeps only rows for the selected department", () => {
    const inputs = {
      competencies: [], documents: [], operations: [], findingsAwaitingVerification: [],
      fleet: [{ id: "a", companyId: "A" }, { id: "b", companyId: "B" }] as any,
      operationsTotal: 5, missionsByCompany: { A: 2, B: 3 }, safety: null,
      overdueAuditActions: [{ id: "x", description: "", deadline: null, companyId: "B" }],
    } as ViewInputs;
    const r = filterInputsByDepartment(inputs, "A");
    expect(r.fleet.map((x) => x.id)).toEqual(["a"]);
    expect(r.operationsTotal).toBe(2);
    expect(r.overdueAuditActions.length).toBe(0);
    expect(filterInputsByDepartment(inputs, null)).toBe(inputs);
  });
});
