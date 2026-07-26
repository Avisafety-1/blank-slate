import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "../components/KpiCard";
import { ClipboardList, AlertTriangle } from "lucide-react";
import { useAuditOperations } from "../hooks/useAuditData";

export const OperationsTab = () => {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, error } = useAuditOperations();
  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;

  const issues = data?.issues ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label={t("audit.operations.total")} value={total} icon={ClipboardList} />
        <KpiCard label={t("audit.kpi.openActions")} value={issues.length} icon={AlertTriangle} tone="warning" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("audit.operations.header")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audit.operations.mission")}</TableHead>
                <TableHead>{t("audit.operations.date")}</TableHead>
                <TableHead>{t("audit.operations.issue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("audit.states.empty")}</TableCell></TableRow>
              ) : issues.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.missionTitle}</TableCell>
                  <TableCell>{i.missionDate ? new Date(i.missionDate).toLocaleDateString(i18n.language) : "—"}</TableCell>
                  <TableCell>{t(`audit.operations.codes.${i.code}`)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
