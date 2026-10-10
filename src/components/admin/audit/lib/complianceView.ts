// Presentation helpers for the compliance overview (no I/O, no scoring rules).
// Department filtering, finding enrichment and "Oppfølgingsgrad" (follow-up rate).
import type {
  CompetencyRow,
  DocumentRow,
  FleetRow,
  OperationsIssue,
  SafetyAggregate,
  ScannerFinding,
} from "../types";
import { splitFindingKeys } from "./operationsAnalysis";

export const ALL_DEPARTMENTS = "all";

export interface ViewInputs {
  competencies: CompetencyRow[];
  documents: DocumentRow[];
  fleet: FleetRow[];
  operations: OperationsIssue[];
  operationsTotal: number;
  missionsByCompany?: Record<string, number>;
  safety: SafetyAggregate | null;
  overdueAuditActions: { id: string; description: string; deadline: string | null; companyId?: string | null }[];
  findingsAwaitingVerification: { id: string; description: string; status?: string; actionStatuses?: string[] }[];
}

/** Keep only rows belonging to one department. `null`/"all" returns the inputs unchanged. */
export function filterInputsByDepartment(inputs: ViewInputs, dept: string | null | undefined): ViewInputs {
  if (!dept || dept === ALL_DEPARTMENTS) return inputs;
  const is = (c: string | null | undefined) => c === dept;
  const safety = inputs.safety
    ? {
        ...inputs.safety,
        incidentIssues: inputs.safety.incidentIssues.filter((i) => is(i.companyId)),
        openIncidents: inputs.safety.byCompany?.[dept]?.open ?? 0,
        closedIncidents: inputs.safety.byCompany?.[dept]?.closed ?? 0,
      }
    : null;
  return {
    competencies: inputs.competencies.filter((c) => is(c.companyId)),
    documents: inputs.documents.filter((d) => is(d.companyId)),
    fleet: inputs.fleet.filter((f) => is(f.companyId)),
    operations: inputs.operations.filter((o) => is(o.companyId)),
    operationsTotal: inputs.missionsByCompany?.[dept] ?? 0,
    missionsByCompany: inputs.missionsByCompany,
    safety,
    overdueAuditActions: inputs.overdueAuditActions.filter((a) => is(a.companyId)),
    findingsAwaitingVerification: [],
  };
}

export interface FindingContext {
  companyId: string | null;
  responsible: string | null;
  ageDays: number | null;
}

/** Look up department, responsible person and age for every finding from the source rows. */
export function buildFindingContext(inputs: ViewInputs): (f: ScannerFinding) => FindingContext {
  const map = new Map<string, FindingContext>();
  const put = (type: string, id: string, c: FindingContext) => map.set(`${type}:${id}`, c);
  for (const c of inputs.competencies) {
    put("competency", c.id, {
      companyId: c.companyId ?? null,
      responsible: c.pilotName,
      ageDays: c.daysUntilExpiry != null && c.daysUntilExpiry < 0 ? -c.daysUntilExpiry : null,
    });
  }
  for (const d of inputs.documents) {
    put("document", d.id, {
      companyId: d.companyId ?? null,
      responsible: null,
      ageDays: d.daysUntilExpiry != null && d.daysUntilExpiry < 0 ? -d.daysUntilExpiry : null,
    });
  }
  for (const f of inputs.fleet) {
    put("drone", f.id, { companyId: f.companyId, responsible: f.technicalResponsibleName, ageDays: null });
  }
  for (const o of inputs.operations) {
    const ctx: FindingContext = {
      companyId: o.companyId ?? null,
      responsible: o.pilots?.length ? o.pilots.map((p) => p.name).join(", ") : null,
      ageDays: o.days ?? (o.hours != null ? Math.floor(o.hours / 24) : null),
    };
    if (o.missionId) {
      const prev = map.get(`mission:${o.missionId}`);
      // Several issues per mission: keep the most informative context.
      put("mission", o.missionId, prev ? { ...ctx, responsible: ctx.responsible ?? prev.responsible, ageDays: ctx.ageDays ?? prev.ageDays } : ctx);
    }
    if (o.flightId) put("active_flight", o.flightId, ctx);
  }
  for (const i of inputs.safety?.incidentIssues ?? []) {
    put("incident", i.incidentId, { companyId: i.companyId ?? null, responsible: null, ageDays: i.days });
  }
  for (const a of inputs.overdueAuditActions) {
    const age = a.deadline ? Math.floor((Date.now() - new Date(a.deadline).getTime()) / 86_400_000) : null;
    put("audit_action", a.id, { companyId: a.companyId ?? null, responsible: null, ageDays: age });
  }
  return (f) => map.get(`${f.entityType}:${f.entityId}`) ?? { companyId: null, responsible: null, ageDays: null };
}

// ---------- Follow-up ("Oppfølgingsgrad") ----------
export const FOLLOW_UP_REMINDER_DAYS = 14;
export const NO_RESPONSE_DAYS = 7;

export interface FollowUpInputs {
  reminders: { finding_key: string | null; status: string; created_at: string }[];
  dispositions: { finding_code: string; entity_type: string; entity_id: string; disposition: string; reason: string | null; snooze_until: string | null }[];
  registered: { source_scanner_code: string | null; responsible_user_id: string | null; deadline: string | null }[];
}

export type ReminderPhase = "none" | "waiting" | "noResponse" | "done";

export interface FollowUpState {
  handled: boolean;
  reminder: ReminderPhase;
  reminderSentAt: string | null;
}

export const keyOf = (f: Pick<ScannerFinding, "code" | "entityType" | "entityId">) =>
  `${f.code}:${f.entityType}:${f.entityId}`;

export function buildFollowUp(input: FollowUpInputs, now: Date = new Date()) {
  const latest = new Map<string, { at: string; done: boolean }>();
  for (const r of input.reminders) {
    for (const k of splitFindingKeys(r.finding_key)) {
      const prev = latest.get(k);
      if (!prev || r.created_at > prev.at) latest.set(k, { at: r.created_at, done: r.status === "done" });
    }
  }
  const disposed = new Set(
    input.dispositions
      .filter((d) => (d.disposition === "accepted" || d.disposition === "snoozed") && !!d.reason?.trim())
      .filter((d) => d.disposition !== "snoozed" || !d.snooze_until || new Date(d.snooze_until) > now)
      .map((d) => `${d.finding_code}:${d.entity_type}:${d.entity_id}`),
  );
  const registered = new Set(
    input.registered.filter((r) => r.responsible_user_id && r.deadline && r.source_scanner_code).map((r) => r.source_scanner_code!),
  );
  const day = 86_400_000;
  return (f: ScannerFinding): FollowUpState => {
    const k = keyOf(f);
    const rem = latest.get(k);
    const ageMs = rem ? now.getTime() - new Date(rem.at).getTime() : Infinity;
    const reminder: ReminderPhase = !rem ? "none" : rem.done ? "done" : ageMs > NO_RESPONSE_DAYS * day ? "noResponse" : "waiting";
    const recent = !!rem && ageMs <= FOLLOW_UP_REMINDER_DAYS * day;
    return { handled: recent || disposed.has(k) || registered.has(k), reminder, reminderSentAt: rem?.at ?? null };
  };
}

/** Share (0–100) of critical+warning findings where action has been taken; null when nothing to follow up. */
export function followUpRate(findings: ScannerFinding[], state: (f: ScannerFinding) => FollowUpState): number | null {
  const scoped = findings.filter((f) => f.severity === "critical" || f.severity === "warning");
  if (!scoped.length) return null;
  return Math.round((scoped.filter((f) => state(f).handled).length / scoped.length) * 100);
}

export type ActionFilter = "all" | "untreated" | "waiting" | "noResponse";

/** Untreated criticals first, then critical → warning → info, then oldest first. */
export function sortActionItems<T extends { finding: ScannerFinding; follow: FollowUpState; ctx: FindingContext }>(items: T[]): T[] {
  const sev = { critical: 0, warning: 1, info: 2 } as const;
  const rank = (i: T) => (i.finding.severity === "critical" && !i.follow.handled ? -1 : sev[i.finding.severity]);
  return [...items].sort((a, b) => rank(a) - rank(b) || (b.ctx.ageDays ?? -1) - (a.ctx.ageDays ?? -1));
}

export function matchesActionFilter(follow: FollowUpState, filter: ActionFilter): boolean {
  switch (filter) {
    case "untreated": return !follow.handled;
    case "waiting": return follow.reminder === "waiting";
    case "noResponse": return follow.reminder === "noResponse";
    default: return true;
  }
}
