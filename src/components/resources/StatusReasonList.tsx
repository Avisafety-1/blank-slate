import { useTranslation } from "react-i18next";
import { AlertTriangle, AlertCircle } from "lucide-react";
import type { StatusReason } from "@/lib/maintenanceStatus";

interface StatusReasonListProps {
  reasons: StatusReason[];
  className?: string;
}

/**
 * Lists the concrete reasons that drive a resource status, so users can see
 * exactly what is red/yellow (own inspection, hours, missions, a linked
 * battery, a logbook deviation, ...).
 */
export const StatusReasonList = ({ reasons, className }: StatusReasonListProps) => {
  const { t } = useTranslation();
  if (!reasons.length) return null;

  return (
    <div className={`mt-1.5 space-y-1 ${className ?? ""}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("statusReasons.title")}
      </p>
      <ul className="space-y-1">
        {reasons.map((r, i) => {
          const isRed = r.status === "Rød";
          const Icon = isRed ? AlertCircle : AlertTriangle;
          return (
            <li
              key={`${r.source}-${i}`}
              className={`flex items-start gap-1.5 text-xs ${
                isRed ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
              }`}
            >
              <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="break-words">{r.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
