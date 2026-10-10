import { useTranslation } from "react-i18next";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FindingSeverity } from "../types";

const META: Record<FindingSeverity, { icon: typeof Info; cls: string }> = {
  critical: { icon: AlertOctagon, cls: "text-status-red border-status-red/50 bg-status-red/10" },
  warning: { icon: AlertTriangle, cls: "text-status-yellow-text border-status-yellow/50 bg-status-yellow/10" },
  info: { icon: Info, cls: "text-primary border-primary/50 bg-primary/10" },
};

/** Severity shown with colour, icon and text (never colour alone). */
export const SeverityBadge = ({ severity, className }: { severity: FindingSeverity; className?: string }) => {
  const { t } = useTranslation();
  const { icon: Icon, cls } = META[severity];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap", cls, className)}>
      <Icon className={cn("h-3.5 w-3.5", severity === "warning" && "text-status-yellow")} />
      {t(`audit.severity.${severity}`)}
    </span>
  );
};
