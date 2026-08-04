import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Pencil, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import EvaluationFormPreview from "@/components/evaluation/EvaluationFormPreview";
import EvaluationFormDialog from "@/components/documents/EvaluationFormDialog";
import { useEvaluationTemplates, type EvaluationTemplate } from "@/hooks/useEvaluationTemplates";

interface Props {
  isAdmin: boolean;
}

export const EvaluationTemplatesSection = ({ isAdmin }: Props) => {
  const { t } = useTranslation();
  const { templates, isLoading, deleteTemplate } = useEvaluationTemplates();
  const [editing, setEditing] = useState<EvaluationTemplate | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [viewing, setViewing] = useState<EvaluationTemplate | null>(null);

  if (isLoading || templates.length === 0) return null;

  const subCount = (tpl: EvaluationTemplate) =>
    tpl.structure.reduce((sum, cat) => sum + (cat.subcategories?.length ?? 0), 0);

  const handleDelete = async (tpl: EvaluationTemplate) => {
    try {
      await deleteTemplate.mutateAsync(tpl.id);
      toast.success(t("evaluation.toasts.deleted"));
    } catch (error: any) {
      toast.error(error.message ?? t("evaluation.errors.saveFailed"));
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5" />
        {t("evaluation.section.title")}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {templates.map((tpl) => (
          <Card key={tpl.id} className="p-4 space-y-3 hover:bg-muted/50 transition-colors">
            <div className="space-y-1">
              <p className="font-medium break-words">{tpl.title}</p>
              {tpl.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 break-words">{tpl.description}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">
                {t("evaluation.section.categoriesCount", { count: tpl.structure.length })}
              </Badge>
              <Badge variant="outline">
                {t("evaluation.section.subcategoriesCount", { count: subCount(tpl) })}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewing(tpl)}>
                <Eye className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">{t("evaluation.section.view")}</span>
              </Button>
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(tpl);
                      setEditOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">{t("common.edit")}</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(tpl)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      <EvaluationFormDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditing(null);
        }}
        template={editing}
      />

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="break-words">{viewing?.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-2">
            {viewing && (
              <EvaluationFormPreview
                title={viewing.title}
                description={viewing.description ?? ""}
                categories={viewing.structure}
                headerDisabled
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EvaluationTemplatesSection;
