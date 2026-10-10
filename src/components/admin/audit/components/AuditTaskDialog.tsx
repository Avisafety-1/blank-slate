import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { BlurText } from "./AuditDetailDialog";
import { findingDisplayStatus, templateItemLabel } from "../lib/auditTemplates";
import { auditErrorMessage } from "../lib/auditErrors";
import { deadlineTone } from "../lib/auditTasks";
import {
  useAuditPersons, useAuditTaskFinding, useInternalAuditMutations, useSaveStatus, waitForSaves,
  type ActionRow,
} from "../hooks/useInternalAudits";

interface Props { findingId: string; onClose: () => void }

export const AuditTaskDialog = ({ findingId, onClose }: Props) => {
  const { t, i18n } = useTranslation();
  const { user, companyId, isAdmin } = useAuth();
  const q = useAuditTaskFinding(findingId);
  const persons = useAuditPersons();
  const m = useInternalAuditMutations();
  const save = useSaveStatus();
  const [closing, setClosing] = useState(false);
  const f = q.data;

  const run = async (p: Promise<unknown>) => {
    try { await p; return true; } catch (e) { toast.error(auditErrorMessage(e, t)); return false; }
  };
  const close = async () => {
    setClosing(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    await new Promise((r) => setTimeout(r, 0));
    await waitForSaves();
    setClosing(false);
    onClose();
  };

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(i18n.language) : t("audit.task.noDeadline"));
  const actions = [...(f?.audit_actions ?? [])].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  const display = f ? findingDisplayStatus(f.status, actions.map((a) => a.status)) : "open";
  const verified = display === "verified";
  const admin = !!f && isAdmin && f.audit_reviews?.company_id === companyId;
  const isFindingResp = !!f && f.responsible_user_id === user?.id;
  const ownsPlan = (isFindingResp || admin) && !verified;
  const tone = deadlineTone(f?.deadline ?? null);
  const toneClass = tone === "overdue" ? "text-destructive font-medium" : tone === "soon" ? "text-status-yellow-text font-medium" : "";
  const personList = persons.data ?? [];

  const personPick = (value: string | null, onChange: (v: string | null) => void, disabled?: boolean) => (
    <SearchablePersonSelect persons={personList} value={value} onValueChange={onChange} allowNone disabled={disabled}
      placeholder={t("audit.internal.selectPerson")} searchPlaceholder={t("audit.internal.searchPerson")}
      emptyText={t("audit.internal.noPersons")} noneLabel={t("audit.internal.none")} />
  );

  const renderAction = (a: ActionRow) => {
    const isActionResp = a.responsible_user_id === user?.id;
    const editPlan = ownsPlan && a.status !== "closed";
    const canStatus = (isActionResp || admin) && !verified;
    const canDelete = admin || (isFindingResp && a.status === "open" && a.created_by === user?.id);
    return (
      <div key={a.id} className="rounded-md border p-2 space-y-2">
        <BlurText value={a.description} disabled={!editPlan} placeholder={t("audit.internal.actionDescription")}
          onSave={(v) => v.trim() && run(m.updateAction.mutateAsync({ id: a.id, patch: { description: v.trim() } }))} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {personPick(a.responsible_user_id, (v) => run(m.updateAction.mutateAsync({ id: a.id, patch: { responsible_user_id: v } })), !editPlan)}
          <BlurText type="date" value={a.deadline} disabled={!editPlan}
            onSave={(v) => run(m.updateAction.mutateAsync({ id: a.id, patch: { deadline: v || null } }))} />
          <Select value={a.status} disabled={!canStatus}
            onValueChange={(v) => run(m.updateAction.mutateAsync({ id: a.id, patch: { status: v } }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{t("audit.internal.statusOpen")}</SelectItem>
              <SelectItem value="in_progress">{t("audit.internal.statusInProgressShort")}</SelectItem>
              <SelectItem value="closed">{t("audit.internal.statusClosedShort")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <BlurText value={a.comment} disabled={!canStatus} placeholder={t("audit.internal.actionComment")}
          onSave={(v) => run(m.updateAction.mutateAsync({ id: a.id, patch: { comment: v || null } }))} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {a.closed_at && <span className="mr-auto text-xs text-muted-foreground">{t("audit.internal.closedAt", { date: new Date(a.closed_at).toLocaleDateString(i18n.language) })}</span>}
          {canStatus && a.status !== "closed" && (
            <Button size="sm" variant="outline" onClick={() => run(m.updateAction.mutateAsync({ id: a.id, patch: { status: "closed" } }))}>
              <CheckCircle2 className="w-4 h-4 mr-1" />{t("audit.task.markDone")}
            </Button>
          )}
          {canDelete && !verified && (
            <Button size="sm" variant="ghost" aria-label={t("audit.internal.delete")}
              onClick={() => window.confirm(t("audit.task.deleteActionConfirm")) && run(m.deleteAction.mutateAsync(a.id))}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  const saveText = save.pending > 0 ? t("audit.internal.saving")
    : save.error ? t("audit.internal.saveFailed")
      : save.savedAt ? t("audit.internal.savedAt", { time: save.savedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) })
        : null;

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="dialog-vv-center dialog-max-h max-h-[90vh] max-h-[90dvh] flex flex-col p-0 overflow-hidden max-w-2xl">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 space-y-2">
          <DialogTitle className="pr-8">{t("audit.task.title")}</DialogTitle>
          {f && (
            <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
              <span className="text-muted-foreground">{t("audit.internal.autoSave")}</span>
              {saveText && <span className={save.error && save.pending === 0 ? "text-destructive font-medium" : "text-muted-foreground"}>· {saveText}</span>}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [touch-action:pan-y] px-4 sm:px-6 py-3 space-y-4">
          {q.isLoading && <p className="text-sm text-muted-foreground">{t("audit.internal.loading")}</p>}
          {!q.isLoading && !f && <p className="text-sm text-muted-foreground">{t("audit.task.notFound")}</p>}
          {f && (
            <>
              <div className="space-y-1 text-sm">
                <div className="font-medium">{f.audit_reviews?.title}</div>
                {f.unitName && <div className="text-xs text-muted-foreground">{t("audit.internal.auditedUnit")}: {f.unitName}</div>}
                {f.audit_checklist_items && (
                  <div className="text-xs text-muted-foreground">
                    {t("audit.task.item")}: {templateItemLabel(f.audit_checklist_items.item_key, f.audit_checklist_items.label, t)}
                  </div>
                )}
                {f.reference && <div className="text-xs text-muted-foreground">{t("audit.task.reference")}: {f.reference}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={f.severity === "critical" ? "destructive" : "outline"}>{t(`audit.internal.levelLabel.${f.severity}`)}</Badge>
                <Badge variant="secondary">{t(`audit.internal.displayStatus.${display}`)}</Badge>
                <span className={`text-xs ${toneClass}`}>{t("audit.task.deadline")}: {fmt(f.deadline)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-2">{f.description}</p>

              <div className="space-y-1">
                <Label>{t("audit.task.rootCause")}</Label>
                {ownsPlan ? (
                  <BlurText multiline value={f.root_cause ?? null} placeholder={t("audit.task.rootCausePlaceholder")}
                    onSave={(v) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { root_cause: v.trim() || null } }))} />
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{f.root_cause || t("audit.task.noRootCause")}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t("audit.task.actionPlan")}</h3>
                  {ownsPlan && (
                    <Button size="sm" variant="outline" onClick={() => run(m.createAction.mutateAsync({
                      finding: f, description: t("audit.internal.newAction"),
                      responsible_user_id: f.responsible_user_id, deadline: f.deadline,
                    }))}>
                      <Plus className="w-4 h-4 mr-1" />{t("audit.internal.addAction")}
                    </Button>
                  )}
                </div>
                {actions.length === 0 && <p className="text-xs text-muted-foreground">{t("audit.internal.noActions")}</p>}
                {actions.map(renderAction)}
              </div>

              {display === "ready" && (
                <p className="text-sm rounded-md border border-primary/40 bg-primary/5 p-2">{t("audit.task.readyForVerification")}</p>
              )}
              {f.closure_comment && <p className="text-xs text-muted-foreground">{t("audit.internal.closureComment")}: {f.closure_comment}</p>}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3 sm:px-6">
          <Button variant="outline" disabled={closing} onClick={close}>{t("audit.internal.closeDialog")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
