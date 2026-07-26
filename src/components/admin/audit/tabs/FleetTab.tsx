import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "../components/StatusPill";
import { useAuditFleet } from "../hooks/useAuditData";
import { checkToPill, checkLabelKey } from "../utils/statusMapping";

export const FleetTab = () => {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, error } = useAuditFleet();
  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;
  const rows = data ?? [];
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("audit.fleet.drone")}</TableHead>
              <TableHead>{t("audit.fleet.registration")}</TableHead>
              <TableHead>{t("audit.fleet.service")}</TableHead>
              <TableHead>{t("audit.fleet.nextInspection")}</TableHead>
              <TableHead>{t("audit.fleet.remoteId")}</TableHead>
              <TableHead>{t("audit.fleet.firmware")}</TableHead>
              <TableHead>{t("audit.fleet.calibration")}</TableHead>
              <TableHead>{t("audit.fleet.battery")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">{t("audit.states.empty")}</TableCell></TableRow>
            ) : rows.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.droneName}</TableCell>
                <TableCell>{f.registration ?? "—"}</TableCell>
                <TableCell><StatusPill status={checkToPill[f.service]} labelOverride={t(checkLabelKey[f.service])} /></TableCell>
                <TableCell>{f.nextInspection ? new Date(f.nextInspection).toLocaleDateString(i18n.language) : "—"}</TableCell>
                <TableCell><StatusPill status={checkToPill[f.remoteId]} labelOverride={t(checkLabelKey[f.remoteId])} /></TableCell>
                <TableCell><StatusPill status={checkToPill[f.firmware]} labelOverride={t(checkLabelKey[f.firmware])} /></TableCell>
                <TableCell><StatusPill status={checkToPill[f.calibration]} labelOverride={t(checkLabelKey[f.calibration])} /></TableCell>
                <TableCell><StatusPill status={checkToPill[f.batteryHealth]} labelOverride={t(checkLabelKey[f.batteryHealth])} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
