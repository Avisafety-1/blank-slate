import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { mockInternalAudits } from "../data/mockAuditData";
import type { InternalAudit } from "../types";
import { AuditDetailDialog } from "../components/AuditDetailDialog";

export const InternalAuditsTab = () => {
  const { t, i18n } = useTranslation();
  const [audits, setAudits] = useState<InternalAudit[]>(mockInternalAudits);
  const [openId, setOpenId] = useState<string | null>(null);

  const statusLabel = useMemo<Record<InternalAudit["status"], string>>(
    () => ({
      planned: t("audit.internal.statusPlanned"),
      in_progress: t("audit.internal.statusInProgress"),
      closed: t("audit.internal.statusClosed"),
    }),
    [t, i18n.language],
  );

  const active = audits.find((a) => a.id === openId) ?? null;
  const sorted = useMemo(
    () =>
      [...audits].sort((a, b) => {
        // Planned first, then in_progress, then closed. Within group by date asc.
        const order = { planned: 0, in_progress: 1, closed: 2 } as const;
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }),
    [audits],
  );

  const createNew = () => {
    const nw: InternalAudit = {
      id: `ia-${Date.now()}`,
      title: t("audit.internal.newTitle", { year: new Date().getFullYear() }),
      date: new Date().toISOString().slice(0, 10),
      responsible: "",
      status: "planned",
      findings: [],
      sections: {
        organization: { checked: [false, false, false], comment: "", status: "info" },
        documentation: { checked: [false, false, false], comment: "", status: "info" },
        competency: { checked: [false, false], comment: "", status: "info" },
        operations: { checked: [false, false, false], comment: "", status: "info" },
        technical: { checked: [false, false], comment: "", status: "info" },
        safety: { checked: [false, false], comment: "", status: "info" },
      },
    };
    setAudits((prev) => [nw, ...prev]);
    setOpenId(nw.id);
  };

  const save = (updated: InternalAudit) => {
    setAudits((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={createNew}>
          <Plus className="w-4 h-4 mr-2" /> {t("audit.internal.new")}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audit.internal.title")}</TableHead>
                <TableHead>{t("audit.internal.nextReview")}</TableHead>
                <TableHead>{t("audit.internal.responsible")}</TableHead>
                <TableHead>{t("audit.internal.status")}</TableHead>
                <TableHead className="text-right">{t("audit.internal.openFindings")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((a) => {
                const openFindings = a.findings.filter((f) => f.status !== "closed").length;
                return (
                  <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenId(a.id)}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>{new Date(a.date).toLocaleDateString(i18n.language)}</TableCell>
                    <TableCell>{a.responsible || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{statusLabel[a.status]}</Badge></TableCell>
                    <TableCell className="text-right">
                      {openFindings > 0 ? (
                        <Badge variant="outline" className="bg-status-yellow/70 text-black border-status-yellow/60">
                          {openFindings}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {active && (
        <AuditDetailDialog
          key={active.id}
          audit={active}
          open={!!openId}
          onOpenChange={(o) => !o && setOpenId(null)}
          onSave={save}
        />
      )}
    </div>
  );
};
