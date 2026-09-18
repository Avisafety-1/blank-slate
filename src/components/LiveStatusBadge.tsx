import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { LiveStatus } from "@/hooks/useLiveDroneStatus";

interface LiveStatusBadgeProps {
  status: LiveStatus;
  className?: string;
}

const colors: Record<LiveStatus, string> = {
  live: "bg-status-green",
  recent: "bg-status-yellow",
  offline: "bg-status-red",
};

export const LiveStatusBadge = ({ status, className }: LiveStatusBadgeProps) => {
  const { t } = useTranslation();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("w-3 h-3 rounded-full", colors[status])} />
      <span className="text-sm font-medium">{t(`resources.live.${status}`)}</span>
    </div>
  );
};
