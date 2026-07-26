import type { CheckResult } from "../types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days until a date (positive = future, negative = past). null if invalid. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / MS_PER_DAY);
}

/**
 * Standard expiry mapping used throughout Compliance:
 *   > warnDays days left → pass
 *   0..warnDays days left → warn
 *   < 0 (expired) → fail
 *   no date → unknown
 */
export function expiryStatus(
  iso: string | null | undefined,
  warnDays = 60,
): CheckResult {
  const d = daysUntil(iso);
  if (d === null) return "unknown";
  if (d < 0) return "fail";
  if (d <= warnDays) return "warn";
  return "pass";
}

export function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
