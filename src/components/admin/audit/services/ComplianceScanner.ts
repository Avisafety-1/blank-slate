import type { ScannerFinding } from "../types";
import { validators, type ValidatorContext } from "../validators";
import { sortBySeverity } from "../utils/severity";

export interface Disposition {
  finding_code: string;
  entity_type: string;
  entity_id: string;
  disposition: "accepted" | "dismissed" | "snoozed";
  snooze_until: string | null;
}

function matchesDisposition(f: ScannerFinding, d: Disposition): boolean {
  return (
    f.code === d.finding_code &&
    f.entityType === d.entity_type &&
    f.entityId === d.entity_id
  );
}

function isActiveDisposition(d: Disposition): boolean {
  if (d.disposition !== "snoozed") return true;
  if (!d.snooze_until) return true;
  return new Date(d.snooze_until).getTime() > Date.now();
}

export function runScanner(
  ctx: ValidatorContext,
  dispositions: Disposition[] = [],
): ScannerFinding[] {
  const all = validators.flatMap((v) => v(ctx));
  const active = dispositions.filter(isActiveDisposition);
  const filtered = all.filter((f) => {
    const disp = active.find((d) => matchesDisposition(f, d));
    if (!disp) return true;
    // dismissed/accepted → hide; snoozed active → hide until snooze_until
    return false;
  });
  return sortBySeverity(filtered);
}
