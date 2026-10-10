import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useMyAuditTasks } from "../hooks/useInternalAudits";
import { deadlineTone } from "../lib/auditTasks";

/** Inbox section: open audit findings/actions the user is responsible for. Hidden when empty. */
export const MyAuditTasksSection = () => {
  const { t, i18n } = useTranslation();
  const { data: tasks = [] } = useMyAuditTasks();
  const [open, setOpen] = useState(true);
  const [params, setParams] = useSearchParams();
  if (tasks.length === 0) return null;

  const openTask = (findingId: string) => {
    const next = new URLSearchParams(params);
    next.set("auditFinding", findingId);
    setParams(next);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border mb-3">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50">
        <ClipboardCheck className="w-4 h-4" />
        <span className="flex-1 text-left">{t("audit.task.myTasks")}</span>
        <Badge variant="secondary">{tasks.length}</Badge>
        <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y border-t">
          {tasks.map((task) => {
            const tone = deadlineTone(task.deadline);
            return (
              <li key={`${task.kind}-${task.id}`}>
                <button type="button" onClick={() => openTask(task.findingId)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={task.severity === "critical" ? "destructive" : "outline"}>{t(`audit.internal.levelLabel.${task.severity}`)}</Badge>
                    <Badge variant="secondary">{t(`audit.task.kind.${task.kind}`)}</Badge>
                    <span className="text-sm flex-1 min-w-0 truncate">{task.description}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {task.reviewTitle && <span>{task.reviewTitle}</span>}
                    <span className={cn(tone === "overdue" && "text-destructive font-medium", tone === "soon" && "text-status-yellow font-medium")}>
                      {task.deadline ? t("audit.task.deadlineShort", { date: new Date(task.deadline).toLocaleDateString(i18n.language) }) : t("audit.task.noDeadline")}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};
