// Translates AUDIT_* error codes raised by the audit guard triggers.
// Format: "AUDIT_CODE: tekst" or "AUDIT_CODE:<n>: tekst". Unknown errors pass through unchanged.

type T = (key: string, opts?: Record<string, unknown>) => string;

export const AUDIT_ERROR_CODES = [
  "AUDIT_DELETE_ONLY_PLANNED", "AUDIT_CREATE_CLOSED", "AUDIT_OWNER_COMPANY_LOCKED", "AUDIT_REVIEW_CLOSED",
  "AUDIT_REOPEN_ADMIN_ONLY", "AUDIT_REOPEN_REASON_REQUIRED", "AUDIT_UNASSESSED_ITEMS", "AUDIT_MISSING_REASON",
  "AUDIT_OPEN_CRITICAL", "AUDIT_CREATED_BY_LOCKED", "AUDIT_COMPANY_LOCKED", "AUDIT_REVIEW_ID_LOCKED",
  "AUDIT_SECTION_ID_LOCKED", "AUDIT_REVIEW_NOT_FOUND", "AUDIT_ITEM_WRONG_REVIEW", "AUDIT_ITEM_LINK_LOCKED",
  "AUDIT_CLOSURE_COMMENT_LOCKED", "AUDIT_ROOT_CAUSE_LOCKED", "AUDIT_FINDING_RESPONSIBLE_LIMITED",
  "AUDIT_VERIFY_ADMIN_ONLY", "AUDIT_OBSERVATION_REASON_REQUIRED", "AUDIT_SELF_VERIFY_REASON_REQUIRED",
  "AUDIT_FINDING_NOT_FOUND", "AUDIT_FINDING_ID_LOCKED", "AUDIT_FINDING_CLOSED", "AUDIT_ACTION_CREATE_FORBIDDEN",
  "AUDIT_ACTION_DELETE_FORBIDDEN", "AUDIT_ACTION_DELETE_OWN_OPEN", "AUDIT_ACTION_CLOSED_LOCKED",
  "AUDIT_ACTION_FINDING_OWNER_LIMITED", "AUDIT_ACTION_RESPONSIBLE_LIMITED",
] as const;

const KNOWN = new Set<string>(AUDIT_ERROR_CODES);

export function parseAuditError(raw: string): { code: string; count: number | null } | null {
  const m = /(AUDIT_[A-Z_]+)(?::(\d+))?:/.exec(raw);
  if (!m || !KNOWN.has(m[1])) return null;
  return { code: m[1], count: m[2] ? Number(m[2]) : null };
}

export function auditErrorMessage(err: unknown, t: T, fallbackKey = "audit.internal.saveError"): string {
  const raw = String((err as { message?: string })?.message ?? err ?? "");
  const parsed = parseAuditError(raw);
  if (parsed) return t(`audit.errors.${parsed.code}`, { count: parsed.count ?? 0 });
  return raw || t(fallbackKey);
}
