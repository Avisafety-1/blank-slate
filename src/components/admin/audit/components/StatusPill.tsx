import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AuditStatus } from "../types";

interface Props {
  status: AuditStatus;
  labelOverride?: string;
}

export const StatusPill = ({ status, labelOverride }: Props) => {
  const map: Record<AuditStatus, { cls: string; label: string }> = {
    ok: { cls: "bg-status-green/15 text-status-green border-status-green/30", label: "OK" },
    warning: { cls: "bg-status-yellow/15 text-status-yellow border-status-yellow/30", label: "Forfaller" },
    danger: { cls: "bg-status-red/15 text-status-red border-status-red/30", label: "Mangler" },
    info: { cls: "bg-muted text-muted-foreground border-border", label: "—" },
  };
  const { cls, label } = map[status];
  return (
    <Badge variant="outline" className={cn("font-medium", cls)}>
      {labelOverride ?? label}
    </Badge>
  );
};
