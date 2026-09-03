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
}

const fillClasses: Record<Status, string> = {
  "Grønn": "bg-status-green",
  "Gul": "bg-status-yellow",
  "Rød": "bg-status-red",
};

const textClasses: Record<Status, string> = {
  "Grønn": "text-status-green",
  "Gul": "text-status-yellow",
  "Rød": "text-status-red",
};

export const MaintenanceBar = ({
  label,
  current,
  limit,
  status,
  valueText,
  fractionDigits = 0,
}: MaintenanceBarProps) => {
  const { t } = useTranslation();
  const hasLimit = !!limit && limit > 0;
  const pct = hasLimit ? Math.max(0, Math.min(100, (current / (limit as number)) * 100)) : 0;
  const fmt = (n: number) => n.toFixed(fractionDigits);

  return (
    <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 sm:gap-3">
      <span className="text-xs text-muted-foreground truncate">{label}</span>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        {hasLimit && (
          <div
            className={cn("h-full rounded-full transition-all", fillClasses[status])}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className={cn("text-xs tabular-nums whitespace-nowrap", hasLimit ? textClasses[status] : "text-muted-foreground")}>
        {hasLimit
          ? (valueText ?? `${fmt(current)} / ${fmt(limit as number)}`)
          : (valueText ?? t("maintenance.notSet"))}
      </span>
    </div>
  );
};
