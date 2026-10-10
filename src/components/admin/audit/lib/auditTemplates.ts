// Static internal-audit templates. Copied into audit_sections / audit_checklist_items
// when a review is created, so later edits here never change existing reviews.
// Labels are i18n keys: audit.tpl.section.<sectionKey> and audit.tpl.item.<itemKey>.

export type AuditTemplateKey = "open" | "specific" | "luc";

export interface AuditTemplateItem {
  key: string;
  reference: string | null;
}

export interface AuditTemplateSection {
  key: string;
  items: AuditTemplateItem[];
}

const item = (key: string, reference: string | null = null): AuditTemplateItem => ({ key, reference });

const OPEN: AuditTemplateSection[] = [
  { key: "organization", items: [
    item("open_operator_registered", "2019/947 art. 14"),
    item("open_insurance_valid"),
  ] },
  { key: "competency", items: [
    item("open_pilot_competency", "UAS.OPEN.020/030/040"),
  ] },
  { key: "technical", items: [
    item("open_class_marking", "2019/945"),
    item("open_remote_id", "UAS.OPEN.060"),
    item("open_maintenance_firmware"),
  ] },
  { key: "operations", items: [
    item("open_max_height_vlos", "UAS.OPEN.010"),
    item("open_distance_uninvolved"),
    item("open_geozones_checked", "2019/947 art. 15"),
  ] },
  { key: "incidents", items: [
    item("open_incidents_reported", "376/2014, 2019/947 art. 19"),
    item("open_incident_actions_closed"),
  ] },
];

const SPECIFIC: AuditTemplateSection[] = [
  { key: "permit", items: [
    item("spec_authorisation_valid", "UAS.SPEC.030/040"),
    item("spec_within_authorisation", "UAS.SPEC.050"),
  ] },
  { key: "documentation", items: [
    item("spec_manual_updated"),
    item("spec_changes_notified"),
  ] },
  { key: "competency", items: [
    item("spec_training_recurrent", "OSO #09"),
    item("spec_crew_fit", "OSO #17"),
    item("spec_operator_competent", "OSO #01"),
  ] },
  { key: "technical", items: [
    item("spec_maintenance_programme", "OSO #03"),
    item("spec_c2_link_checked", "OSO #06"),
  ] },
  { key: "operations", items: [
    item("spec_procedures_followed", "OSO #08"),
    item("spec_risk_assessment_each"),
    item("spec_volumes_respected"),
    item("spec_erp_exercised"),
  ] },
  { key: "incidents", items: [
    item("spec_incidents_reported", "376/2014"),
    item("spec_actions_closed_deadline"),
    item("spec_flight_logs_archived"),
  ] },
];

const LUC_EXTRA: AuditTemplateSection = {
  key: "luc_sms",
  items: [
    item("luc_accountable_manager", "UAS.LUC.020"),
    item("luc_sms", "UAS.LUC.030"),
    item("luc_manual_updated", "UAS.LUC.040"),
    item("luc_terms_complied", "UAS.LUC.050"),
    item("luc_self_approved_documented", "UAS.LUC.060"),
    item("luc_changes_handled", "UAS.LUC.070"),
  ],
};

export const AUDIT_TEMPLATES: Record<AuditTemplateKey, AuditTemplateSection[]> = {
  open: OPEN,
  specific: SPECIFIC,
  luc: [...SPECIFIC, LUC_EXTRA],
};

export const AUDIT_TEMPLATE_KEYS: AuditTemplateKey[] = ["open", "specific", "luc"];

/** Payload for the create_internal_audit RPC, with labels resolved at creation time. */
export function buildTemplatePayload(template: AuditTemplateKey, t: (key: string) => string) {
  return AUDIT_TEMPLATES[template].map((s) => ({
    key: s.key,
    items: s.items.map((i) => ({ key: i.key, label: t(`audit.tpl.item.${i.key}`), reference: i.reference })),
  }));
}

export type ChecklistResult = "pass" | "warn" | "fail" | "na" | "unknown";
export type SectionStatus = "ok" | "warning" | "danger" | "info";

/** Red if anything failed, yellow on deviation, green if all pass/na, otherwise info. */
export function computeSectionStatus(results: ChecklistResult[]): SectionStatus {
  if (results.some((r) => r === "fail")) return "danger";
  if (results.some((r) => r === "warn")) return "warning";
  if (results.length > 0 && results.every((r) => r === "pass" || r === "na")) return "ok";
  return "info";
}

/** A finding awaits verification only when work is done: open or in progress, ≥1 action, all actions closed. */
export function isAwaitingVerification(status: string | null | undefined, actionStatuses: string[]): boolean {
  return (status === "open" || status === "in_progress") && actionStatuses.length > 0 && actionStatuses.every((s) => s === "closed");
}

export type FindingSeverity = "critical" | "warning" | "info";

const pad = (n: number) => String(n).padStart(2, "0");
const localIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Suggested deadline per level: Level 1 = +7 days, Level 2 = +60 days, Observation = none. */
export function suggestDeadline(severity: FindingSeverity, today: Date = new Date()): string | null {
  const days = severity === "critical" ? 7 : severity === "warning" ? 60 : null;
  if (days === null) return null;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return localIso(d);
}

/** Default level when a finding is created from a checklist item. */
export function defaultSeverityForResult(result: ChecklistResult): FindingSeverity {
  return result === "warn" ? "info" : "warning";
}

export type FindingDisplayStatus = "open" | "in_progress" | "ready" | "verified";

/** Display status: legacy 'closed' counts as verified; 'ready' is derived (≥1 action, all closed). */
export function findingDisplayStatus(status: string, actionStatuses: string[]): FindingDisplayStatus {
  if (status === "verified" || status === "closed") return "verified";
  if (isAwaitingVerification(status, actionStatuses)) return "ready";
  return status === "in_progress" ? "in_progress" : "open";
}

export type CloseBlocker =
  | { kind: "unassessed"; itemId: string }
  | { kind: "missingReason"; itemId: string }
  | { kind: "openCritical"; findingId: string };

/** Mirrors the server rules in audit_reviews_guard; the server decides. */
export function closeBlockers(
  items: { id: string; result: ChecklistResult; comment: string | null }[],
  findings: { id: string; severity: string; status: string }[],
): CloseBlocker[] {
  const out: CloseBlocker[] = [];
  for (const i of items) {
    if (i.result === "unknown") out.push({ kind: "unassessed", itemId: i.id });
    else if ((i.result === "warn" || i.result === "fail") && !(i.comment ?? "").trim()) out.push({ kind: "missingReason", itemId: i.id });
  }
  for (const f of findings) {
    if (f.severity === "critical" && f.status !== "verified" && f.status !== "closed") out.push({ kind: "openCritical", findingId: f.id });
  }
  return out;
}

/** Override reason may only lift the open-critical rule. */
export function onlyCriticalBlocks(blockers: CloseBlocker[]): boolean {
  return blockers.length > 0 && blockers.every((b) => b.kind === "openCritical");
}
