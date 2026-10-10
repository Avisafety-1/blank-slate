import type { HTMLAttributes } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function WarningNote({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-start gap-2 rounded-md border-l-4 border-status-yellow bg-status-yellow/10 p-3 text-sm text-foreground", className)} {...props}>
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-status-yellow" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}