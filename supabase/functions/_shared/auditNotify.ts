/**
 * Internal audit notifications — pure logic shared by audit-notify, audit-deadline-reminders and the app tests.
 * Recipients are always derived from database state (never from the client), and every
 * (finding, action, kind, recipient) is sent once, enforced by public.audit_notification_log.
 */

export type AuditEventKind =
  | "assigned"
  | "ready_for_verification"
  | "verified"
  | "deadline_soon"
  | "deadline_overdue";

export type AuditSeverity = "critical" | "warning" | "info";

export interface AuditReminderConfig { soonDays: number; overdueAfterDays: number }

/** Single source for deadline windows. Per-company overrides can be added here later. */
export function getAuditReminderConfig(_companyId?: string | null): AuditReminderConfig {
  return { soonDays: 7, overdueAfterDays: 1 };
}

const DAY = 86_400_000;
const toUtc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const daysBetween = (fromIso: string, toIso: string) => Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY);

/** deadline_soon: 0 ≤ (deadline − today) ≤ soonDays; deadline_overdue: (today − deadline) ≥ overdueAfterDays. */
export function deadlineEvent(
  deadline: string | null | undefined,
  today: string,
  cfg: AuditReminderConfig,
): "deadline_soon" | "deadline_overdue" | null {
  if (!deadline) return null;
  const left = daysBetween(today, deadline);
  if (left >= 0 && left <= cfg.soonDays) return "deadline_soon";
  if (-left >= cfg.overdueAfterDays) return "deadline_overdue";
  return null;
}

export interface AuditActionState {
  id: string; status: string; responsible_user_id: string | null; deadline: string | null; description?: string;
}
export interface AuditFindingState {
  id: string; status: string; severity: AuditSeverity; responsible_user_id: string | null;
  deadline: string | null; description: string; company_id: string;
}
export interface AuditState {
  finding: AuditFindingState;
  actions: AuditActionState[];
  reviewTitle: string | null;
  reviewResponsibleId: string | null;
  /** Administrators in the company that owns the review. */
  ownerAdminIds: string[];
}

export interface AuditEventTarget { actionId?: string | null }

/** Recipients for an event, from state. The actor is always excluded; result is de-duplicated. */
export function recipientsFor(
  kind: AuditEventKind,
  state: AuditState,
  actorId: string | null,
  target: AuditEventTarget = {},
): string[] {
  const action = target.actionId ? state.actions.find((a) => a.id === target.actionId) : undefined;
  const ids: (string | null)[] = [];
  switch (kind) {
    case "assigned":
      ids.push(action ? action.responsible_user_id : state.finding.responsible_user_id);
      break;
    case "ready_for_verification":
      ids.push(state.reviewResponsibleId, ...state.ownerAdminIds);
      break;
    case "verified":
      ids.push(state.finding.responsible_user_id, ...state.actions.map((a) => a.responsible_user_id));
      break;
    case "deadline_soon":
      ids.push(action ? action.responsible_user_id : state.finding.responsible_user_id);
      break;
    case "deadline_overdue":
      if (action) ids.push(action.responsible_user_id);
      else {
        ids.push(state.finding.responsible_user_id);
        if (state.finding.severity === "critical") ids.push(state.reviewResponsibleId);
      }
      break;
  }
  return [...new Set(ids.filter((x): x is string => !!x && x !== actorId))];
}

/** Does the current state still match the event? (Protects against stale or forged calls.) */
export function eventMatchesState(kind: AuditEventKind, state: AuditState, target: AuditEventTarget = {}): boolean {
  const action = target.actionId ? state.actions.find((a) => a.id === target.actionId) : undefined;
  if (target.actionId && !action) return false;
  switch (kind) {
    case "assigned":
      return !!(action ? action.responsible_user_id : state.finding.responsible_user_id);
    case "ready_for_verification":
      return ["open", "in_progress"].includes(state.finding.status) &&
        state.actions.length > 0 && state.actions.every((a) => a.status === "closed");
    case "verified":
      return state.finding.status === "verified";
    default:
      return false;
  }
}

export interface DeadlineTarget {
  kind: "deadline_soon" | "deadline_overdue";
  actionId: string | null;
  recipients: string[];
}

/**
 * Deadline reminders without double notification: the finding itself only when it has no open
 * actions (no action plan); otherwise one per open action. Exception: an overdue Level 1 finding
 * always notifies the review's responsible once.
 */
export function deadlineTargets(state: AuditState, today: string, cfg: AuditReminderConfig): DeadlineTarget[] {
  const f = state.finding;
  if (!["open", "in_progress"].includes(f.status)) return [];
  const out: DeadlineTarget[] = [];
  const open = state.actions.filter((a) => a.status !== "closed");
  for (const a of open) {
    const k = deadlineEvent(a.deadline, today, cfg);
    if (!k) continue;
    const r = recipientsFor(k, state, null, { actionId: a.id });
    if (r.length) out.push({ kind: k, actionId: a.id, recipients: r });
  }
  const fk = deadlineEvent(f.deadline, today, cfg);
  if (fk) {
    if (open.length === 0) {
      const r = recipientsFor(fk, state, null);
      if (r.length) out.push({ kind: fk, actionId: null, recipients: r });
    } else if (fk === "deadline_overdue" && f.severity === "critical" && state.reviewResponsibleId) {
      out.push({ kind: fk, actionId: null, recipients: [state.reviewResponsibleId] });
    }
  }
  return out;
}

export type AuditLang = "no" | "en";
export const auditLang = (l: string | null | undefined): AuditLang => (l?.startsWith("en") ? "en" : "no");

const LEVEL: Record<AuditLang, Record<AuditSeverity, string>> = {
  no: { critical: "Nivå 1", warning: "Nivå 2", info: "Observasjon" },
  en: { critical: "Level 1", warning: "Level 2", info: "Observation" },
};

const SUBJECT: Record<AuditLang, Record<AuditEventKind, string>> = {
  no: {
    assigned: "Du er ansvarlig for et revisjonspunkt",
    ready_for_verification: "Revisjonsfunn klart for verifisering",
    verified: "Revisjonsfunn er verifisert",
    deadline_soon: "Frist nærmer seg for revisjonspunkt",
    deadline_overdue: "Frist passert for revisjonspunkt",
  },
  en: {
    assigned: "You are responsible for an audit item",
    ready_for_verification: "Audit finding ready for verification",
    verified: "Audit finding verified",
    deadline_soon: "Audit item deadline approaching",
    deadline_overdue: "Audit item deadline passed",
  },
};

export interface AuditMessageCtx {
  reviewTitle: string | null;
  description: string;
  severity: AuditSeverity;
  deadline: string | null;
  isAction: boolean;
}

const short = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const fmtDate = (iso: string | null) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : null);

export function buildAuditMessage(kind: AuditEventKind, ctx: AuditMessageCtx, lang: AuditLang) {
  const L = lang === "en"
    ? { review: "Audit", item: ctx.isAction ? "Action" : "Finding", level: "Level", deadline: "Deadline", none: "none" }
    : { review: "Revisjon", item: ctx.isAction ? "Tiltak" : "Funn", level: "Nivå", deadline: "Frist", none: "ingen" };
  const body = [
    `${L.review}: ${ctx.reviewTitle ?? "—"}`,
    `${L.item}: ${short(ctx.description)}`,
    `${L.level}: ${LEVEL[lang][ctx.severity]}`,
    `${L.deadline}: ${fmtDate(ctx.deadline) ?? L.none}`,
  ].join("\n");
  return { subject: SUBJECT[lang][kind], body };
}

const CODE: Record<AuditEventKind, string> = {
  assigned: "AuditAssigned",
  ready_for_verification: "AuditReadyForVerification",
  verified: "AuditVerified",
  deadline_soon: "AuditDeadlineSoon",
  deadline_overdue: "AuditDeadlineOverdue",
};

/** finding_key for internal_messages, e.g. "AuditDeadlineSoon:audit_action:<id>". No quick actions — only "Open". */
export function auditFindingKey(kind: AuditEventKind, entity: "audit_finding" | "audit_action", id: string) {
  return `${CODE[kind]}:${entity}:${id}`;
}

/** Same format as the app's auditDeepLink("audit_finding", id). */
export const auditTaskLink = (findingId: string) => `/?auditFinding=${findingId}`;

export const severityForEvent = (kind: AuditEventKind, sev: AuditSeverity): AuditSeverity =>
  kind === "deadline_overdue" ? "critical" : kind === "deadline_soon" ? "warning" : sev === "critical" ? "warning" : "info";
