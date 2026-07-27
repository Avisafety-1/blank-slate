import type { CheckResult, ScoreBucket } from "../types";
import type { AuditStatus } from "../types";

/**
 * Resolve any CheckResult (including semantic subtypes) down to a scoring bucket.
 * - pass/valid/no_expiry/not_required → pass
 * - warn/expiring/pending           → warn
 * - fail/expired                    → fail
 * - na/not_configured/not_reviewed  → na (excluded from score)
 * - unknown                         → na (technical fallback)
 */
export function resolveCheckBucket(r: CheckResult): ScoreBucket {
  switch (r) {
    case "pass":
    case "valid":
    case "no_expiry":
    case "not_required":
      return "pass";
    case "warn":
    case "expiring":
    case "pending":
      return "warn";
    case "fail":
    case "expired":
      return "fail";
    case "na":
    case "not_configured":
    case "not_reviewed":
    case "unknown":
    default:
      return "na";
  }
}

export const checkToPill: Record<CheckResult, AuditStatus> = {
  pass: "ok",
  valid: "ok",
  no_expiry: "ok",
  not_required: "ok",
  warn: "warning",
  expiring: "warning",
  pending: "warning",
  fail: "danger",
  expired: "danger",
  unknown: "info",
  na: "info",
  not_configured: "info",
  not_reviewed: "info",
};

export const checkLabelKey: Record<CheckResult, string> = {
  pass: "audit.status.valid",
  valid: "audit.status.valid",
  no_expiry: "audit.status.noExpiry",
  not_required: "audit.status.notRequired",
  warn: "audit.status.expiring",
  expiring: "audit.status.expiring",
  pending: "audit.status.pending",
  fail: "audit.status.expired",
  expired: "audit.status.expired",
  unknown: "audit.status.notReviewed",
  na: "audit.status.notRequired",
  not_configured: "audit.status.notConfigured",
  not_reviewed: "audit.status.notReviewed",
};
