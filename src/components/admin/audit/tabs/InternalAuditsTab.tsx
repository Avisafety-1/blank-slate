import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditReviews, useAuditDepartments } from "../hooks/useAuditData";
import { useAuditPersons, type ReviewRow } from "../hooks/useInternalAudits";
import { AuditDetailDialog } from "../components/AuditDetailDialog";
import { NewInternalAuditDialog } from "../components/NewInternalAuditDialog";

export const InternalAuditsTab = () => {
  const { t, i18n } = useTranslation();
  const { companyId, isAdmin } = useAuth();
  const reviews = useAuditReviews();
  const persons = useAuditPersons();
  const departments = useAuditDepartments();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = (reviews.data ?? []) as unknown as ReviewRow[];
  const personName = (id: string | null) => persons.data?.find((p) => p.id === id)?.full_name ?? "—";
  const statusLabel: Record<ReviewRow["status"], string> = {
    planned: t("audit.internal.statusPlanned"),
    in_progress: t("audit.internal.statusInProgress"),
    closed: t("audit.internal.statusClosed"),
  };
  const sorted = useMemo(() => {
    const order = { planned: 0, in_progress: 1, closed: 2 } as const;
    return [...rows].sort((a, b) => order[a.status] - order[b.status] || a.review_date.localeCompare(b.review_date));
  }, [rows]);
  const active = rows.find((r) => r.id === openId) ?? null;
  const openCount = (r: ReviewRow) => (r.audit_findings ?? []).filter((f) => f.status !== "closed" && f.status !== "verified").length;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" /> {t("audit.internal.new")}</Button>
        </div>
      )}
      {reviews.isLoading && <p className="text-sm text-muted-foreground">{t("audit.internal.loading")}</p>}
      {!reviews.isLoading && rows.length === 0 && <p className="text-sm text-muted-foreground">{t("audit.internal.empty")}</p>}
      <div className="md:hidden space-y-2">
        {sorted.map((a) => (
          <Card key={a.id} role="button" tabIndex={0} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenId(a.id)}>
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="flex-1 min-w-0 font-medium text-sm">{a.title}</span>
                <Badge variant="outline">{statusLabel[a.status]}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(a.review_date).toLocaleDateString(i18n.language)} · {personName(a.responsible_user_id)}
              </div>
              <div className="text-xs">{t("audit.internal.openFindings")}: <span className={openCount(a) > 0 ? "font-semibold text-status-yellow-text" : "text-muted-foreground"}>{openCount(a)}</span></div>
            </CardContent>
          </Card>
        ))}
      </div>
      {rows.length > 0 && (
        <Card className="hidden md:block">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("audit.internal.title")}</TableHead>
                  <TableHead>{t("audit.internal.date")}</TableHead>
                  <TableHead>{t("audit.internal.template")}</TableHead>
                  <TableHead>{t("audit.internal.responsible")}</TableHead>
                  <TableHead>{t("audit.internal.status")}</TableHead>
                  <TableHead className="text-right">{t("audit.internal.openFindings")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenId(a.id)}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>{new Date(a.review_date).toLocaleDateString(i18n.language)}</TableCell>
                    <TableCell>{t(`audit.tpl.template.${a.template_key}`)}</TableCell>
                    <TableCell>{personName(a.responsible_user_id)}</TableCell>
                    <TableCell><Badge variant="outline">{statusLabel[a.status]}</Badge></TableCell>
                    <TableCell className="text-right">{openCount(a)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {creating && (
        <NewInternalAuditDialog open={creating} onOpenChange={setCreating} persons={persons.data ?? []}
          departments={departments.data ?? []} onCreated={setOpenId} />
      )}
      {active && (
        <AuditDetailDialog key={active.id} review={active} open onOpenChange={(o) => !o && setOpenId(null)}
          canEdit={isAdmin && active.company_id === companyId} persons={persons.data ?? []}
          unitName={departments.data?.find((d) => d.id === active.audited_company_id)?.name ?? null} />
      )}
    </div>
  );
};
