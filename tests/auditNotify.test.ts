import { describe, expect, test } from "bun:test";
import {
  auditFindingKey, auditTaskLink, buildAuditMessage, deadlineEvent, deadlineTargets, eventMatchesState,
  getAuditReminderConfig, recipientsFor, type AuditState,
} from "../supabase/functions/_shared/auditNotify";
import { emailActionLinks, hasQuickActions } from "../supabase/functions/_shared/reminderActions";
import { auditDeepLink } from "../src/components/admin/audit/utils/auditDeepLink";

const cfg = getAuditReminderConfig();
const TODAY = "2026-10-10";
const base = (over: Partial<AuditState["finding"]> = {}, actions: AuditState["actions"] = []): AuditState => ({
  finding: { id: "f1", status: "open", severity: "warning", responsible_user_id: "resp", deadline: null, description: "Mangler logg", company_id: "c1", ...over },
  actions, reviewTitle: "Revisjon 2026", reviewResponsibleId: "lead", ownerAdminIds: ["admin1", "admin2", "lead"],
});

describe("deadline windows (default config)", () => {
  test("7, 3 and 0 days left → soon", () => {
    expect(deadlineEvent("2026-10-17", TODAY, cfg)).toBe("deadline_soon");
    expect(deadlineEvent("2026-10-13", TODAY, cfg)).toBe("deadline_soon");
    expect(deadlineEvent("2026-10-10", TODAY, cfg)).toBe("deadline_soon");
  });
  test("yesterday and 10 days ago → overdue", () => {
    expect(deadlineEvent("2026-10-09", TODAY, cfg)).toBe("deadline_overdue");
    expect(deadlineEvent("2026-09-30", TODAY, cfg)).toBe("deadline_overdue");
  });
  test("8 days left → nothing", () => {
    expect(deadlineEvent("2026-10-18", TODAY, cfg)).toBeNull();
  });
});

describe("recipients", () => {
  test("actor is never notified", () => {
    expect(recipientsFor("assigned", base({ responsible_user_id: "me" }), "me")).toEqual([]);
  });
  test("ready for verification goes to review lead and owner admins, de-duplicated, without actor", () => {
    expect(recipientsFor("ready_for_verification", base(), "admin2").sort()).toEqual(["admin1", "lead"]);
  });
  test("verified notifies finding and action owners", () => {
    const s = base({ status: "verified" }, [{ id: "a1", status: "closed", responsible_user_id: "x", deadline: null }]);
    expect(recipientsFor("verified", s, "lead").sort()).toEqual(["resp", "x"]);
  });
  test("ready_for_verification requires ≥1 action and all closed", () => {
    expect(eventMatchesState("ready_for_verification", base())).toBe(false);
    expect(eventMatchesState("ready_for_verification", base({}, [{ id: "a", status: "closed", responsible_user_id: null, deadline: null }]))).toBe(true);
    expect(eventMatchesState("ready_for_verification", base({}, [{ id: "a", status: "open", responsible_user_id: null, deadline: null }]))).toBe(false);
  });
});

describe("deadline targets avoid double notification", () => {
  test("same deadline and owner on finding + action → only the action reminder", () => {
    const s = base({ deadline: "2026-10-13" }, [{ id: "a1", status: "open", responsible_user_id: "resp", deadline: "2026-10-13" }]);
    expect(deadlineTargets(s, TODAY, cfg)).toEqual([{ kind: "deadline_soon", actionId: "a1", recipients: ["resp"] }]);
  });
  test("finding without open actions gets its own reminder", () => {
    expect(deadlineTargets(base({ deadline: "2026-10-13" }), TODAY, cfg)).toEqual([{ kind: "deadline_soon", actionId: null, recipients: ["resp"] }]);
  });
  test("overdue Level 1 finding always notifies the review lead", () => {
    const s = base({ severity: "critical", deadline: "2026-10-01" }, [{ id: "a1", status: "open", responsible_user_id: "x", deadline: "2026-12-01" }]);
    expect(deadlineTargets(s, TODAY, cfg)).toEqual([{ kind: "deadline_overdue", actionId: null, recipients: ["lead"] }]);
  });
});

describe("message text", () => {
  const ctx = { reviewTitle: "Revisjon 2026", description: "Mangler logg", severity: "critical" as const, deadline: "2026-10-17", isAction: false };
  test("nb", () => {
    const m = buildAuditMessage("deadline_soon", ctx, "no");
    expect(m.subject).toBe("Frist nærmer seg for revisjonspunkt");
    expect(m.body).toContain("Nivå: Nivå 1");
    expect(m.body).toContain("Frist: 17.10.2026");
  });
  test("en", () => {
    const m = buildAuditMessage("deadline_soon", { ...ctx, severity: "info" }, "en");
    expect(m.subject).toBe("Audit item deadline approaching");
    expect(m.body).toContain("Level: Observation");
  });
});

describe("links and reminder actions", () => {
  test("task link matches the app deep link", () => {
    expect(auditTaskLink("f1")).toBe(auditDeepLink("audit_finding", "f1").path);
  });
  test("Audit* codes only get 'Open' — no quick actions", () => {
    for (const k of ["assigned", "ready_for_verification", "verified", "deadline_soon", "deadline_overdue"] as const) {
      const key = auditFindingKey(k, "audit_action", "a1");
      expect(hasQuickActions(key.split(":")[0])).toBe(false);
      expect(emailActionLinks(key, "m1", "no")).toEqual([]);
    }
  });
});
