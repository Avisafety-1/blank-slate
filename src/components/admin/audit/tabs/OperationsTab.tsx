import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck, ClipboardCheck, FileWarning } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useAuditOperations } from "../hooks/useAuditData";
import { auditDeepLink } from "../utils/auditDeepLink";
import type { OperationsIssue } from "../types";
import { cn } from "@/lib/utils";

const ISSUE_META: Record<
  OperationsIssue["code"],
  { severity: "critical" | "warning"; icon: typeof AlertOctagon; textCls: string }
> = {
  flightNotClosed: { severity: "critical", icon: AlertOctagon, textCls: "text-status-red" },
  missingRiskAssessment: { severity: "warning", icon: AlertTriangle, textCls: "text-status-yellow" },
  missingChecklist: { severity: "warning", icon: AlertTriangle, textCls: "text-status-yellow" },
  missingApproval: { severity: "warning", icon: AlertTriangle, textCls: "text-status-yellow" },
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
  const withoutRA = grouped.missingRiskAssessment.length;
  const withoutApproval = grouped.missingApproval.length;

  // Missions with at least one RA or approval issue = non-compliant
  const nonCompliantIds = new Set<string>();
  for (const i of grouped.missingRiskAssessment) nonCompliantIds.add(i.missionId);
  for (const i of grouped.missingApproval) nonCompliantIds.add(i.missionId);
  const nonCompliant = nonCompliantIds.size;
  const compliant = Math.max(0, total - nonCompliant);
  const compliancePct = total > 0 ? Math.round((compliant / total) * 100) : null;

  const codes = (Object.keys(grouped) as OperationsIssue["code"][])
    .filter((k) => grouped[k].length > 0)
    .sort((a, b) => (ISSUE_META[a].severity === "critical" ? -1 : 1));

  const pieData = [
    { name: t("audit.operations.summary.compliantSlice"), value: compliant, color: "hsl(var(--status-green))" },
    { name: t("audit.operations.summary.nonCompliantSlice"), value: nonCompliant, color: "hsl(var(--status-red))" },
  ];

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={ClipboardCheck} label={t("audit.operations.summary.completed")} value={total} tone="neutral" />
        <KpiCard icon={ShieldCheck} label={t("audit.operations.summary.compliant")} value={compliant} tone="green" />
        <KpiCard icon={FileWarning} label={t("audit.operations.summary.withoutRA")} value={withoutRA} tone="yellow" />
        <KpiCard icon={AlertTriangle} label={t("audit.operations.summary.withoutApproval")} value={withoutApproval} tone="yellow" />
        <KpiCard
          icon={ShieldCheck}
          label={t("audit.operations.summary.complianceRate")}
          value={compliancePct === null ? "—" : `${compliancePct}%`}
          tone={compliancePct !== null && compliancePct >= 90 ? "green" : compliancePct !== null && compliancePct >= 70 ? "yellow" : "red"}
        />
      </div>

      {/* Donut chart */}
      {total > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">{t("audit.operations.summary.chartTitle")}</div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {totalIssues === 0 ? (
        <Card>
          <CardContent className="p-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 text-status-green" />
            {t("audit.operations.noIssues")}
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {codes.map((code) => {
            const items = grouped[code];
            const meta = ISSUE_META[code];
            const Icon = meta.icon;
            return (
              <AccordionItem
                key={code}
                value={code}
                className={cn("border rounded-lg border-l-4 px-3", meta.severity === "critical" ? "border-l-status-red/60" : "border-l-status-yellow/60")}
              >
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Icon className={cn("w-4 h-4", meta.textCls)} />
                    <span className="text-sm font-medium truncate">{t(`audit.operations.codes.${code}`)}</span>
                    <Badge variant="outline" className="ml-auto mr-2">{items.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  <ul className="divide-y divide-border">
                    {items.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 py-2">
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
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
      <p className="text-xs text-muted-foreground text-right">
        {t("audit.operations.evaluatedFootnote", { total, issues: totalIssues })}
      </p>
    </div>
  );
};

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof AlertOctagon;
  label: string;
  value: string | number;
  tone: "neutral" | "green" | "yellow" | "red";
}) {
  const toneCls = {
    neutral: "text-foreground",
    green: "text-status-green",
    yellow: "text-status-yellow",
    red: "text-status-red",
  }[tone];
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <Icon className={cn("w-5 h-5 shrink-0", toneCls)} />
        <div className="min-w-0">
          <div className={cn("text-xl font-semibold leading-tight", toneCls)}>{value}</div>
          <div className="text-xs text-muted-foreground truncate">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
