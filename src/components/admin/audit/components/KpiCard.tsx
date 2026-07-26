import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}

export const KpiCard = ({ label, value, icon: Icon, hint, tone = "default" }: KpiCardProps) => {
  const toneClass = {
    default: "text-primary",
    success: "text-status-green",
    warning: "text-status-yellow",
    danger: "text-status-red",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {Icon && (
          <div className={cn("p-2 rounded-lg bg-muted", toneClass)}>
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-2xl font-semibold leading-tight">{value}</div>
          {hint && <div className="text-xs text-muted-foreground truncate">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
};
