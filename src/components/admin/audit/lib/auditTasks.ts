// Pure selection/sorting for "Mine revisjonsoppgaver" in the inbox.

export type TaskSeverity = "critical" | "warning" | "info";

export interface TaskFindingInput {
  id: string; description: string; severity: TaskSeverity; deadline: string | null;
  status: string; responsible_user_id: string | null; reviewTitle: string | null;
}
export interface TaskActionInput {
  id: string; finding_id: string; description: string; deadline: string | null;
  status: string; responsible_user_id: string | null;
  findingSeverity: TaskSeverity; findingStatus: string; reviewTitle: string | null;
}
export interface AuditTask {
  kind: "finding" | "action";
  id: string; findingId: string; description: string; severity: TaskSeverity;
  deadline: string | null; reviewTitle: string | null;
}

const OPEN_FINDING = new Set(["open", "in_progress"]);

/** Open findings and open actions (on open findings) the user is responsible for. */
export function selectMyAuditTasks(findings: TaskFindingInput[], actions: TaskActionInput[], userId: string): AuditTask[] {
  const out: AuditTask[] = [];
  for (const f of findings) {
    if (f.responsible_user_id !== userId || !OPEN_FINDING.has(f.status)) continue;
    out.push({ kind: "finding", id: f.id, findingId: f.id, description: f.description, severity: f.severity, deadline: f.deadline, reviewTitle: f.reviewTitle });
  }
  for (const a of actions) {
    if (a.responsible_user_id !== userId || a.status === "closed" || !OPEN_FINDING.has(a.findingStatus)) continue;
    out.push({ kind: "action", id: a.id, findingId: a.finding_id, description: a.description, severity: a.findingSeverity, deadline: a.deadline, reviewTitle: a.reviewTitle });
  }
  return sortAuditTasks(out);
}

const SEV = { critical: 0, warning: 1, info: 2 } as const;
const pad = (n: number) => String(n).padStart(2, "0");
export const todayIso = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Overdue first, then Level 1, then deadline (no deadline last). */
export function sortAuditTasks(tasks: AuditTask[], today: string = todayIso()): AuditTask[] {
  const overdue = (t: AuditTask) => (t.deadline && t.deadline < today ? 0 : 1);
  return [...tasks].sort((a, b) =>
    overdue(a) - overdue(b) || SEV[a.severity] - SEV[b.severity] || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
}

export type DeadlineTone = "overdue" | "soon" | "normal";

/** Red when passed, yellow within 7 days (inclusive), otherwise normal. */
export function deadlineTone(deadline: string | null, today: string = todayIso()): DeadlineTone {
  if (!deadline) return "normal";
  if (deadline < today) return "overdue";
  const [y, m, d] = today.split("-").map(Number);
  const limit = todayIso(new Date(y, m - 1, d + 7));
  return deadline <= limit ? "soon" : "normal";
}
