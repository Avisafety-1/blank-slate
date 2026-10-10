import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  /** Optional secondary action-oriented line (e.g. "2 utløper < 30 dager"). */
  actionHint?: string;
  tone?: "default" | "success" | "warning" | "danger";
  onClick?: () => void;
  /** (i) help popover. */
  info?: ReactNode;
  /** Highlight when this card's filter is active. */
  active?: boolean;
}

export const KpiCard = ({ label, value, icon: Icon, hint, actionHint, tone = "default", onClick, info, active }: KpiCardProps) => {
  const toneClass = {
    default: "text-foreground",
    success: "text-status-green",
    warning: "text-status-yellow",
    danger: "text-status-red",
  }[tone];
  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick()) : undefined}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        onClick && "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active && "ring-2 ring-primary/60",
      )}
    >
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className={cn("h-4 w-4 shrink-0", toneClass)} />}
          <span className="text-xs text-muted-foreground leading-tight flex-1 min-w-0">{label}</span>
          {info}
        </div>
        <div className={cn("text-3xl font-semibold leading-none tabular-nums", toneClass)}>{value}</div>
        {actionHint && <div className={cn("text-xs font-medium truncate", toneClass)}>{actionHint}</div>}
        {hint && <div className="text-xs text-muted-foreground truncate">{hint}</div>}
      </CardContent>
    </Card>
  );
};
