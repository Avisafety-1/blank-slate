import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { Plus, Trash2, ShieldCheck, ArrowRight, BellRing } from "lucide-react";
import { SendReminderDialog } from "../SendReminderDialog";
import type { RecipientSuggestion } from "../services/ReminderRecipientResolver";
import type { ScannerFinding } from "../types";
import { auditDeepLink } from "../utils/auditDeepLink";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { StatusPill } from "./StatusPill";
import { NewFindingDialog, type NewFindingPreset } from "./NewFindingDialog";
import {
  computeSectionStatus, closeBlockers, onlyCriticalBlocks, findingDisplayStatus, defaultSeverityForResult,
  templateItemLabel, templateSectionLabel, type ChecklistResult,
} from "../lib/auditTemplates";
import { auditErrorMessage } from "../lib/auditErrors";
import {
  useInternalAuditMutations, useSaveStatus, waitForSaves,
  type ReviewRow, type FindingRow, type ActionRow, type ChecklistItemRow, type SectionRow,
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
const SEV_ORDER = { critical: 0, warning: 1, info: 2 } as const;

/** Text field that saves on blur when the value changed. */
export const BlurText = ({ value, onSave, disabled, multiline, placeholder, type }: {
  value: string | null; onSave: (v: string) => void; disabled?: boolean; multiline?: boolean; placeholder?: string; type?: string;
}) => {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const props = {
    value: v, disabled, placeholder,
    onChange: (e: any) => setV(e.target.value),
    onBlur: () => { if (v !== (value ?? "")) onSave(v); },
  };
  return multiline ? <Textarea rows={2} {...props} /> : <Input type={type} {...props} />;
};

type Tab = "checklist" | "findings" | "summary";

export const AuditDetailDialog = ({ review, open, onOpenChange, canEdit, persons, unitName }: Props) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const m = useInternalAuditMutations();
  const save = useSaveStatus();
  const [tab, setTab] = useState<Tab>("checklist");
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [focus, setFocus] = useState<{ id: string; tab: Tab } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [showReopen, setShowReopen] = useState(false);
  const [newFinding, setNewFinding] = useState<NewFindingPreset | null>(null);
  const [closing, setClosing] = useState<FindingRow | null>(null);
  const [closureComment, setClosureComment] = useState("");
  const [dialogClosing, setDialogClosing] = useState(false);
  const refs = useRef(new Map<string, HTMLElement>());

  const closed = review.status === "closed";
  const editChecklist = canEdit && !closed;
  const sections = useMemo(() => [...(review.audit_sections ?? [])].sort((a, b) => a.order_index - b.order_index), [review]);
  const allItems = useMemo(() => sections.flatMap((s) => [...(s.audit_checklist_items ?? [])].sort((a, b) => a.order_index - b.order_index)
    .map((i) => ({ ...i, sectionId: s.id }))), [sections]);
  const findings = useMemo(() => [...(review.audit_findings ?? [])].sort((a, b) =>
    SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")), [review]);
  const blockers = closeBlockers(allItems, findings);
  const overrideOnly = onlyCriticalBlocks(blockers);
  const sectionLabel = (key: string) => templateSectionLabel(key, key, t);
  const itemLabel = (it: { item_key: string | null; label: string }) => templateItemLabel(it.item_key, it.label, t);

  // Scroll to and briefly highlight a target after tab switch renders it.
  useEffect(() => {
    if (!focus || focus.tab !== tab) return;
    const timer = window.setTimeout(() => {
      refs.current.get(focus.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlight(focus.id);
      setFocus(null);
      window.setTimeout(() => setHighlight((h) => (h === focus.id ? null : h)), 2000);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focus, tab]);

  const goToFinding = (id: string) => { setTab("findings"); setFocus({ id, tab: "findings" }); };
  const goToItem = (id: string) => {
    const it = allItems.find((i) => i.id === id);
    if (it) setOpenSections((s) => (s.includes(it.sectionId) ? s : [...s, it.sectionId]));
    setTab("checklist"); setFocus({ id, tab: "checklist" });
  };
  const setRef = (id: string) => (el: HTMLElement | null) => { if (el) refs.current.set(id, el); else refs.current.delete(id); };

  const run = async (p: Promise<unknown>) => {
    try { await p; return true; } catch (e: any) { toast.error(auditErrorMessage(e, t)); return false; }
  };

  const handleOpenChange = async (o: boolean) => {
    if (o) return onOpenChange(true);
    setDialogClosing(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    await new Promise((r) => setTimeout(r, 0));
    await waitForSaves();
    setDialogClosing(false);
    onOpenChange(false);
  };

  const setResult = (section: SectionRow, item: ChecklistItemRow, result: ChecklistResult) => {
    const results = section.audit_checklist_items.map((i) => (i.id === item.id ? result : i.result));
    run(m.updateItem.mutateAsync({ id: item.id, patch: { result }, sectionId: section.id, sectionStatus: computeSectionStatus(results) }));
  };

  const closeReview = () =>
    run(m.updateReview.mutateAsync({ id: review.id, patch: { status: "closed", override_reason: overrideReason.trim() || review.override_reason } }));
  const reopen = () =>
    run(m.updateReview.mutateAsync({ id: review.id, patch: { status: "in_progress", reopen_reason: reopenReason.trim() } }))
      .then((ok) => { if (ok) { setShowReopen(false); setReopenReason(""); } });
  const remove = () => {
    if (!window.confirm(t("audit.internal.deleteConfirm"))) return;
    run(m.deleteReview.mutateAsync(review.id)).then((ok) => ok && onOpenChange(false));
  };

  const isSelf = (f: FindingRow) => !!user?.id && (f.responsible_user_id === user.id || (f.audit_actions ?? []).some((a) => a.responsible_user_id === user.id));
  const commentRequired = (f: FindingRow) => f.severity === "info" || isSelf(f);
  const confirmClose = async () => {
    if (!closing) return;
    const ok = await run(m.updateFinding.mutateAsync({ id: closing.id, patch: { status: "verified", closure_comment: closureComment.trim() || null } }));
    if (ok) { setClosing(null); setClosureComment(""); }
  };

  const [reminder, setReminder] = useState<{ finding: ScannerFinding; recipients: RecipientSuggestion[] } | null>(null);
  const openReminder = (f: FindingRow, a?: ActionRow) => {
    const rid = a ? a.responsible_user_id : f.responsible_user_id;
    if (!rid) return;
    const p = (persons as Array<{ id: string; full_name?: string | null; email?: string | null }> | undefined)?.find((x) => x.id === rid);
    setReminder({
      finding: {
        code: "AuditReminder", severity: f.severity, categoryKey: "operations" as ScannerFinding["categoryKey"],
        titleKey: "audit.internal.reminderSubject",
        titleParams: { description: (a?.description ?? f.description).slice(0, 80) },
        entityType: a ? "audit_action" : "audit_finding", entityId: a?.id ?? f.id,
        deepLink: auditDeepLink("audit_finding", f.id),
      },
      recipients: [{ id: rid, full_name: p?.full_name ?? null, email: p?.email ?? null, reason: t("audit.internal.responsible") }],
    });
  };
  const reminderButton = (f: FindingRow, a?: ActionRow) =>
    canEdit && (a ? a.responsible_user_id && a.status !== "closed" : f.responsible_user_id) ? (
      <Button size="sm" variant="ghost" onClick={() => openReminder(f, a)}>
        <BellRing className="w-4 h-4 mr-1" />{t("audit.internal.sendReminder")}
      </Button>
    ) : null;

  const personPick = (value: string | null, onChange: (v: string | null) => void, disabled?: boolean) => (
    <SearchablePersonSelect persons={persons} value={value} onValueChange={onChange} allowNone disabled={disabled}
      placeholder={t("audit.internal.selectPerson")} searchPlaceholder={t("audit.internal.searchPerson")}
      emptyText={t("audit.internal.noPersons")} noneLabel={t("audit.internal.none")} />
  );

  const renderAction = (a: ActionRow) => {
    const canStatus = canEdit || a.responsible_user_id === user?.id;
    return (
      <div key={a.id} className="rounded-md border p-2 space-y-2">
        <BlurText value={a.description} disabled={!canEdit} placeholder={t("audit.internal.actionDescription")}
          onSave={(v) => run(m.updateAction.mutateAsync({ id: a.id, patch: { description: v } }))} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {personPick(a.responsible_user_id, (v) => run(m.updateAction.mutateAsync({ id: a.id, patch: { responsible_user_id: v } })), !canEdit)}
          <BlurText type="date" value={a.deadline} disabled={!canEdit}
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
        {a.closed_at && <p className="text-xs text-muted-foreground">{t("audit.internal.closedAt", { date: new Date(a.closed_at).toLocaleDateString(i18n.language) })}</p>}
        {canEdit && (
          <div className="flex justify-end gap-2">
            {(() => { const f = review.audit_findings.find((x) => x.id === a.finding_id); return f ? reminderButton(f, a) : null; })()}
            <Button size="sm" variant="ghost" onClick={() => run(m.deleteAction.mutateAsync(a.id))} aria-label={t("audit.internal.delete")}><Trash2 className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
    );
  };

  const renderFinding = (f: FindingRow) => {
    const actions = f.audit_actions ?? [];
    const display = findingDisplayStatus(f.status, actions.map((a) => a.status));
    const verified = display === "verified";
    const isResp = f.responsible_user_id === user?.id;
    const canStatus = (canEdit || isResp) && !verified;
    const statusValue = verified ? "verified" : f.status;
    return (
      <div key={f.id} ref={setRef(f.id)}
        className={cn("rounded-lg border p-3 space-y-2 transition-colors", highlight === f.id && "ring-2 ring-primary bg-primary/5")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={f.severity === "critical" ? "destructive" : "outline"}>{t(`audit.internal.levelLabel.${f.severity}`)}</Badge>
          <Badge variant="outline">{f.category}</Badge>
          <Badge variant="secondary">{t(`audit.internal.displayStatus.${display}`)}</Badge>
          {verified && f.self_verified && <Badge variant="outline" className="border-status-yellow text-status-yellow">{t("audit.internal.selfVerified")}</Badge>}
          {f.reference && <span className="text-xs text-muted-foreground">{f.reference}</span>}
          {f.verified_at && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" />{t("audit.internal.verifiedAt", { date: new Date(f.verified_at).toLocaleDateString(i18n.language) })}</span>}
        </div>
        <BlurText multiline value={f.description} disabled={!canEdit || verified} placeholder={t("audit.internal.descriptionPlaceholder")}
          onSave={(v) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { description: v } }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Select value={f.severity} disabled={!canEdit || verified}
            onValueChange={(v) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { severity: v } }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">{t("audit.internal.levelLabel.critical")}</SelectItem>
              <SelectItem value="warning">{t("audit.internal.levelLabel.warning")}</SelectItem>
              <SelectItem value="info">{t("audit.internal.levelLabel.info")}</SelectItem>
            </SelectContent>
          </Select>
          {personPick(f.responsible_user_id, (v) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { responsible_user_id: v } })), !canEdit || verified)}
          <BlurText type="date" value={f.deadline} disabled={!canEdit || verified}
            onSave={(v) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { deadline: v || null } }))} />
          <Select value={statusValue} disabled={!canStatus && !(canEdit && verified)}
            onValueChange={(v) => run(m.updateFinding.mutateAsync({ id: f.id, patch: { status: v } }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{t("audit.internal.displayStatus.open")}</SelectItem>
              <SelectItem value="in_progress">{t("audit.internal.displayStatus.in_progress")}</SelectItem>
              {verified && <SelectItem value="verified" disabled>{t("audit.internal.displayStatus.verified")}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t("audit.task.rootCause")}: {f.root_cause || t("audit.task.noRootCause")}</p>
        {f.closure_comment && (
          <p className="text-xs text-muted-foreground">{t("audit.internal.closureComment")}: {f.closure_comment}</p>
        )}
        <div className="space-y-2 pl-2 border-l-2 border-muted">
          <div className="text-xs font-medium text-muted-foreground">{t("audit.internal.actions")}</div>
          {actions.length === 0 && <p className="text-xs text-muted-foreground">{t("audit.internal.noActions")}</p>}
          {actions.map(renderAction)}
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!verified && (
              <Button size="sm" variant="outline" onClick={() => run(m.createAction.mutateAsync({ finding: f, description: t("audit.internal.newAction") }))}>
                <Plus className="w-4 h-4 mr-1" />{t("audit.internal.addAction")}
              </Button>
            )}
            {!verified && f.severity === "info" && (
              <Button size="sm" variant="outline" onClick={() => { setClosing(f); setClosureComment(""); }}>
                {t("audit.internal.closeObservation")}
              </Button>
            )}
            {display === "ready" && f.severity !== "info" && (
              <Button size="sm" onClick={() => { setClosing(f); setClosureComment(""); }}>
                <ShieldCheck className="w-4 h-4 mr-1" />{t("audit.internal.verifyAndClose")}
              </Button>
            )}
            {!verified && reminderButton(f)}
            <Button size="sm" variant="ghost" onClick={() => run(m.deleteFinding.mutateAsync(f.id))} aria-label={t("audit.internal.delete")}><Trash2 className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
    );
  };

  const findingForItem = (itemId: string) => findings.find((f) => f.checklist_item_id === itemId);
  const openFindings = findings.filter((f) => f.status !== "verified" && f.status !== "closed");
  const saveText = save.pending > 0
    ? t("audit.internal.saving")
    : save.error
      ? t("audit.internal.saveFailed")
      : save.savedAt
        ? t("audit.internal.savedAt", { time: save.savedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) })
        : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="dialog-vv-center dialog-max-h max-h-[90vh] max-h-[90dvh] flex flex-col p-0 overflow-hidden max-w-4xl">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex flex-col flex-1 min-h-0">
          <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 space-y-2">
            <DialogTitle className="pr-8">{review.title}</DialogTitle>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{t(`audit.internal.reviewStatus.${review.status}`)}</Badge>
              <span>{t(`audit.tpl.template.${review.template_key}`)}</span>
              {unitName && <span>· {t("audit.internal.auditedUnit")}: {unitName}</span>}
              {!canEdit && <span>· {t("audit.internal.readOnly")}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
              <span className="text-muted-foreground">{t("audit.internal.autoSave")}</span>
              {saveText && <span className={save.error && save.pending === 0 ? "text-destructive font-medium" : "text-muted-foreground"}>· {saveText}</span>}
            </div>
            <TabsList className="w-full sm:w-auto justify-start overflow-x-auto">
              <TabsTrigger value="checklist">{t("audit.internal.tabChecklist")}</TabsTrigger>
              <TabsTrigger value="findings">{t("audit.internal.tabFindings", { count: findings.length })}</TabsTrigger>
              <TabsTrigger value="summary">{t("audit.internal.tabSummary")}</TabsTrigger>
            </TabsList>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [touch-action:pan-y] px-4 sm:px-6 py-3">
            <TabsContent value="checklist" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{t("audit.internal.title")}</div>
                  <BlurText value={review.title} disabled={!editChecklist} onSave={(v) => v.trim() && run(m.updateReview.mutateAsync({ id: review.id, patch: { title: v.trim() } }))} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{t("audit.internal.date")}</div>
                  <BlurText type="date" value={review.review_date} disabled={!editChecklist}
                    onSave={(v) => v && run(m.updateReview.mutateAsync({ id: review.id, patch: { review_date: v } }))} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{t("audit.internal.responsible")}</div>
                  {personPick(review.responsible_user_id, (v) => run(m.updateReview.mutateAsync({ id: review.id, patch: { responsible_user_id: v } })), !editChecklist)}
                </div>
              </div>

              <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="w-full">
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
                        {items.map((it) => {
                          const deviation = it.result === "warn" || it.result === "fail";
                          const existing = findingForItem(it.id);
                          return (
                            <div key={it.id} ref={setRef(it.id)}
                              className={cn("rounded-md border p-2 space-y-2 transition-colors", highlight === it.id && "ring-2 ring-primary bg-primary/5")}>
                              <div>
                                <div className="text-sm">{itemLabel(it)}</div>
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
                              <div className="space-y-1">
                                <Label className={cn("text-xs", deviation && !(it.comment ?? "").trim() && "text-destructive")}>
                                  {deviation ? t("audit.internal.reasonRequired") : t("audit.internal.comment")}
                                </Label>
                                <BlurText value={it.comment} disabled={!editChecklist}
                                  onSave={(v) => run(m.updateItem.mutateAsync({ id: it.id, patch: { comment: v || null } }))} />
                              </div>
                              {existing ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary">{t("audit.internal.findingExists")}</Badge>
                                  <Button size="sm" variant="outline" onClick={() => goToFinding(existing.id)}>
                                    {t("audit.internal.goToFinding")}<ArrowRight className="w-4 h-4 ml-1" />
                                  </Button>
                                </div>
                              ) : editChecklist && deviation && (
                                <Button size="sm" variant="outline" onClick={() => setNewFinding({
                                  category: sectionLabel(s.section_key),
                                  description: [itemLabel(it), it.comment].filter(Boolean).join("\n"),
                                  reference: it.reference, severity: defaultSeverityForResult(it.result), checklistItemId: it.id,
                                })}>
                                  <Plus className="w-4 h-4 mr-1" />{t("audit.internal.makeFinding")}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </TabsContent>

            <TabsContent value="findings" className="mt-0 space-y-3">
              {editChecklist && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setNewFinding({
                    category: t("audit.internal.generalCategory"), description: "", reference: null, severity: "warning", checklistItemId: null,
                  })}>
                    <Plus className="w-4 h-4 mr-1" />{t("audit.internal.addFinding")}
                  </Button>
                </div>
              )}
              {findings.length === 0 && <p className="text-sm text-muted-foreground">{t("audit.internal.noFindings")}</p>}
              {findings.map(renderFinding)}
            </TabsContent>

            <TabsContent value="summary" className="mt-0 space-y-5">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{t("audit.internal.assessedPerSection")}</h3>
                <ul className="space-y-1 text-sm">
                  {sections.map((s) => {
                    const items = s.audit_checklist_items ?? [];
                    const done = items.filter((i) => i.result !== "unknown").length;
                    return (
                      <li key={s.id} className="flex justify-between gap-2">
                        <span>{sectionLabel(s.section_key)}</span>
                        <span className={done < items.length ? "text-status-yellow" : "text-muted-foreground"}>{done}/{items.length}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{t("audit.internal.findingsPerLevel")}</h3>
                <div className="flex flex-wrap gap-2">
                  {(["critical", "warning", "info"] as const).map((sv) => (
                    <Badge key={sv} variant="outline">{t(`audit.internal.levelLabel.${sv}`)}: {findings.filter((f) => f.severity === sv).length}</Badge>
                  ))}
                  <Badge variant="secondary">{t("audit.internal.openFindings")}: {openFindings.length}</Badge>
                </div>
              </div>
              {!closed && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">{t("audit.internal.blockersHeader")}</h3>
                  {blockers.length === 0 && <p className="text-sm text-muted-foreground">{t("audit.internal.noBlockers")}</p>}
                  <ul className="space-y-1">
                    {blockers.map((b) => {
                      const id = b.kind === "openCritical" ? b.findingId : b.itemId;
                      const label = b.kind === "openCritical"
                        ? findings.find((f) => f.id === id)?.description
                        : (() => { const it = allItems.find((i) => i.id === id); return it ? itemLabel(it) : undefined; })();
                      return (
                        <li key={`${b.kind}-${id}`}>
                          <button type="button" className="text-left text-sm underline-offset-2 hover:underline text-primary"
                            onClick={() => (b.kind === "openCritical" ? goToFinding(id) : goToItem(id))}>
                            {t(`audit.internal.blocker.${b.kind}`)}: {label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {canEdit && !closed && (
                <div className="space-y-2 rounded-md border p-3">
                  {overrideOnly && (
                    <>
                      <p className="text-sm">{t("audit.internal.closeBlocked")}</p>
                      <Textarea rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder={t("audit.internal.overrideReason")} />
                    </>
                  )}
                  <div className="flex justify-end">
                    <Button onClick={closeReview}
                      disabled={blockers.length > 0 && !(overrideOnly && overrideReason.trim().length >= 10)}>
                      {t("audit.internal.closeReview")}
                    </Button>
                  </div>
                </div>
              )}
              {closed && review.override_reason && (
                <p className="text-xs text-muted-foreground">{t("audit.internal.overrideReason")}: {review.override_reason}</p>
              )}
              {canEdit && closed && (
                <div className="space-y-2 rounded-md border p-3">
                  {showReopen && <Textarea rows={2} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder={t("audit.internal.reopenReason")} />}
                  <div className="flex justify-end">
                    {showReopen
                      ? <Button onClick={reopen} disabled={reopenReason.trim().length < 10}>{t("audit.internal.reopen")}</Button>
                      : <Button variant="outline" onClick={() => setShowReopen(true)}>{t("audit.internal.reopen")}</Button>}
                  </div>
                </div>
              )}
            </TabsContent>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3 sm:px-6">
            {canEdit && review.status === "planned" && (
              <Button variant="ghost" className="mr-auto" onClick={remove}><Trash2 className="w-4 h-4 mr-1" />{t("audit.internal.delete")}</Button>
            )}
            <Button variant="outline" disabled={dialogClosing} onClick={() => handleOpenChange(false)}>{t("audit.internal.closeDialog")}</Button>
          </div>
        </Tabs>

        {newFinding && (
          <NewFindingDialog open onOpenChange={(o) => !o && setNewFinding(null)} review={review} preset={newFinding}
            persons={persons} onShow={goToFinding} />
        )}

        <SendReminderDialog finding={reminder?.finding ?? null} open={!!reminder}
          onOpenChange={(o) => !o && setReminder(null)} presetRecipients={reminder?.recipients} />

        <Dialog open={!!closing} onOpenChange={(o) => !o && setClosing(null)}>
          <DialogContent className="dialog-vv-center dialog-max-h max-h-[90vh] max-h-[90dvh] flex flex-col p-0 overflow-hidden max-w-md">
            <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
              <DialogTitle>{closing?.severity === "info" ? t("audit.internal.closeObservation") : t("audit.internal.verifyAndClose")}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [touch-action:pan-y] px-4 sm:px-6 py-2 space-y-2">
              {closing?.severity !== "info" && <p className="text-sm text-muted-foreground">{t("audit.internal.verifyHelp")}</p>}
              {closing && isSelf(closing) && <p className="text-sm text-status-yellow">{t("audit.internal.selfVerifyWarning")}</p>}
              <Label>{closing && commentRequired(closing) ? t("audit.internal.closureCommentRequired") : t("audit.internal.closureCommentOptional")}</Label>
              <Textarea rows={3} value={closureComment} onChange={(e) => setClosureComment(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3 sm:px-6">
              <Button variant="outline" onClick={() => setClosing(null)}>{t("audit.internal.cancel")}</Button>
              <Button onClick={confirmClose}
                disabled={m.updateFinding.isPending || (!!closing && commentRequired(closing) && closureComment.trim().length < 10)}>
                {t("audit.internal.confirm")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};
