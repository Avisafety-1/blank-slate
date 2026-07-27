import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertOctagon, AlertTriangle, ArrowRight, XCircle, Send, CheckCircle2, Clock, MailX, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FindingSeverity, ScannerFinding } from "../types";
import { useUpsertDisposition } from "../hooks/useAuditData";
import { useReminderStatuses, findingKey, type ReminderStatus } from "../hooks/useReminderStatuses";
import { SendReminderDialog } from "../SendReminderDialog";

interface Props {
  findings: ScannerFinding[];
  /** Rows per group shown before the "Show more" toggle expands to the full list. */
  initialPerGroup?: number;
}


const SEVERITY_ORDER: FindingSeverity[] = ["critical", "warning", "info"];

const sectionMeta: Record<
  FindingSeverity,
  { icon: typeof AlertOctagon; ringCls: string; textCls: string; titleKey: string }
> = {
  critical: {
    icon: AlertOctagon,
    ringCls: "border-status-red/60",
    textCls: "text-status-red",
    titleKey: "audit.alerts.groupCritical",
  },
  warning: {
    icon: AlertTriangle,
    ringCls: "border-status-yellow/60",
    textCls: "text-status-yellow",
    titleKey: "audit.alerts.groupWarning",
  },
  info: {
    icon: Info,
    ringCls: "border-primary/60",
    textCls: "text-primary",
    titleKey: "audit.alerts.groupInfo",
  },
};

const sevBadgeClass = (sev: FindingSeverity) =>
  sev === "critical"
    ? "text-black border-status-red/60 bg-status-red/70"
    : sev === "warning"
      ? "text-black border-status-yellow/60 bg-status-yellow/70"
      : "text-black border-primary/60 bg-primary/70";

export const ComplianceAlertsPanel = ({ findings, initialPerGroup = 5 }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispose = useUpsertDisposition();
  const { data: reminderMap = {} } = useReminderStatuses();
  const [reminderFinding, setReminderFinding] = useState<ScannerFinding | null>(null);
  const [expanded, setExpanded] = useState<Record<FindingSeverity, boolean>>({
    critical: false,
    warning: false,
    info: false,
  });

  const grouped = useMemo(() => {
    const g: Record<FindingSeverity, ScannerFinding[]> = { critical: [], warning: [], info: [] };
    for (const f of findings) g[f.severity].push(f);
    return g;
  }, [findings]);

  const total = findings.length;


  const renderReminderBadge = (status: ReminderStatus | undefined) => {
    const state = status?.state ?? "not_sent";
    const cls =
      state === "sent_closed"
        ? "text-black border-status-green/60 bg-status-green/70"
        : state === "sent_open"
          ? "text-black border-status-yellow/60 bg-status-yellow/70"
          : "text-black border-status-red/60 bg-status-red/70";
    const Icon = state === "sent_closed" ? CheckCircle2 : state === "sent_open" ? Clock : MailX;
    const label =
      state === "sent_closed"
        ? t("audit.reminderStatus.closed")
        : state === "sent_open"
          ? t("audit.reminderStatus.sentOpen")
          : t("audit.reminderStatus.notSent");
    return (
      <Badge variant="outline" className={cn("gap-1.5 text-xs sm:text-sm whitespace-nowrap px-2.5 py-1", cls)}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </Badge>
    );
  };

  const renderRow = (f: ScannerFinding) => (
    <li
      key={`${f.code}-${f.entityId}`}
      className="flex flex-col sm:flex-row sm:items-center gap-2 py-3"
    >
      <Badge variant="outline" className={cn("uppercase text-xs sm:text-sm px-2.5 py-1", sevBadgeClass(f.severity))}>
        {t(`audit.severity.${f.severity}`)}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="text-sm sm:text-base font-medium break-words">
          {String(t(f.titleKey, (f.titleParams ?? {}) as never))}
        </div>
        {f.bodyKey && (
          <div className="text-xs sm:text-sm text-muted-foreground break-words">
            {String(t(f.bodyKey, (f.bodyParams ?? {}) as never))}
          </div>
        )}
      </div>
      {renderReminderBadge(reminderMap[findingKey(f.code, f.entityType, f.entityId)])}
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="text-xs sm:text-sm"
          onClick={() => setReminderFinding(f)}
          title={t("audit.alerts.sendReminder")}
        >
          <Send className="w-3.5 h-3.5 mr-1.5" />
          {t("audit.alerts.sendReminder")}
        </Button>
        {f.deepLink?.path && (
          <Button size="sm" variant="outline" className="text-xs sm:text-sm" onClick={() => navigate(f.deepLink!.path)}>
            {t("audit.alerts.open")} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-xs sm:text-sm"
          onClick={() =>
            dispose.mutate({
              finding_code: f.code,
              entity_type: f.entityType,
              entity_id: f.entityId,
              disposition: "dismissed",
            })
          }
          title={t("audit.alerts.dismiss")}
        >
          <XCircle className="w-3.5 h-3.5" />
        </Button>
      </div>
    </li>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-status-yellow" />
          {t("audit.alerts.title")}
        </CardTitle>
        <div className="flex items-center gap-1.5">
          {SEVERITY_ORDER.map((sev) => {
            const count = grouped[sev].length;
            if (!count) return null;
            return (
              <Badge key={sev} variant="outline" className={cn("text-xs px-2 py-0.5", sevBadgeClass(sev))}>
                {count}
              </Badge>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 max-h-[560px] overflow-y-auto">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{t("audit.alerts.empty")}</p>
        ) : (
          SEVERITY_ORDER.map((sev) => {
            const all = grouped[sev];
            if (!all.length) return null;
            const meta = sectionMeta[sev];
            const Icon = meta.icon;
            const isExpanded = expanded[sev];
            const items = isExpanded ? all : all.slice(0, initialPerGroup);
            const hidden = all.length - items.length;
            return (
              <section key={sev} className={cn("rounded-lg border-l-4 pl-3", meta.ringCls)}>
                <header className={cn("flex items-center gap-2 mb-1 sticky top-0 bg-card z-10 py-1", meta.textCls)}>
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-semibold uppercase tracking-wide">
                    {t(meta.titleKey)}
                  </span>
                  <Badge variant="outline" className="text-xs">{all.length}</Badge>
                </header>
                <ul className="divide-y divide-border">{items.map(renderRow)}</ul>
                {hidden > 0 && (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded((s) => ({ ...s, [sev]: true }))}
                    >
                      {t("audit.alerts.loadMore")} ({hidden})
                    </Button>
                  </div>
                )}
                {isExpanded && all.length > initialPerGroup && (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded((s) => ({ ...s, [sev]: false }))}
                    >
                      {t("audit.operations.collapseGroup")}
                    </Button>
                  </div>
                )}
              </section>
            );
          })
        )}
      </CardContent>


      <SendReminderDialog
        finding={reminderFinding}
        open={!!reminderFinding}
        onOpenChange={(v) => !v && setReminderFinding(null)}
      />
    </Card>
  );
};
