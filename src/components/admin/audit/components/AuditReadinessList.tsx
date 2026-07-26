import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { AuditStatus } from "../types";

interface Item {
  key: string;
  label: string;
  status: AuditStatus;
}

export const AuditReadinessList = ({ items }: { items: Item[] }) => {
  return (
    <ul className="divide-y divide-border">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-3 py-2.5">
          {it.status === "ok" ? (
            <CheckCircle2 className="w-4 h-4 text-status-green flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-status-yellow flex-shrink-0" />
          )}
          <span className="text-sm">{it.label}</span>
        </li>
      ))}
    </ul>
  );
};
