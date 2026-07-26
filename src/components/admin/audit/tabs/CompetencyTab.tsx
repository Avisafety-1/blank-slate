import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "../components/StatusPill";
import { useAuditCompetencies } from "../hooks/useAuditData";
import { checkToPill, checkLabelKey } from "../utils/statusMapping";

export const CompetencyTab = () => {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, error } = useAuditCompetencies();
  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;
  const rows = data ?? [];
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("audit.competency.pilot")}</TableHead>
              <TableHead>{t("audit.competency.competency")}</TableHead>
              <TableHead>{t("audit.competency.validUntil")}</TableHead>
              <TableHead>{t("audit.competency.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("audit.states.empty")}</TableCell></TableRow>
            ) : rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.pilotName}</TableCell>
                <TableCell>{c.competency}</TableCell>
                <TableCell>{c.validUntil ? new Date(c.validUntil).toLocaleDateString(i18n.language) : "—"}</TableCell>
                <TableCell>
                  <StatusPill status={checkToPill[c.status]} labelOverride={t(checkLabelKey[c.status])} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
