import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { useAuth } from "@/contexts/AuthContext";
import { AUDIT_TEMPLATE_KEYS, buildTemplatePayload, type AuditTemplateKey } from "../lib/auditTemplates";
import { auditErrorMessage } from "../lib/auditErrors";
import { useInternalAuditMutations } from "../hooks/useInternalAudits";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persons: { id: string; full_name: string | null }[];
  departments: { id: string; name: string }[];
  onCreated: (id: string) => void;
}

export const NewInternalAuditDialog = ({ open, onOpenChange, persons, departments, onCreated }: Props) => {
  const { t } = useTranslation();
  const { companyId } = useAuth();
  const { createReview } = useInternalAuditMutations();
  const [title, setTitle] = useState(t("audit.internal.newTitle", { year: new Date().getFullYear() }));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [responsible, setResponsible] = useState<string | null>(null);
  const [template, setTemplate] = useState<AuditTemplateKey>("specific");
  const [unit, setUnit] = useState<string>(companyId ?? "");

  const submit = async () => {
    if (!title.trim()) return;
    try {
      const id = await createReview.mutateAsync({
        title: title.trim(), review_date: date, responsible_user_id: responsible, template_key: template,
        audited_company_id: unit || companyId, sections: buildTemplatePayload(template, t),
      });
      onOpenChange(false);
      onCreated(id as string);
    } catch (e: any) {
      toast.error(auditErrorMessage(e, t));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-vv-center dialog-max-h max-h-[90vh] max-h-[90dvh] flex flex-col p-0 overflow-hidden max-w-lg">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle>{t("audit.internal.new")}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [touch-action:pan-y] px-4 sm:px-6 py-2 space-y-3">
          <div className="space-y-1"><Label>{t("audit.internal.title")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label>{t("audit.internal.date")}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>{t("audit.internal.responsible")}</Label>
            <SearchablePersonSelect persons={persons} value={responsible} onValueChange={setResponsible} allowNone
              placeholder={t("audit.internal.selectPerson")} searchPlaceholder={t("audit.internal.searchPerson")}
              emptyText={t("audit.internal.noPersons")} noneLabel={t("audit.internal.none")} />
          </div>
          <div className="space-y-1">
            <Label>{t("audit.internal.template")}</Label>
            <Select value={template} onValueChange={(v) => setTemplate(v as AuditTemplateKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUDIT_TEMPLATE_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`audit.tpl.template.${k}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {departments.length > 1 && (
            <div className="space-y-1">
              <Label>{t("audit.internal.auditedUnit")}</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("audit.internal.cancel")}</Button>
          <Button onClick={submit} disabled={createReview.isPending || !title.trim()}>{t("audit.internal.create")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
