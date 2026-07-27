import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuditOperations } from "../hooks/useAuditData";
import { auditDeepLink } from "../utils/auditDeepLink";
import type { OperationsIssue } from "../types";
import { cn } from "@/lib/utils";

const ISSUE_META: Record<
  OperationsIssue["code"],
  { severity: "critical" | "warning"; icon: typeof AlertOctagon; ringCls: string }
> = {
  flightNotClosed: { severity: "critical", icon: AlertOctagon, ringCls: "border-status-red/60" },
  missingRiskAssessment: { severity: "warning", icon: AlertTriangle, ringCls: "border-status-yellow/60" },
  missingChecklist: { severity: "warning", icon: AlertTriangle, ringCls: "border-status-yellow/60" },
  missingApproval: { severity: "warning", icon: AlertTriangle, ringCls: "border-status-yellow/60" },
};

export const OperationsTab = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useAuditOperations();

  const grouped = useMemo(() => {
    const g: Record<OperationsIssue["code"], OperationsIssue[]> = {
      flightNotClosed: [],
      missingRiskAssessment: [],
      missingChecklist: [],
      missingApproval: [],
    };
    for (const i of data?.issues ?? []) g[i.code].push(i);
    return g;
  }, [data]);

  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;

  const total = data?.total ?? 0;
  const totalIssues = data?.issues.length ?? 0;

  return (
    <div className="space-y-4">
      {totalIssues === 0 ? (
        <Card>
          <CardContent className="p-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 text-status-green" />
            {t("audit.operations.noIssues")}
          </CardContent>
        </Card>
      ) : (
        (Object.keys(grouped) as OperationsIssue["code"][])
          .filter((k) => grouped[k].length > 0)
          .sort((a, b) => (ISSUE_META[a].severity === "critical" ? -1 : 1))
          .map((code) => {
            const items = grouped[code];
            const meta = ISSUE_META[code];
            const Icon = meta.icon;
            return (
              <Card key={code} className={cn("border-l-4", meta.ringCls)}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className={cn("w-4 h-4", meta.severity === "critical" ? "text-status-red" : "text-status-yellow")} />
                    {t(`audit.operations.codes.${code}`)}
                  </CardTitle>
                  <Badge variant="outline">{items.length}</Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y divide-border">
                    {items.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{i.missionTitle}</div>
                          <div className="text-xs text-muted-foreground">
                            {i.missionDate ? new Date(i.missionDate).toLocaleDateString(i18n.language) : "—"}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(auditDeepLink("mission", i.missionId).path)}
                        >
                          {t("audit.alerts.open")} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })
      )}
      <p className="text-xs text-muted-foreground text-right">
        {t("audit.operations.evaluatedFootnote", { total, issues: totalIssues })}
      </p>
    </div>
  );
};
