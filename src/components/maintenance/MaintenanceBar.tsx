import { Status } from "@/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface MaintenanceBarProps {
  label: string;
  current: number;
  limit: number | null | undefined;
  status: Status;
  /** Optional text shown to the right instead of "current / limit" */
  valueText?: string;
  fractionDigits?: number;
  /** Fraction (0-1) of the bar where the warning threshold starts */
  warningAt?: number | null;
}

const fillClasses: Record<Status, string> = {
  "Grønn": "bg-gradient-to-r from-emerald-500 to-emerald-400",
  "Gul": "bg-gradient-to-r from-amber-500 to-orange-400",
  "Rød": "bg-gradient-to-r from-red-600 to-rose-500",
};

const glowClasses: Record<Status, string> = {
  "Grønn": "shadow-[0_0_10px_-2px_hsl(152_76%_45%/0.9)]",
  "Gul": "shadow-[0_0_10px_-2px_hsl(32_95%_55%/0.9)]",
  "Rød": "shadow-[0_0_10px_-2px_hsl(0_84%_58%/0.9)]",
};

const textClasses: Record<Status, string> = {
  "Grønn": "text-emerald-500",
  "Gul": "text-orange-500",
  "Rød": "text-red-500",
};

export const MaintenanceBar = ({
  label,
  current,
  limit,
  status,
  valueText,
  fractionDigits = 0,
  warningAt,
}: MaintenanceBarProps) => {
  const { t } = useTranslation();
  const hasLimit = !!limit && limit > 0;
  const pct = hasLimit ? Math.max(0, Math.min(100, (current / (limit as number)) * 100)) : 0;
  const fmt = (n: number) => n.toFixed(fractionDigits);
  const markerPct =
    hasLimit && warningAt != null && warningAt > 0 && warningAt < 1 ? warningAt * 100 : null;

  return (
    <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 sm:gap-3">
      <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
      <div className="relative h-3 rounded-full bg-foreground/15 ring-1 ring-inset ring-border/70 overflow-hidden">
        {hasLimit && (
          <div
            className={cn("h-full rounded-full transition-all duration-500", fillClasses[status], glowClasses[status])}
            style={{ width: `${pct}%` }}
          />
        )}
        {markerPct !== null && (
          <span
            aria-hidden
            className="absolute top-0 h-full w-[2px] bg-background/90 mix-blend-normal"
            style={{ left: `${markerPct}%` }}
          />
        )}
      </div>
      <span
        className={cn(
          "text-xs font-semibold tabular-nums whitespace-nowrap",
          hasLimit ? textClasses[status] : "text-muted-foreground",
        )}
      >
        {hasLimit
          ? (valueText ?? `${fmt(current)} / ${fmt(limit as number)}`)
          : (valueText ?? t("maintenance.notSet"))}
      </span>
    </div>
  );
};
