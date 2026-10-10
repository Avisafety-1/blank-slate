import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OpenEntityButton } from "./AuditEntityDialogHost";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Bell, FileQuestion, Loader2, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { SendReminderDialog } from "../SendReminderDialog";
import { useReminderStatuses } from "../hooks/useReminderStatuses";
import { MISSING_LOG_CODE, groupMissingLogsByRecipient, missingLogFindingKey } from "../lib/operationsAnalysis";
import { auditDeepLink, noFlightDeepLink } from "../utils/auditDeepLink";
import { InfoTip } from "./InfoTip";
import type { OperationsIssue, ScannerFinding } from "../types";

const toFinding = (i: OperationsIssue): ScannerFinding => {
  const params = { mission: i.missionTitle, date: i.missionDate ? i.missionDate.slice(0, 10) : "", days: i.days ?? 0 };
  return {
    code: MISSING_LOG_CODE,
    severity: "warning",
    categoryKey: "operations",
    titleKey: "audit.scanner.missionWithoutFlightLog.title",
    titleParams: params,
    bodyParams: params,
    entityType: "mission",
    entityId: i.missionId!,
    deepLink: auditDeepLink("mission", i.missionId!),
  };
};

export const MissingFlightLogsSection = ({ issues }: { issues: OperationsIssue[] }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: statuses } = useReminderStatuses();
  const [finding, setFinding] = useState<ScannerFinding | null>(null);
  const [bulkSending, setBulkSending] = useState(false);

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(i18n.language) : "—");

  const sendAll = async () => {
    const groups = groupMissingLogsByRecipient(issues);
    if (!groups.size) {
      toast.error(t("audit.operations.missingLogs.noRecipients"));
      return;
    }
    setBulkSending(true);
    const origin = window.location.origin;
    let ok = 0;
    let failed = 0;
    for (const [recipientId, list] of groups) {
      const lines = list.map((i) =>
        t("audit.operations.missingLogs.bulkLine", {
          title: i.missionTitle,
          date: fmtDate(i.missionDate),
          link: `${origin}${noFlightDeepLink(i.missionId!)}`,
        }),
      );
      try {
        const { error } = await supabase.functions.invoke("send-reminder", {
          body: {
            recipient_ids: [recipientId],
            subject: t("audit.operations.missingLogs.bulkSubject", { count: list.length }),
            body: `${t("audit.operations.missingLogs.bulkIntro", { count: list.length })}\n\n${lines.join("\n")}`,
            deep_link: list.length === 1 ? noFlightDeepLink(list[0].missionId!) : `/oppdrag?mission=${list[0].missionId}`,
            // One key per mission so status is tracked per mission.
            finding_key: list.map((i) => missingLogFindingKey(i.missionId!)).join(","),
            severity: "warning",
            channels: { email: true, sms: false, inbox: true },
          },
        });
        if (error) throw error;
        ok++;
      } catch {
        failed++;
      }
    }
    setBulkSending(false);
    qc.invalidateQueries({ queryKey: ["audit", "reminder-statuses"] });
    if (ok) toast.success(t("audit.operations.missingLogs.bulkSent", { count: ok }));
    if (failed) toast.error(t("audit.operations.missingLogs.bulkFailed", { count: failed }));
  };

  if (!issues.length) return null;

  return (
    <Card className="border-l-4 border-l-status-yellow/60">
      <CardContent className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium flex items-center gap-2 flex-1 min-w-0">
            <FileQuestion className="w-4 h-4 text-status-yellow shrink-0" />
            <span className="truncate">{t("audit.operations.missingLogs.title")}</span>
            <InfoTip k="audit.sectionHelp.missingLogs" />
            <Badge variant="outline">{issues.length}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={sendAll} disabled={bulkSending}>
            {bulkSending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            {t("audit.operations.missingLogs.requestAll")}
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {issues.map((i) => {
            const st = statuses?.[missingLogFindingKey(i.missionId!)]?.state ?? "not_sent";
            return (
              <li key={i.id} className="flex flex-wrap items-start gap-2 py-2">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="text-sm font-medium truncate">{i.missionTitle}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(i.missionDate)}
                    {i.departmentName ? ` · ${i.departmentName}` : ""}
                    {" · "}
                    {i.pilots?.length ? i.pilots.map((p) => p.name).join(", ") : t("audit.operations.missingLogs.noPilot")}
                    {" · "}
                    {t("audit.operations.missingLogs.daysAgo", { count: i.days ?? 0 })}
                  </div>
                  {i.possibleLog && (
                    <div className="text-xs mt-1 text-primary">
                      {t("audit.operations.missingLogs.possibleLog", {
                        date: fmtDate(i.possibleLog.date),
                        drone: i.possibleLog.drone ?? "—",
                        minutes: i.possibleLog.minutes ?? "—",
                      })}
                    </div>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      "mt-1 text-[10px]",
                      st === "sent_closed" && "text-status-green border-status-green/40",
                      st === "sent_open" && "text-status-yellow border-status-yellow/40",
                    )}
                  >
                    {t(`audit.operations.missingLogs.status.${st}`)}
                  </Badge>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setFinding(toFinding(i))}>
                    <Bell className="w-3.5 h-3.5 mr-1.5" />
                    {t("audit.operations.missingLogs.request")}
                  </Button>
                  <OpenEntityButton entityType="mission" entityId={i.missionId!} variant="ghost" />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <SendReminderDialog finding={finding} open={!!finding} onOpenChange={(o) => !o && setFinding(null)} />
    </Card>
  );
};
