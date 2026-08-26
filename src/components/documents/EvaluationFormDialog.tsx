import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, ChevronUp, ChevronDown, Globe, Layers, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import EvaluationFormPreview from "@/components/evaluation/EvaluationFormPreview";
import {
  useEvaluationTemplates,
  type EvaluationCategory,
  type EvaluationTemplate,
} from "@/hooks/useEvaluationTemplates";

interface EvaluationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EvaluationTemplate | null;
  onSuccess?: () => void;
}

const emptySub = () => ({ id: crypto.randomUUID(), name: "", description: "" });
const emptyCategory = (): EvaluationCategory => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  subcategories: [emptySub()],
});

export const EvaluationFormDialog = ({ open, onOpenChange, template, onSuccess }: EvaluationFormDialogProps) => {
  const { t } = useTranslation();
  const { isAdmin, isSuperAdmin } = useAuth();
  const { saveTemplate } = useEvaluationTemplates();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [globalVisibility, setGlobalVisibility] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);
  const [categories, setCategories] = useState<EvaluationCategory[]>([emptyCategory()]);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setTitle(template.title);
      setDescription(template.description ?? "");
      setGlobalVisibility(template.global_visibility);
      setAdminOnly(!!template.admin_only);
      setCategories(template.structure.length ? template.structure : [emptyCategory()]);
    } else {
      setTitle("");
      setDescription("");
      setGlobalVisibility(false);
      setAdminOnly(false);
      setCategories([emptyCategory()]);
    }
  }, [open, template]);

  const updateCategory = (id: string, patch: Partial<EvaluationCategory>) =>
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const moveCategory = (id: string, dir: "up" | "down") =>
    setCategories((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });

  const updateSub = (catId: string, subId: string, patch: Partial<{ name: string; description: string }>) =>
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, subcategories: c.subcategories.map((s) => (s.id === subId ? { ...s, ...patch } : s)) }
          : c
      )
    );

  const moveSub = (catId: string, subId: string, dir: "up" | "down") =>
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        const idx = c.subcategories.findIndex((s) => s.id === subId);
        const swap = dir === "up" ? idx - 1 : idx + 1;
        if (idx < 0 || swap < 0 || swap >= c.subcategories.length) return c;
        const subs = [...c.subcategories];
        [subs[idx], subs[swap]] = [subs[swap], subs[idx]];
        return { ...c, subcategories: subs };
      })
    );

  const cleaned = useMemo(
    () =>
      categories
        .map((c) => ({
          ...c,
          name: c.name.trim(),
          description: c.description.trim(),
          subcategories: c.subcategories
            .map((s) => ({ ...s, name: s.name.trim(), description: s.description.trim() }))
            .filter((s) => s.name),
        }))
        .filter((c) => c.name && c.subcategories.length > 0),
    [categories]
  );

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error(t("evaluation.errors.titleRequired"));
      return;
    }
    if (cleaned.length === 0) {
      toast.error(t("evaluation.errors.categoryRequired"));
      return;
    }
    try {
      await saveTemplate.mutateAsync({
        id: template?.id,
        title,
        description,
        structure: cleaned,
        global_visibility: globalVisibility,
        admin_only: adminOnly,
      });
      toast.success(template ? t("evaluation.toasts.updated") : t("evaluation.toasts.created"));
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message ?? t("evaluation.errors.saveFailed"));
    }
  };

  const builder = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("evaluation.builder.titleLabel")}</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("evaluation.builder.titlePlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("evaluation.builder.descriptionLabel")}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("evaluation.builder.descriptionPlaceholder")}
          rows={2}
        />
      </div>

      {isSuperAdmin && (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{t("evaluation.builder.globalVisibility")}</span>
          </div>
          <Switch checked={globalVisibility} onCheckedChange={setGlobalVisibility} />
        </div>
      )}

      {(isAdmin || isSuperAdmin) && (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm">{t("evaluation.builder.adminOnly")}</p>
              <p className="text-xs text-muted-foreground">{t("evaluation.builder.adminOnlyHint")}</p>
            </div>
          </div>
          <Switch checked={adminOnly} onCheckedChange={setAdminOnly} />
        </div>
      )}

      <div className="space-y-3">
        {categories.map((category, index) => (
          <Card key={category.id} className="p-3 space-y-3 bg-muted/40 border-border/70">
            <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("evaluation.builder.categoryLabel", { index: index + 1 })}
              </span>
              <div className="flex items-center gap-0.5">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveCategory(category.id, "up")} disabled={index === 0}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveCategory(category.id, "down")} disabled={index === categories.length - 1}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCategories((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== category.id) : prev))}
                  disabled={categories.length === 1}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Input
                value={category.name}
                onChange={(e) => updateCategory(category.id, { name: e.target.value })}
                placeholder={t("evaluation.builder.categoryPlaceholder")}
                className="bg-background font-medium"
              />
              <Input
                value={category.description}
                onChange={(e) => updateCategory(category.id, { description: e.target.value })}
                placeholder={t("evaluation.builder.categoryDescriptionPlaceholder")}
                className="bg-background"
              />
            </div>


            <div className="space-y-3 pl-3 border-l-2 border-border">
              {category.subcategories.map((sub, subIndex) => (
                <div
                  key={sub.id}
                  className="group relative rounded-xl border bg-background p-3 pt-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="absolute -left-[1.45rem] top-4 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-[10px] font-bold text-muted-foreground">
                    {subIndex + 1}
                  </span>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={sub.name}
                        onChange={(e) => updateSub(category.id, sub.id, { name: e.target.value })}
                        placeholder={t("evaluation.builder.subcategoryPlaceholder")}
                        className="font-medium"
                      />
                      <Textarea
                        value={sub.description}
                        onChange={(e) => updateSub(category.id, sub.id, { description: e.target.value })}
                        placeholder={t("evaluation.builder.subcategoryDescriptionPlaceholder")}
                        rows={2}
                        className="text-sm bg-muted/40"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => moveSub(category.id, sub.id, "up")} disabled={subIndex === 0}>
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => moveSub(category.id, sub.id, "down")} disabled={subIndex === category.subcategories.length - 1}>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute -right-2 -top-2 h-7 w-7 rounded-full shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:hidden"
                    onClick={() =>
                      updateCategory(category.id, {
                        subcategories:
                          category.subcategories.length > 1
                            ? category.subcategories.filter((s) => s.id !== sub.id)
                            : category.subcategories,
                      })
                    }
                    disabled={category.subcategories.length === 1}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                onClick={() => updateCategory(category.id, { subcategories: [...category.subcategories, emptySub()] })}
                className="w-full border-2 border-dashed border-border text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("evaluation.builder.addSubcategory")}
              </Button>
            </div>

          </Card>
        ))}

        <Button type="button" variant="secondary" onClick={() => setCategories((prev) => [...prev, emptyCategory()])} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          {t("evaluation.builder.addCategory")}
        </Button>
      </div>
    </div>
  );

  const preview = (
    <EvaluationFormPreview
      title={title}
      description={description}
      categories={categories}
      headerDisabled
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[92vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            {template ? t("evaluation.dialog.editTitle") : t("evaluation.dialog.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("evaluation.dialog.description")}</DialogDescription>
        </DialogHeader>

        {/* Desktop: split view */}
        <div className="hidden lg:grid grid-cols-2 gap-4 flex-1 min-h-0">
          <div className="h-full overflow-y-auto overscroll-contain pr-3">
            <div className="pb-4">{builder}</div>
          </div>
          <div className="min-h-0 flex flex-col">
            <p className="text-xs font-medium text-muted-foreground mb-2">{t("evaluation.dialog.previewLabel")}</p>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-md border bg-muted/20 p-3">
              <div className="pb-4">{preview}</div>
            </div>
          </div>
        </div>

        {/* Mobile / tablet: tabs */}
        <Tabs defaultValue="build" className="lg:hidden flex-1 min-h-0 flex flex-col">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="build">{t("evaluation.dialog.buildTab")}</TabsTrigger>
            <TabsTrigger value="preview">{t("evaluation.dialog.previewTab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="build" className="flex-1 min-h-0 mt-3 overflow-y-auto overscroll-contain pr-2">
            <div className="pb-4">{builder}</div>
          </TabsContent>
          <TabsContent value="preview" className="flex-1 min-h-0 mt-3 overflow-y-auto overscroll-contain pr-2">
            <div className="pb-4">{preview}</div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saveTemplate.isPending} className="w-full sm:w-auto">
            {saveTemplate.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EvaluationFormDialog;
