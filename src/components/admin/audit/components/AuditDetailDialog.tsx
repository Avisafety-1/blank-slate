import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { StatusPill } from "./StatusPill";
import { computeSectionStatus, type ChecklistResult } from "../lib/auditTemplates";
import {
  useInternalAuditMutations, type ReviewRow, type FindingRow, type ActionRow, type ChecklistItemRow, type SectionRow,
} from "../hooks/useInternalAudits";

interface Props {
  review: ReviewRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  persons: { id: string; full_name: string | null }[];
  unitName: string | null;
}

const RESULTS: ChecklistResult[] = ["pass", "warn", "fail", "na"];

/** Text field that saves on blur when the value changed. */
const BlurText = ({ value, onSave, disabled, multiline, placeholder }: {
  value: string | null; onSave: (v: string) => void; disabled?: boolean; multiline?: boolean; placeholder?: string;
}) => {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const props = {
    value: v, disabled, placeholder,
    onChange: (e: any) => setV(e.target.value),
    onBlur: () => { if (v !== (value ?? "")) onSave(v); },
  };
  return multiline ? <Textarea rows={2} {...props} /> : <Input {...props} />;
};

export const AuditDetailDialog = ({ review, open, onOpenChange, canEdit, persons, unitName }: Props) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const m = useInternalAuditMutations();
  const [overrideReason, setOverrideReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [showReopen, setShowReopen] = useState(false);

  const closed = review.status === "closed";
  const editChecklist = canEdit && !closed;
  const sections = [...(review.audit_sections ?? [])].sort((a, b) => a.order_index - b.order_index);
  const findings = [...(review.audit_findings ?? [])];
  const openCritical = findings.filter((f) => f.severity === "critical" && f.status !== "verified" && f.status !== "closed").length;
  const sectionLabel = (key: string) => t(`audit.tpl.section.${key}`, { defaultValue: key });

  const run = async (p: Promise<unknown>) => {
    try { await p; } catch (e: any) { toast.error(e?.message ?? t("audit.internal.saveError")); }
  };

  const setResult = (section: SectionRow, item: ChecklistItemRow, result: ChecklistResult) => {
    const results = section.audit_checklist_items.map((i) => (i.id === item.id ? result : i.result));
    run(m.updateItem.mutateAsync({ id: item.id, patch: { result }, sectionId: section.id, sectionStatus: computeSectionStatus(results) }));
  };

  const closeReview = () =>
    run(m.updateReview.mutateAsync({ id: review.id, patch: { status: "closed", override_reason: overrideReason.trim() || review.override_reason } }));
  const reopen = () =>
    run(m.updateReview.mutateAsync({ id: review.id, patch: { status: "in_progress", reopen_reason: reopenReason.trim() } })
      .then(() => { setShowReopen(false); setReopenReason(""); }));
  const remove = () => {
    if (!window.confirm(t("audit.internal.deleteConfirm"))) return;
    run(m.deleteReview.mutateAsync(review.id).then(() => onOpenChange(false)));
  };

  const PersonPick = ({ value, onChange, disabled }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) => (
    <SearchablePersonSelect persons={persons} value={value} onValueChange={onChange} allowNone disabled={disabled}
      placeholder={t("audit.internal.selectPerson")} searchPlaceholder={t("audit.internal.searchPerson")}
      emptyText={t("audit.internal.noPersons")} noneLabel={t("audit.internal.none")} />
  );

  const renderAction = (a: ActionRow) => {
    const isResp = a.responsible_user_id === user?.id;
    const canStatus = canEdit || isResp;
    return (
      <div key={a.id} className="rounded-md border p-2 space-y-2">
        <BlurText value={a.description} disabled={!canEdit} placeholder={t("audit.internal.actionDescription")}
          onSave={(v) => run(m.updateAction.mutateAsync({ id: a.id, patch: { description: v } }))} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <PersonPick value={a.responsible_user_id} disabled={!canEdit}
            onChange={(v) => run(m.updateAction.mutateAsync({ id: a.id, patch: { responsible_user_id: v } }))} />
          <Input type="date" value={a.deadline ?? ""} disabled={!canEdit}
            onChange={(e) => run(m.updateAction.mutateAsync({ id: a.id, patch: { deadline: e.target.value || null } }))} />
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
        {a.closed_at && <p className="text-xs text-muted-foreground">{t("audit.internal.closedAt", { date: new Date(a.closed_at).toLocaleDateString(i18n.language) })}</p>}
        {canEdit && (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => run(m.deleteAction.mutateAsync(a.id))} aria-label={t("audit.internal.delete")}><Trash2 className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
    );
  };

  const renderFinding = (f: FindingRow) => {
    const isResp = f.responsible_user_id === user?.id;
    const statusOptions = canEdit ? ["open", "in_progress", "verified", "closed"] : ["open", "in_progress"];
    const canStatus = canEdit || (isResp && (f.status === "open" || f.status === "in_progress"));
    return (
      <div key={f.id} className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{f.category}</Badge>
          {f.reference && <span className="text-xs text-muted-foreground">{f.reference}</span>}
          {f.verified_at && <Badge variant="outline" className="gap-1"><ShieldCheck className="w-3 h-3" />{t("audit.internal.verifiedAt", { date: new Date(f.verified_at).toLocaleDateString(i18n.language) })}</Badge>}
        </div>
        <BlurText multiline value={f.description} disabled={!canEdit} placeholder={t("audit.internal.descriptionPlaceholder")}
          onSave={(v) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { description: v } }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Select value={f.severity} disabled={!canEdit}
            onValueChange={(v) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { severity: v } }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">{t("audit.severity.critical")}</SelectItem>
              <SelectItem value="warning">{t("audit.severity.warning")}</SelectItem>
              <SelectItem value="info">{t("audit.severity.info")}</SelectItem>
            </SelectContent>
          </Select>
          <PersonPick value={f.responsible_user_id} disabled={!canEdit}
            onChange={(v) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { responsible_user_id: v } }))} />
          <Input type="date" value={f.deadline ?? ""} disabled={!canEdit}
            onChange={(e) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { deadline: e.target.value || null } }))} />
          <Select value={f.status} disabled={!canStatus}
            onValueChange={(v) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { status: v } }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from(new Set([...statusOptions, f.status])).map((s) => (
                <SelectItem key={s} value={s}>{t(`audit.internal.findingStatus.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 pl-2 border-l-2 border-muted">
          <div className="text-xs font-medium text-muted-foreground">{t("audit.internal.actions")}</div>
          {(f.audit_actions ?? []).length === 0 && <p className="text-xs text-muted-foreground">{t("audit.internal.noActions")}</p>}
          {(f.audit_actions ?? []).map(renderAction)}
        </div>
        {canEdit && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => run(m.createAction.mutateAsync({ finding: f, description: t("audit.internal.newAction") }))}>
              <Plus className="w-4 h-4 mr-1" />{t("audit.internal.addAction")}
            </Button>
            {f.status !== "verified" && f.status !== "closed" && (
              <Button size="sm" variant="outline" onClick={() => run(m.updateFinding.mutateAsync({ id: f.id, patch: { status: "verified" } }))}>
                <ShieldCheck className="w-4 h-4 mr-1" />{t("audit.internal.verify")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => run(m.deleteFinding.mutateAsync(f.id))} aria-label={t("audit.internal.delete")}><Trash2 className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-vv-center dialog-max-h max-h-[90vh] max-h-[90dvh] flex flex-col p-0 overflow-hidden max-w-4xl">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 space-y-1">
          <DialogTitle className="pr-8">{review.title}</DialogTitle>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{t(`audit.internal.reviewStatus.${review.status}`)}</Badge>
            <span>{t(`audit.tpl.template.${review.template_key}`)}</span>
            {unitName && <span>· {t("audit.internal.auditedUnit")}: {unitName}</span>}
            {!canEdit && <span>· {t("audit.internal.readOnly")}</span>}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [touch-action:pan-y] px-4 sm:px-6 py-3 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t("audit.internal.title")}</div>
              <BlurText value={review.title} disabled={!editChecklist} onSave={(v) => v.trim() && run(m.updateReview.mutateAsync({ id: review.id, patch: { title: v.trim() } }))} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t("audit.internal.date")}</div>
              <Input type="date" value={review.review_date} disabled={!editChecklist}
                onChange={(e) => e.target.value && run(m.updateReview.mutateAsync({ id: review.id, patch: { review_date: e.target.value } }))} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t("audit.internal.responsible")}</div>
              <PersonPick value={review.responsible_user_id} disabled={!editChecklist}
                onChange={(v) => run(m.updateReview.mutateAsync({ id: review.id, patch: { responsible_user_id: v } }))} />
            </div>
          </div>
          {editChecklist && review.status === "planned" && (
            <Button size="sm" variant="outline" onClick={() => run(m.updateReview.mutateAsync({ id: review.id, patch: { status: "in_progress" } }))}>
              {t("audit.internal.start")}
            </Button>
          )}

          <Accordion type="multiple" className="w-full">
            {sections.map((s) => {
              const items = [...(s.audit_checklist_items ?? [])].sort((a, b) => a.order_index - b.order_index);
              return (
                <AccordionItem key={s.id} value={s.id}>
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                      <span className="truncate">{sectionLabel(s.section_key)}</span>
                      <StatusPill status={s.status as any} labelOverride={t(`audit.internal.sectionStatus.${s.status}`)} />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    {items.map((it) => (
                      <div key={it.id} className="rounded-md border p-2 space-y-2">
                        <div>
                          <div className="text-sm">{it.label}</div>
                          {it.reference && <div className="text-xs text-muted-foreground">{it.reference}</div>}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {RESULTS.map((r) => (
                            <Button key={r} size="sm" type="button" disabled={!editChecklist}
                              variant={it.result === r ? "default" : "outline"} onClick={() => setResult(s, it, r)}>
                              {t(`audit.internal.result.${r}`)}
                            </Button>
                          ))}
                        </div>
                        <BlurText value={it.comment} disabled={!editChecklist} placeholder={t("audit.internal.comment")}
                          onSave={(v) => run(m.updateItem.mutateAsync({ id: it.id, patch: { comment: v || null } }))} />
                        {editChecklist && (it.result === "fail" || it.result === "warn") && (
                          <Button size="sm" variant="outline" onClick={() => run(m.createFinding.mutateAsync({
                            review, category: sectionLabel(s.section_key), description: it.label, reference: it.reference, severity: "warning",
                          }))}>
                            <Plus className="w-4 h-4 mr-1" />{t("audit.internal.makeFinding")}
                          </Button>
                        )}
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("audit.internal.findingsHeader")}</h3>
              {editChecklist && (
                <Button size="sm" variant="outline" onClick={() => run(m.createFinding.mutateAsync({ review, category: t("audit.internal.generalCategory"), description: t("audit.internal.newFinding") }))}>
                  <Plus className="w-4 h-4 mr-1" />{t("audit.internal.addFinding")}
                </Button>
              )}
            </div>
            {findings.length === 0 && <p className="text-sm text-muted-foreground">{t("audit.internal.noFindings")}</p>}
            {findings.map(renderFinding)}
          </div>

          {canEdit && !closed && openCritical > 0 && (
            <div className="rounded-md border border-status-yellow/60 p-3 space-y-2">
              <p className="text-sm">{t("audit.internal.closeBlocked")}</p>
              <Textarea rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder={t("audit.internal.overrideReason")} />
            </div>
          )}
          {closed && review.override_reason && (
            <p className="text-xs text-muted-foreground">{t("audit.internal.overrideReason")}: {review.override_reason}</p>
          )}
          {canEdit && closed && showReopen && (
            <div className="rounded-md border p-3 space-y-2">
              <Textarea rows={2} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder={t("audit.internal.reopenReason")} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3 sm:px-6">
          {canEdit && review.status === "planned" && (
            <Button variant="ghost" className="mr-auto" onClick={remove}><Trash2 className="w-4 h-4 mr-1" />{t("audit.internal.delete")}</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("audit.internal.closeDialog")}</Button>
          {canEdit && !closed && (
            <Button onClick={closeReview} disabled={openCritical > 0 && overrideReason.trim().length < 10}>{t("audit.internal.closeReview")}</Button>
          )}
          {canEdit && closed && (
            showReopen
              ? <Button onClick={reopen} disabled={reopenReason.trim().length < 10}>{t("audit.internal.reopen")}</Button>
              : <Button variant="outline" onClick={() => setShowReopen(true)}>{t("audit.internal.reopen")}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
