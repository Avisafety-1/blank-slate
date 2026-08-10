import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DepartmentChecklist } from "@/components/admin/DepartmentChecklist";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Trash2, ChevronUp, ChevronDown, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ChecklistItem {
  id: string;
  text: string;
}

interface CreateChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateChecklistDialog = ({ open, onOpenChange, onSuccess }: CreateChecklistDialogProps) => {
  const { t } = useTranslation();
  const { user, companyId, isSuperAdmin } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [globalVisibility, setGlobalVisibility] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [isParentCompany, setIsParentCompany] = useState(false);
  const [visibleToChildren, setVisibleToChildren] = useState(false);
  const [otherCompanies, setOtherCompanies] = useState<{ id: string; navn: string }[]>([]);
  const [sharedDeptIds, setSharedDeptIds] = useState<string[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([
    { id: crypto.randomUUID(), text: "" }
  ]);

  // Detect if current company is a parent company
  useEffect(() => {
    if (!companyId || !open) return;
    const check = async () => {
      const { data } = await supabase
        .from("companies")
        .select("id")
        .eq("parent_company_id", companyId)
        .limit(1);
      setIsParentCompany((data?.length ?? 0) > 0);
    };
    check();
  }, [companyId, open]);

  // Load selectable companies for explicit sharing
  useEffect(() => {
    if (!open || !companyId) return;
    const load = async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, navn")
        .neq("id", companyId)
        .order("navn");
      setOtherCompanies((data as any[]) ?? []);
    };
    load();
  }, [open, companyId]);


  const handleAddItem = () => {
    setItems([...items, { id: crypto.randomUUID(), text: "" }]);
  };

  const handleMoveItem = (id: string, direction: 'up' | 'down') => {
    setItems(prev => {
      const idx = prev.findIndex(item => item.id === id);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const handleRemoveItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleItemChange = (id: string, text: string) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, text } : item
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !companyId) {
      toast.error(t('documents.checklistDialog.errors.loginRequired'));
      return;
    }

    if (!title.trim()) {
      toast.error(t('documents.checklistDialog.errors.nameRequired'));
      return;
    }

    const validItems = items.filter(item => item.text.trim());
    if (validItems.length === 0) {
      toast.error(t('documents.checklistDialog.errors.itemRequired'));
      return;
    }

    setIsSubmitting(true);

    try {
      // Store checklist items as JSON in beskrivelse field
      const checklistData = JSON.stringify(validItems.map(item => ({
        id: item.id,
        text: item.text.trim()
      })));

      const { data: inserted, error } = await supabase
        .from("documents")
        .insert({
          tittel: title.trim(),
          kategori: "sjekklister",
          beskrivelse: checklistData,
          company_id: companyId,
          user_id: user.id,
          opprettet_av: user.email || t('common.unknownName'),
          global_visibility: isSuperAdmin ? globalVisibility : false,
          visible_to_children: isParentCompany ? visibleToChildren : false,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Persist explicit per-department sharing
      if (inserted?.id && sharedDeptIds.length > 0) {
        const { error: shareError } = await supabase
          .from("document_department_visibility")
          .upsert(
            sharedDeptIds.map((cid) => ({ document_id: inserted.id, company_id: cid })),
            { onConflict: "document_id,company_id" }
          );
        if (shareError) throw shareError;
      }

      toast.success(t('documents.checklistDialog.success'));
      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating checklist:", error);
      toast.error(t('documents.checklistDialog.errors.createFailed', { message: error.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setGlobalVisibility(false);
    setVisibleToChildren(false);
    setSharedDeptIds([]);
    setVisibilityOpen(false);
    setItems([{ id: crypto.randomUUID(), text: "" }]);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('documents.checklistDialog.title')}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">{t('documents.checklistDialog.nameLabel')}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('documents.checklistDialog.namePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t('documents.checklistDialog.itemsLabel')}</Label>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <div className="flex flex-col flex-shrink-0">
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveItem(item.id, 'up')} disabled={index === 0}>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveItem(item.id, 'down')} disabled={index === items.length - 1}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                  <Input
                    value={item.text}
                    onChange={(e) => handleItemChange(item.id, e.target.value)}
                    placeholder={t('documents.checklistDialog.itemPlaceholder')}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={items.length === 1}
                    className="flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="w-full mt-2"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('documents.checklistDialog.addItem')}
            </Button>
          </div>

          {/* Visibility & sharing */}
          <Collapsible open={visibilityOpen} onOpenChange={setVisibilityOpen} className="rounded-lg border bg-muted/30">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between p-3 text-left">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  {t("documents.cardModal.visibilitySectionTitle")}
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", visibilityOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 p-3 pt-0">
              {isSuperAdmin && (
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="new-checklist-global">{t("documents.cardModal.globalVisibilityLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("documents.cardModal.globalVisibilityDescription")}</p>
                  </div>
                  <Switch
                    id="new-checklist-global"
                    checked={globalVisibility}
                    onCheckedChange={setGlobalVisibility}
                  />
                </div>
              )}

              {isParentCompany && (
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="new-checklist-children">{t("documents.cardModal.visibleToChildrenLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("documents.cardModal.visibleToChildrenDescription")}</p>
                  </div>
                  <Switch
                    id="new-checklist-children"
                    checked={visibleToChildren}
                    onCheckedChange={setVisibleToChildren}
                  />
                </div>
              )}

              {!globalVisibility && otherCompanies.length > 0 && (
                <div className="space-y-1.5">
                  <Label>{t("documents.cardModal.sharedDepartmentsLabel")}</Label>
                  <DepartmentChecklist
                    departments={otherCompanies}
                    selectedIds={sharedDeptIds}
                    onToggle={(id, checked) =>
                      setSharedDeptIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
                    }
                    allSelected={false}
                    onToggleAll={(checked) =>
                      setSharedDeptIds(checked ? otherCompanies.map((c) => c.id) : [])
                    }
                    allLabel={t("documents.cardModal.selectAllDepartments")}
                  />
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>


          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('documents.checklistDialog.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('documents.checklistDialog.submitting') : t('documents.checklistDialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
