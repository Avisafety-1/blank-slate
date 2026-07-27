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
 *   > warnDays days left → valid
 *   0..warnDays days left → expiring
 *   < 0 (expired) → expired
 *   no date → no_expiry (semantic: not required to expire)
 */
export function expiryStatus(
  iso: string | null | undefined,
  warnDays = 60,
): CheckResult {
  const d = daysUntil(iso);
  if (d === null) return "no_expiry";
  if (d < 0) return "expired";
  if (d <= warnDays) return "expiring";
  return "valid";
}

export function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
