import type { ReactNode } from "react";
import { CheckCircle } from "lucide-react";

export interface SummaryMetric {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  alert?: boolean;
}

interface Props {
  title?: string | null;
  identifiers: string[];
  metrics: SummaryMetric[];
}

/**
 * Compact top panel for the flight log result view.
 * Holds all identification (date, drone, serial numbers) and key numbers once,
 * so the sections below never repeat them.
 */
export const FlightLogSummaryHeader = ({ title, identifiers, metrics }: Props) => {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 space-y-1">
          {title && <p className="text-sm font-semibold leading-tight">{title}</p>}
          {identifiers.length > 0 && (
            <p className="text-xs text-muted-foreground break-words">
              {identifiers.join(" · ")}
            </p>
          )}
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border/60 pt-2">
          {metrics.map((m) => (
            <div key={m.label} className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.icon}
                {m.label}
              </div>
              <p className={`text-sm font-semibold leading-tight ${m.alert ? "text-destructive" : ""}`}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
