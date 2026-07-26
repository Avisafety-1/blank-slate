import type { CheckResult } from "../types";
import type { AuditStatus } from "../types";

export const checkToPill: Record<CheckResult, AuditStatus> = {
  pass: "ok",
  warn: "warning",
  fail: "danger",
  unknown: "info",
  na: "info",
};

export const checkLabelKey: Record<CheckResult, string> = {
  pass: "audit.competency.statusPass",
  warn: "audit.competency.statusWarn",
  fail: "audit.competency.statusFail",
  unknown: "audit.competency.statusUnknown",
  na: "audit.competency.statusUnknown",
};
