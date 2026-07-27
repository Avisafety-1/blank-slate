import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { useAuditFleet } from "../hooks/useAuditData";
import { checkToPill, checkLabelKey } from "../utils/statusMapping";

export const FleetTab = () => {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, error } = useAuditFleet();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;
  const rows = data ?? [];

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>{t("audit.fleet.drone")}</TableHead>
              <TableHead>{t("audit.fleet.registration")}</TableHead>
              <TableHead>{t("audit.fleet.service")}</TableHead>
              <TableHead>{t("audit.fleet.nextInspection")}</TableHead>
              <TableHead>{t("audit.fleet.remoteId")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t("audit.states.empty")}</TableCell></TableRow>
            ) : rows.flatMap((f) => {
              const open = !!expanded[f.id];
              return [
                <TableRow key={f.id}>
                  <TableCell className="w-8">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggle(f.id)}>
                      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">{f.droneName}</TableCell>
                  <TableCell>{f.registration ?? "—"}</TableCell>
                  <TableCell><StatusPill status={checkToPill[f.service]} labelOverride={t(checkLabelKey[f.service])} /></TableCell>
                  <TableCell>{f.nextInspection ? new Date(f.nextInspection).toLocaleDateString(i18n.language) : "—"}</TableCell>
                  <TableCell><StatusPill status={checkToPill[f.remoteId]} labelOverride={t(checkLabelKey[f.remoteId])} /></TableCell>
                </TableRow>,
                open && (
                  <TableRow key={`${f.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell />
                    <TableCell colSpan={5}>
                      <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                        {t("audit.fleet.additionalDetails")}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground text-xs">{t("audit.fleet.firmware")}</div>
                          <StatusPill status={checkToPill[f.firmware]} labelOverride={t(checkLabelKey[f.firmware])} />
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">{t("audit.fleet.calibration")}</div>
                          <StatusPill status={checkToPill[f.calibration]} labelOverride={t(checkLabelKey[f.calibration])} />
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">{t("audit.fleet.battery")}</div>
                          <StatusPill status={checkToPill[f.batteryHealth]} labelOverride={t(checkLabelKey[f.batteryHealth])} />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        {t("audit.fleet.informationalNote")}
                      </p>
                    </TableCell>
                  </TableRow>
                ),
              ].filter(Boolean);
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
