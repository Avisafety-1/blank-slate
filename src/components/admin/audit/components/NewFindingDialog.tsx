import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { suggestDeadline, type FindingSeverity } from "../lib/auditTemplates";
import { auditErrorMessage } from "../lib/auditErrors";
import { useInternalAuditMutations, type ReviewRow } from "../hooks/useInternalAudits";

export interface NewFindingPreset {
  category: string;
  description: string;
  reference: string | null;
  severity: FindingSeverity;
  checklistItemId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: ReviewRow;
  preset: NewFindingPreset;
  persons: { id: string; full_name: string | null }[];
  onShow: (findingId: string) => void;
}

export const NewFindingDialog = ({ open, onOpenChange, review, preset, persons, onShow }: Props) => {
  const { t } = useTranslation();
  const { createFinding } = useInternalAuditMutations();
  const [description, setDescription] = useState(preset.description);
  const [severity, setSeverity] = useState<FindingSeverity>(preset.severity);
  const [responsible, setResponsible] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string>(suggestDeadline(preset.severity) ?? "");
  const [deadlineTouched, setDeadlineTouched] = useState(false);

  const changeSeverity = (v: FindingSeverity) => {
    setSeverity(v);
    if (!deadlineTouched) setDeadline(suggestDeadline(v) ?? "");
  };

  const valid = description.trim().length > 0 && !!responsible;

  const submit = async () => {
    if (!valid || createFinding.isPending) return;
    try {
      const id = await createFinding.mutateAsync({
        review, category: preset.category, description: description.trim(), reference: preset.reference,
        severity, responsible_user_id: responsible, deadline: deadline || null, checklist_item_id: preset.checklistItemId,
      });
      onOpenChange(false);
      toast.success(t("audit.internal.findingCreated"), {
        action: { label: t("audit.internal.show"), onClick: () => onShow(id) },
      });
    } catch (e: any) {
      toast.error(auditErrorMessage(e, t));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-vv-center dialog-max-h max-h-[90vh] max-h-[90dvh] flex flex-col p-0 overflow-hidden max-w-lg">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle>{t("audit.internal.newFinding")}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [touch-action:pan-y] px-4 sm:px-6 py-2 space-y-3">
          <div className="space-y-1">
            <Label>{t("audit.internal.descriptionPlaceholder")}</Label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("audit.internal.level")}</Label>
            <Select value={severity} onValueChange={(v) => changeSeverity(v as FindingSeverity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">{t("audit.internal.levelLabel.critical")}</SelectItem>
                <SelectItem value="warning">{t("audit.internal.levelLabel.warning")}</SelectItem>
                <SelectItem value="info">{t("audit.internal.levelLabel.info")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("audit.internal.responsibleRequired")}</Label>
            <SearchablePersonSelect persons={persons} value={responsible} onValueChange={setResponsible}
              placeholder={t("audit.internal.selectPerson")} searchPlaceholder={t("audit.internal.searchPerson")}
              emptyText={t("audit.internal.noPersons")} />
            <p className="text-xs text-muted-foreground">{t("audit.internal.responsibleHelp")}</p>
            {responsible && responsible === review.responsible_user_id && (
              <p className="text-xs text-status-yellow">{t("audit.internal.auditorOwnsFinding")}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>{t("audit.internal.actionDeadline")}</Label>
            <Input type="date" value={deadline} onChange={(e) => { setDeadline(e.target.value); setDeadlineTouched(true); }} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("audit.internal.cancel")}</Button>
          <Button onClick={submit} disabled={!valid || createFinding.isPending}>{t("audit.internal.create")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
