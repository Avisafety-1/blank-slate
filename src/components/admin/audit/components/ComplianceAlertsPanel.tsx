import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, XCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScannerFinding } from "../types";
import { useUpsertDisposition } from "../hooks/useAuditData";
import { SendReminderDialog } from "../SendReminderDialog";

interface Props {
  findings: ScannerFinding[];
  limit?: number;
}

const sevClass = (sev: ScannerFinding["severity"]) =>
  sev === "critical"
    ? "text-status-red border-status-red/40 bg-status-red/10"
    : sev === "warning"
      ? "text-status-yellow border-status-yellow/40 bg-status-yellow/10"
      : "text-primary border-primary/40 bg-primary/10";

export const ComplianceAlertsPanel = ({ findings, limit = 10 }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispose = useUpsertDisposition();
  const [reminderFinding, setReminderFinding] = useState<ScannerFinding | null>(null);
  const shown = findings.slice(0, limit);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-status-yellow" />
          {t("audit.alerts.title")}
        </CardTitle>
        {findings.length > limit && (
          <Badge variant="outline">{findings.length}</Badge>
        )}
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("audit.alerts.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((f) => (
              <li key={`${f.code}-${f.entityId}`} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2.5">
                <Badge variant="outline" className={cn("uppercase text-[10px]", sevClass(f.severity))}>
                  {f.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {t(f.titleKey, f.titleParams as never) as string}
                  </div>
                  {f.bodyKey && (
                    <div className="text-xs text-muted-foreground truncate">
                      {t(f.bodyKey, f.bodyParams as never) as string}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReminderFinding(f)}
                    title={t("audit.alerts.sendReminder")}
                  >
                    <Send className="w-3 h-3 mr-1" />
                    {t("audit.alerts.sendReminder")}
                  </Button>
                  {f.deepLink?.path && (
                    <Button size="sm" variant="outline" onClick={() => navigate(f.deepLink!.path)}>
                      {t("audit.alerts.open")} <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
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
                    <XCircle className="w-3 h-3" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
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
