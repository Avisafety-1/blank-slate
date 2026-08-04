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
import { Plus, Trash2, ChevronUp, ChevronDown, Globe, Layers } from "lucide-react";
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
  const { isSuperAdmin } = useAuth();
  const { saveTemplate } = useEvaluationTemplates();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [globalVisibility, setGlobalVisibility] = useState(false);
  const [categories, setCategories] = useState<EvaluationCategory[]>([emptyCategory()]);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setTitle(template.title);
      setDescription(template.description ?? "");
      setGlobalVisibility(template.global_visibility);
      setCategories(template.structure.length ? template.structure : [emptyCategory()]);
    } else {
      setTitle("");
      setDescription("");
      setGlobalVisibility(false);
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

      <div className="space-y-3">
        {categories.map((category, index) => (
          <Card key={category.id} className="p-3 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {t("evaluation.builder.categoryLabel", { index: index + 1 })}
                </Label>
                <Input
                  value={category.name}
                  onChange={(e) => updateCategory(category.id, { name: e.target.value })}
                  placeholder={t("evaluation.builder.categoryPlaceholder")}
                />
                <Input
                  value={category.description}
                  onChange={(e) => updateCategory(category.id, { description: e.target.value })}
                  placeholder={t("evaluation.builder.categoryDescriptionPlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => moveCategory(category.id, "up")} disabled={index === 0}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => moveCategory(category.id, "down")} disabled={index === categories.length - 1}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setCategories((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== category.id) : prev))}
                  disabled={categories.length === 1}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="space-y-2 pl-2 border-l-2 border-border">
              {category.subcategories.map((sub, subIndex) => (
                <div key={sub.id} className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={sub.name}
                      onChange={(e) => updateSub(category.id, sub.id, { name: e.target.value })}
                      placeholder={t("evaluation.builder.subcategoryPlaceholder")}
                    />
                    <Textarea
                      value={sub.description}
                      onChange={(e) => updateSub(category.id, sub.id, { description: e.target.value })}
                      placeholder={t("evaluation.builder.subcategoryDescriptionPlaceholder")}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => moveSub(category.id, sub.id, "up")} disabled={subIndex === 0}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => moveSub(category.id, sub.id, "down")} disabled={subIndex === category.subcategories.length - 1}>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        updateCategory(category.id, {
                          subcategories:
                            category.subcategories.length > 1
                              ? category.subcategories.filter((s) => s.id !== sub.id)
                              : category.subcategories,
                        })
                      }
                      disabled={category.subcategories.length === 1}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => updateCategory(category.id, { subcategories: [...category.subcategories, emptySub()] })}
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
          <ScrollArea className="h-full pr-3">
            <div className="pb-4">{builder}</div>
          </ScrollArea>
          <div className="min-h-0 flex flex-col">
            <p className="text-xs font-medium text-muted-foreground mb-2">{t("evaluation.dialog.previewLabel")}</p>
            <ScrollArea className="flex-1 rounded-md border bg-muted/20 p-3">
              <div className="pb-4">{preview}</div>
            </ScrollArea>
          </div>
        </div>

        {/* Mobile / tablet: tabs */}
        <Tabs defaultValue="build" className="lg:hidden flex-1 min-h-0 flex flex-col">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="build">{t("evaluation.dialog.buildTab")}</TabsTrigger>
            <TabsTrigger value="preview">{t("evaluation.dialog.previewTab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="build" className="flex-1 min-h-0 mt-3">
            <ScrollArea className="h-[55vh] pr-2">
              <div className="pb-4">{builder}</div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="preview" className="flex-1 min-h-0 mt-3">
            <ScrollArea className="h-[55vh] pr-2">
              <div className="pb-4">{preview}</div>
            </ScrollArea>
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
