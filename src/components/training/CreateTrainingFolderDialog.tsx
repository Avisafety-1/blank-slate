import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateTrainingFolderDialog = ({ open, onOpenChange, onSuccess }: Props) => {
  const { t } = useTranslation();
  const { companyId, user, isSuperAdmin } = useAuth();
  const [name, setName] = useState("");
  const [visibleToChildren, setVisibleToChildren] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !companyId) return;
    setSaving(true);
    const { error } = await supabase.from("training_course_folders" as any).insert({
      name: name.trim(),
      company_id: companyId,
      created_by: user?.id,
      visible_to_children: visibleToChildren,
    });
    setSaving(false);
    if (error) {
      toast.error(t("training.folderDialog.createFailed"));
      return;
    }
    toast.success(t("training.folderDialog.createdSuccess"));
    setName("");
    setVisibleToChildren(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("training.folderDialog.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="folder-name">{t("training.folderDialog.nameLabel")}</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("training.folderDialog.namePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-3">
              <Switch checked={visibleToChildren} onCheckedChange={setVisibleToChildren} id="visible-children" />
              <Label htmlFor="visible-children" className="text-sm">{t("training.folderDialog.visibleToChildren")}</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("training.common.cancel")}</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? t("training.common.saving") : t("training.folderDialog.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
